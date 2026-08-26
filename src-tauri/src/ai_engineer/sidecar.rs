use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::secrets::load_settings_for_sidecar;

static SIDECAR: OnceLock<Mutex<Option<SidecarState>>> = OnceLock::new();
/// Serialize first-launch Python provisioning (Windows races corrupt venv copies).
static PROVISION: OnceLock<Mutex<()>> = OnceLock::new();

struct SidecarState {
    child: Child,
    info: SidecarInfo,
    /// Windows job with KILL_ON_JOB_CLOSE — orphans die when the app exits.
    #[cfg(windows)]
    _job: WindowsKillJob,
}

#[cfg(windows)]
struct WindowsKillJob(*mut std::ffi::c_void);

#[cfg(windows)]
unsafe impl Send for WindowsKillJob {}

#[cfg(windows)]
impl Drop for WindowsKillJob {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.0);
            }
        }
    }
}

#[cfg(windows)]
fn assign_child_to_kill_job(child: &Child) -> WindowsKillJob {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return WindowsKillJob(std::ptr::null_mut());
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &mut info as *mut _ as *mut _,
            std::mem::size_of_val(&info) as u32,
        );
        if ok == 0 {
            CloseHandle(job);
            return WindowsKillJob(std::ptr::null_mut());
        }
        let process = child.as_raw_handle() as *mut std::ffi::c_void;
        if AssignProcessToJobObject(job, process) == 0 {
            CloseHandle(job);
            return WindowsKillJob(std::ptr::null_mut());
        }
        WindowsKillJob(job)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarInfo {
    pub base_url: String,
    pub token: String,
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct SidecarHttpRequest {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SidecarHttpResponse {
    pub status: u16,
    pub body: String,
    pub content_type: String,
}

fn hide_windows_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd;
}

fn python_command(python: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(python);
    hide_windows_console(&mut cmd);
    cmd
}

fn state() -> &'static Mutex<Option<SidecarState>> {
    SIDECAR.get_or_init(|| Mutex::new(None))
}

fn pick_port() -> AppResult<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(AppError::from)?;
    let port = listener.local_addr().map_err(AppError::from)?.port();
    drop(listener);
    Ok(port)
}

fn resolve_sidecar_script(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("agent-sidecar");
        if candidate.join("app/main.py").exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent-sidecar")
}

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("ai-engineer");
    std::fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir)
}

fn wait_healthy(base_url: &str, attempts: u32) -> bool {
    for _ in 0..attempts {
        if ureq_get_health(base_url).unwrap_or(false) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn ureq_get_health(base_url: &str) -> AppResult<bool> {
    let url = base_url.trim_start_matches("http://");
    let (host_port, _) = url.split_once('/').unwrap_or((url, ""));
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .ok();
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).map_err(AppError::from)?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf).ok();
    Ok(buf.contains("200") && buf.contains("ok"))
}

fn kill_orphan_sidecars(keep_pid: Option<u32>) {
    #[cfg(unix)]
    {
        let output = Command::new("pgrep")
            .args(["-f", "uvicorn app.main:app --host 127.0.0.1"])
            .output();
        let Ok(output) = output else { return };
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let Ok(pid) = line.trim().parse::<u32>() else { continue };
            if keep_pid == Some(pid) {
                continue;
            }
            let _ = Command::new("kill").arg(pid.to_string()).status();
        }
        thread::sleep(Duration::from_millis(150));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let self_pid = std::process::id();
        let keep_pid_clause = keep_pid
            .map(|pid| format!(" if ($_.ProcessId -eq {pid}) {{ return }}"))
            .unwrap_or_default();
        let ps = format!(
            r#"$self = {self_pid}; Get-CimInstance Win32_Process | ForEach-Object {{ if ($_.ProcessId -eq $self) {{ return }}{keep_pid_clause}; $name = [string]$_.Name; $path = [string]$_.ExecutablePath; $cmd = [string]$_.CommandLine; if ($name -like '*-setup.exe') {{ return }}; if ($name -eq 'TerminalWisely.exe') {{ return }}; $hit = $false; if ($cmd -like '*uvicorn app.main:app*') {{ $hit = $true }}; if ($path -like '*\agent-sidecar\runtime\*') {{ $hit = $true }}; if ($path -like '*\ai-engineer\runtime\*') {{ $hit = $true }}; if ($path -like '*\com.wangyunfei.terminalwisely\ai-engineer\runtime\*') {{ $hit = $true }}; if ($hit) {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }} }}"#,
            keep_pid_clause = keep_pid_clause
        );
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps,
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.status();
        thread::sleep(Duration::from_millis(200));
    }
}

/// Stop the managed sidecar and any orphaned AI python processes (install/exit safety).
pub fn stop_sidecar() {
    {
        let mut guard = match state().lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(mut old) = guard.take() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }
    kill_orphan_sidecars(None);
}

fn python_has_runtime_deps(python: &str) -> bool {
    python_has_runtime_deps_with_path(python, None)
}

fn python_has_runtime_deps_with_path(python: &str, pythonpath: Option<&std::path::Path>) -> bool {
    let mut cmd = python_command(python);
    if let Some(path) = pythonpath {
        cmd.env("PYTHONPATH", path_for_command(path));
    }
    cmd.arg("-c")
        .arg("import uvicorn, fastapi, pydantic, httpx, yaml")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn venv_python_path(venv_dir: &std::path::Path) -> PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        let py3 = venv_dir.join("bin").join("python3");
        if py3.exists() {
            py3
        } else {
            venv_dir.join("bin").join("python")
        }
    }
}

/// Windows Command + some Python tools choke on `\\?\` extended paths from canonicalize.
fn path_for_command(path: &std::path::Path) -> String {
    let raw = path.to_string_lossy();
    #[cfg(windows)]
    {
        let stripped = raw
            .strip_prefix(r"\\?\UNC\")
            .map(|rest| format!(r"\\{rest}"))
            .or_else(|| raw.strip_prefix(r"\\?\").map(|s| s.to_string()))
            .unwrap_or_else(|| raw.into_owned());
        return stripped;
    }
    #[cfg(not(windows))]
    {
        raw.into_owned()
    }
}

fn site_packages_dir(data: &std::path::Path) -> PathBuf {
    data.join("site-packages")
}

fn requirements_stamp_hash(req: &std::path::Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let bytes = std::fs::read(req).unwrap_or_default();
    let mut h = DefaultHasher::new();
    bytes.hash(&mut h);
    format!("{:x}", h.finish())
}

/// Move aside then delete so a locked `python.exe` cannot block the next create.
fn clear_dir_for_rebuild(dir: &std::path::Path, log_path: &std::path::Path) {
    if !dir.exists() {
        return;
    }
    let trash = dir.with_file_name(format!(
        "{}.old.{}",
        dir.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("pyenv"),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    match std::fs::rename(dir, &trash) {
        Ok(()) => {
            append_log(
                log_path,
                &format!("[sidecar] moved old env aside → {}", trash.display()),
            );
            for attempt in 0..5 {
                if std::fs::remove_dir_all(&trash).is_ok() {
                    return;
                }
                thread::sleep(Duration::from_millis(150 * (attempt + 1)));
            }
            append_log(
                log_path,
                &format!(
                    "[sidecar] leftover (will retry later): {}",
                    trash.display()
                ),
            );
        }
        Err(e) => {
            append_log(
                log_path,
                &format!(
                    "[sidecar] rename {} failed ({e}); trying remove_dir_all",
                    dir.display()
                ),
            );
            for attempt in 0..5 {
                if std::fs::remove_dir_all(dir).is_ok() {
                    return;
                }
                thread::sleep(Duration::from_millis(200 * (attempt + 1)));
            }
        }
    }
}

fn find_system_python() -> Option<String> {
    for candidate in ["python3", "python"] {
        if python_command(candidate)
            .arg("-c")
            .arg("import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Some(candidate.to_string());
        }
    }
    None
}

fn append_log(log_path: &std::path::Path, line: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = writeln!(f, "{line}");
    }
}

fn emit_bootstrap(app: &AppHandle, phase: &str, detail: &str, progress: u8) {
    let _ = app.emit(
        "ai-sidecar-bootstrap",
        json!({ "phase": phase, "detail": detail, "progress": progress.clamp(0, 100) }),
    );
}

/// Nudge progress during silent pip / IO waits so the UI does not look stuck.
struct BootstrapTicker {
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl BootstrapTicker {
    fn start(
        app: &AppHandle,
        phase: &'static str,
        detail: &'static str,
        start: u8,
        end: u8,
    ) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = stop.clone();
        let app = app.clone();
        let handle = thread::spawn(move || {
            let mut progress = start;
            while !stop_flag.load(Ordering::Relaxed) && progress < end.saturating_sub(1) {
                thread::sleep(Duration::from_millis(320));
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }
                progress = (progress + 1).min(end.saturating_sub(1));
                emit_bootstrap(&app, phase, detail, progress);
            }
        });
        Self {
            stop,
            handle: Some(handle),
        }
    }
}

impl Drop for BootstrapTicker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn pip_progress_detail(line: &str) -> Option<String> {
    let t = line.trim();
    if let Some(rest) = t.strip_prefix("Collecting ") {
        let pkg = rest.split_whitespace().next().unwrap_or(rest);
        return Some(format!("Collecting {pkg}"));
    }
    if let Some(rest) = t.strip_prefix("Downloading ") {
        let pkg = rest.split_whitespace().next().unwrap_or(rest);
        return Some(format!("Downloading {pkg}"));
    }
    if t.starts_with("Installing collected packages") {
        return Some("Installing packages…".into());
    }
    if let Some(rest) = t.strip_prefix("Successfully installed ") {
        let summary: String = rest.split_whitespace().take(3).collect::<Vec<_>>().join(" ");
        let suffix = if rest.split_whitespace().count() > 3 {
            "…"
        } else {
            ""
        };
        return Some(format!("Installed {summary}{suffix}"));
    }
    None
}

fn run_pip_install_with_progress(
    app: &AppHandle,
    log_path: &std::path::Path,
    mut cmd: Command,
    progress_start: u8,
    progress_end: u8,
) -> AppResult<()> {
    emit_bootstrap(
        app,
        "installing_deps",
        "Installing AI dependencies…",
        progress_start,
    );
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());
    hide_windows_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| {
        AppError::msg(format!(
            "AI engine failed to install dependencies: {e}. See {}.",
            log_path.display()
        ))
    })?;
    let mut progress = progress_start;
    let ticker = BootstrapTicker::start(
        app,
        "installing_deps",
        "Installing AI dependencies…",
        progress_start,
        progress_end,
    );
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let line = line.map_err(|e| AppError::msg(e.to_string()))?;
            append_log(log_path, &line);
            if let Some(detail) = pip_progress_detail(&line) {
                progress = (progress + 5).min(progress_end.saturating_sub(1));
                emit_bootstrap(app, "installing_deps", &detail, progress);
            }
        }
    }
    drop(ticker);
    let status = child.wait().map_err(|e| AppError::msg(e.to_string()))?;
    if !status.success() {
        return Err(AppError::msg(format!(
            "AI engine failed to install dependencies. See {}.",
            log_path.display()
        )));
    }
    Ok(())
}

fn find_bundled_python(sidecar_dir: &std::path::Path) -> Option<PathBuf> {
    let runtime = sidecar_dir.join("runtime");
    let candidates = [
        runtime.join("bin").join("python3"),
        runtime.join("bin").join("python"),
        runtime.join("python.exe"),
        runtime.join("python3.exe"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> AppResult<()> {
    std::fs::create_dir_all(dst).map_err(AppError::from)?;
    for entry in std::fs::read_dir(src).map_err(AppError::from)? {
        let entry = entry.map_err(AppError::from)?;
        let ty = entry.file_type().map_err(AppError::from)?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if ty.is_file() {
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).map_err(AppError::from)?;
            }
            std::fs::copy(&from, &to).map_err(AppError::from)?;
        }
    }
    Ok(())
}

/// Windows: run Python from `%APPDATA%\…\ai-engineer\runtime`, not the install tree.
/// Installer overwrites `Local\TerminalWisely\agent-sidecar\runtime` — those files must not stay locked.
fn ensure_windows_managed_python(
    app: &AppHandle,
    sidecar_dir: &std::path::Path,
    log_path: &std::path::Path,
) -> AppResult<Option<String>> {
    let Some(src_py) = find_bundled_python(sidecar_dir) else {
        return Ok(None);
    };
    let data = data_dir(app)?;
    let dest_runtime = data.join("runtime");
    let dest_py = dest_runtime.join("python.exe");
    let stamp_path = data.join("runtime.bundle.stamp");
    let src_runtime = sidecar_dir.join("runtime");
    let src_len = std::fs::metadata(&src_py).map(|m| m.len()).unwrap_or(0);
    let marker = format!(
        "{}:{}",
        requirements_stamp_hash(&requirements_file(sidecar_dir)),
        src_len
    );
    if dest_py.is_file()
        && std::fs::read_to_string(&stamp_path)
            .map(|s| s.trim() == marker)
            .unwrap_or(false)
    {
        return Ok(Some(path_for_command(&dest_py)));
    }

    emit_bootstrap(
        app,
        "creating_venv",
        "Copying AI Python runtime to a private folder…",
        12,
    );
    append_log(
        log_path,
        &format!(
            "[sidecar] copying bundled runtime {} → {}",
            src_runtime.display(),
            dest_runtime.display()
        ),
    );
    // Drop any process still holding the previous private runtime (or install-tree leftovers).
    kill_orphan_sidecars(None);
    clear_dir_for_rebuild(&dest_runtime, log_path);
    copy_dir_recursive(&src_runtime, &dest_runtime)?;
    if !dest_py.is_file() {
        return Err(AppError::msg(format!(
            "AI runtime copy missing python.exe at {}",
            dest_py.display()
        )));
    }
    let _ = std::fs::write(&stamp_path, &marker);
    append_log(
        log_path,
        &format!("[sidecar] managed runtime ready: {}", dest_py.display()),
    );
    Ok(Some(path_for_command(&dest_py)))
}

fn requirements_file(sidecar_dir: &std::path::Path) -> PathBuf {
    let runtime = sidecar_dir.join("requirements-runtime.txt");
    if runtime.is_file() {
        runtime
    } else {
        sidecar_dir.join("requirements.txt")
    }
}

/// App-managed Python: private site-packages (Windows) / venv (Unix) ← bundled ← system.
/// End users never run pip.
fn ensure_python_for_sidecar(app: &AppHandle, sidecar_dir: &std::path::Path) -> AppResult<String> {
    let _guard = PROVISION
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|e| AppError::msg(e.to_string()))?;

    let data = data_dir(app)?;
    let log_path = data.join("sidecar.log");
    let req = requirements_file(sidecar_dir);
    let stamp = data.join("venv.requirements.sha256");
    let req_hash = requirements_stamp_hash(&req);
    let stamp_ok = std::fs::read_to_string(&stamp)
        .map(|s| s.trim() == req_hash)
        .unwrap_or(false);

    emit_bootstrap(app, "checking", "Checking AI runtime…", 8);

    // Prefer a healthy private env from a previous launch.
    if cfg!(windows) {
        let site = site_packages_dir(&data);
        let bootstrap_early = ensure_windows_managed_python(app, sidecar_dir, &log_path)?
            .or_else(find_system_python);
        if let Some(ref py) = bootstrap_early {
            if stamp_ok
                && site.is_dir()
                && python_has_runtime_deps_with_path(py, Some(&site))
            {
                emit_bootstrap(app, "ready", "AI runtime ready", 100);
                return Ok(py.clone());
            }
        }
    } else {
        let venv_dir = data.join("venv");
        let venv_py = venv_python_path(&venv_dir);
        if venv_py.is_file()
            && stamp_ok
            && python_has_runtime_deps(&path_for_command(&venv_py))
        {
            emit_bootstrap(app, "ready", "AI runtime ready", 100);
            return Ok(path_for_command(&venv_py));
        }
    }

    let bootstrap = if cfg!(windows) {
        ensure_windows_managed_python(app, sidecar_dir, &log_path)?
            .or_else(find_system_python)
    } else {
        find_bundled_python(sidecar_dir)
            .map(|p| path_for_command(&p))
            .or_else(find_system_python)
    }
    .ok_or_else(|| {
        AppError::msg(
            "AI engine could not find a Python runtime. Reinstall the app or see sidecar.log."
                .to_string(),
        )
    })?;

    // Dev machines with system deps already installed — skip private env.
    if find_bundled_python(sidecar_dir).is_none() && python_has_runtime_deps(&bootstrap) {
        emit_bootstrap(app, "ready", "Using system Python with deps", 100);
        return Ok(bootstrap);
    }

    if cfg!(windows) {
        ensure_windows_site_packages(app, &data, &log_path, &bootstrap, &req, &req_hash, &stamp)?;
        return Ok(bootstrap);
    }

    ensure_unix_venv(app, &data, &log_path, &bootstrap, &req, &req_hash, &stamp)
}

/// Windows: install deps with `pip --target` so we never copy `python.exe` into Roaming
/// (AV / file locks cause Errno 13 on `venv\Scripts\python.exe`).
fn ensure_windows_site_packages(
    app: &AppHandle,
    data: &std::path::Path,
    log_path: &std::path::Path,
    bootstrap: &str,
    req: &std::path::Path,
    req_hash: &str,
    stamp: &std::path::Path,
) -> AppResult<()> {
    let site = site_packages_dir(data);
    emit_bootstrap(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        20,
    );
    append_log(
        log_path,
        &format!(
            "[sidecar] provisioning site-packages with {bootstrap} → {}",
            site.display()
        ),
    );

    // Drop broken classic venv left by older builds (locks Scripts\\python.exe).
    let prep_ticker = BootstrapTicker::start(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        20,
        28,
    );
    let legacy_venv = data.join("venv");
    if legacy_venv.exists() {
        clear_dir_for_rebuild(&legacy_venv, log_path);
    }
    clear_dir_for_rebuild(&site, log_path);
    std::fs::create_dir_all(&site).map_err(AppError::from)?;
    drop(prep_ticker);
    emit_bootstrap(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        28,
    );

    emit_bootstrap(
        app,
        "installing_pip",
        "Upgrading pip tools…",
        30,
    );
    append_log(
        log_path,
        &format!(
            "[sidecar] auto pip install --target {} -r {}",
            site.display(),
            req.display()
        ),
    );

    let pip_tools_ticker = BootstrapTicker::start(
        app,
        "installing_pip",
        "Upgrading pip tools…",
        30,
        38,
    );
    let _ = python_command(bootstrap)
        .args([
            "-m",
            "pip",
            "install",
            "--upgrade",
            "--target",
            &path_for_command(&site),
            "pip",
            "wheel",
            "setuptools",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    drop(pip_tools_ticker);
    emit_bootstrap(app, "installing_pip", "Upgrading pip tools…", 38);

    let mut pip_cmd = python_command(bootstrap);
    pip_cmd
        .args([
            "-m",
            "pip",
            "install",
            "--target",
            &path_for_command(&site),
            "-r",
        ])
        .arg(path_for_command(req))
        .env("PYTHONPATH", path_for_command(&site));
    run_pip_install_with_progress(app, log_path, pip_cmd, 38, 92)?;

    if !python_has_runtime_deps_with_path(bootstrap, Some(&site)) {
        return Err(AppError::msg(format!(
            "AI dependencies incomplete after install. See {}.",
            log_path.display()
        )));
    }

    let _ = std::fs::write(stamp, req_hash);
    append_log(
        log_path,
        &format!(
            "[sidecar] site-packages ready: {} (python {bootstrap})",
            site.display()
        ),
    );
    emit_bootstrap(app, "ready", "AI runtime ready", 100);
    Ok(())
}

fn ensure_unix_venv(
    app: &AppHandle,
    data: &std::path::Path,
    log_path: &std::path::Path,
    bootstrap: &str,
    req: &std::path::Path,
    req_hash: &str,
    stamp: &std::path::Path,
) -> AppResult<String> {
    let venv_dir = data.join("venv");
    emit_bootstrap(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        20,
    );
    append_log(
        log_path,
        &format!(
            "[sidecar] provisioning venv with {bootstrap} → {}",
            venv_dir.display()
        ),
    );

    clear_dir_for_rebuild(&venv_dir, log_path);
    let venv_ticker = BootstrapTicker::start(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        20,
        28,
    );
    let status = python_command(bootstrap)
        .args(["-m", "venv"])
        .arg(&venv_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| AppError::msg(format!("AI engine failed to create environment: {e}")))?;
    drop(venv_ticker);
    emit_bootstrap(
        app,
        "creating_venv",
        "Preparing private AI Python environment…",
        28,
    );
    if !status.status.success() {
        let err = String::from_utf8_lossy(&status.stderr);
        append_log(log_path, &format!("[sidecar] venv create failed: {err}"));
        return Err(AppError::msg(format!(
            "AI engine failed to create its private environment. See {}.",
            log_path.display()
        )));
    }

    let venv_py = path_for_command(&venv_python_path(&venv_dir));
    if !std::path::Path::new(&venv_py).is_file() {
        return Err(AppError::msg(format!(
            "AI environment python missing at {venv_py}"
        )));
    }

    emit_bootstrap(
        app,
        "installing_pip",
        "Upgrading pip tools…",
        30,
    );
    append_log(
        log_path,
        &format!("[sidecar] auto pip install -r {}", req.display()),
    );

    let pip_tools_ticker = BootstrapTicker::start(
        app,
        "installing_pip",
        "Upgrading pip tools…",
        30,
        38,
    );
    let _ = python_command(&venv_py)
        .args([
            "-m",
            "pip",
            "install",
            "--upgrade",
            "pip",
            "wheel",
            "setuptools",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    drop(pip_tools_ticker);
    emit_bootstrap(app, "installing_pip", "Upgrading pip tools…", 38);

    let mut pip_cmd = python_command(&venv_py);
    pip_cmd.args(["-m", "pip", "install", "-r"]).arg(req);
    run_pip_install_with_progress(app, log_path, pip_cmd, 38, 92)?;

    if !python_has_runtime_deps(&venv_py) {
        return Err(AppError::msg(format!(
            "AI dependencies incomplete after install. See {}.",
            log_path.display()
        )));
    }

    let _ = std::fs::write(stamp, req_hash);
    append_log(log_path, &format!("[sidecar] venv ready: {venv_py}"));
    emit_bootstrap(app, "ready", "AI runtime ready", 100);
    Ok(venv_py)
}

pub fn ensure_sidecar(app: &AppHandle) -> AppResult<SidecarInfo> {
    {
        let guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        if let Some(state) = guard.as_ref() {
            if wait_healthy(&state.info.base_url, 1) {
                return Ok(state.info.clone());
            }
        }
    }

    restart_sidecar(app)
}

/// Kill any live sidecar and spawn a fresh one (picks up new API key / model env).
pub fn restart_sidecar(app: &AppHandle) -> AppResult<SidecarInfo> {
    {
        let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        if let Some(mut old) = guard.take() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }
    kill_orphan_sidecars(None);

    let port = pick_port()?;
    let token = Uuid::new_v4().to_string();
    let sidecar_dir = resolve_sidecar_script(app);
    if !sidecar_dir.join("app/main.py").exists() {
        return Err(AppError::msg(format!(
            "AI sidecar not found at {}",
            sidecar_dir.display()
        )));
    }
    let data = data_dir(app)?;
    let settings = load_settings_for_sidecar(app).unwrap_or_default();
    let python = ensure_python_for_sidecar(app, &sidecar_dir)?;
    let log_path = data.join("sidecar.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(AppError::from)?;
    let log_err = log_file.try_clone().map_err(AppError::from)?;

    let mut cmd = python_command(&python);
    // Windows private deps live in site-packages (pip --target); Unix uses a venv python.
    let site = site_packages_dir(&data);
    if site.is_dir() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let existing = std::env::var_os("PYTHONPATH").unwrap_or_default();
        let mut joined = path_for_command(&site);
        if !existing.is_empty() {
            joined.push_str(sep);
            joined.push_str(&existing.to_string_lossy());
        }
        cmd.env("PYTHONPATH", joined);
    }
    cmd.current_dir(&sidecar_dir)
        .env("TW_AI_TOKEN", &token)
        .env("TW_AI_DATA_DIR", &data)
        .env("TW_AI_PROVIDER", &settings.provider)
        .env("TW_AI_MODEL", &settings.model)
        .env(
            "TW_AI_SECURITY_MODE",
            if settings.security_mode.is_empty() {
                "safe"
            } else {
                &settings.security_mode
            },
        )
        .env(
            "TW_AI_OLLAMA_BASE",
            if settings.ollama_base_url.is_empty() {
                "http://127.0.0.1:11434"
            } else {
                &settings.ollama_base_url
            },
        )
        .arg("-m")
        .arg("uvicorn")
        .arg("app.main:app")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    // Always set (even empty) so we never inherit a stale key from the parent env.
    cmd.env(
        "TW_AI_API_KEY",
        settings.api_key.clone().unwrap_or_default(),
    );
    // Ollama stores its URL in ollama_base_url; OpenAI-compat path is …/v1.
    if settings.provider.eq_ignore_ascii_case("ollama") {
        let ollama = if settings.ollama_base_url.is_empty() {
            "http://127.0.0.1:11434".to_string()
        } else {
            settings.ollama_base_url.trim_end_matches('/').to_string()
        };
        let base = if ollama.ends_with("/v1") {
            ollama
        } else {
            format!("{ollama}/v1")
        };
        cmd.env("TW_AI_BASE_URL", base);
    } else if !settings.base_url.is_empty() {
        cmd.env("TW_AI_BASE_URL", &settings.base_url);
    }

    let child = cmd.spawn().map_err(|e| {
        AppError::msg(format!(
            "AI engine failed to start ({python}): {e}. See sidecar.log."
        ))
    })?;
    #[cfg(windows)]
    let job = assign_child_to_kill_job(&child);
    let pid = child.id();
    let info = SidecarInfo {
        base_url: format!("http://127.0.0.1:{port}"),
        token,
        pid,
    };

    emit_bootstrap(app, "starting", "Starting AI engine…", 95);
    if !wait_healthy(&info.base_url, 50) {
        let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        #[cfg(windows)]
        drop(job);
        return Err(AppError::msg(format!(
            "AI sidecar started but /health failed. See {}",
            log_path.display()
        )));
    }

    let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
    *guard = Some(SidecarState {
        child,
        info: info.clone(),
        #[cfg(windows)]
        _job: job,
    });
    emit_bootstrap(app, "ready", "AI engine ready", 100);
    Ok(info)
}

pub fn get_sidecar_info() -> AppResult<Option<SidecarInfo>> {
    let guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
    Ok(guard.as_ref().map(|s| s.info.clone()))
}

/// Proxy HTTP to the live sidecar (avoids WKWebView fetch stalls / stale FE URLs).
pub fn sidecar_http(app: &AppHandle, req: SidecarHttpRequest) -> AppResult<SidecarHttpResponse> {
    let info = ensure_sidecar(app)?;
    let method = req.method.trim().to_uppercase();
    let path = if req.path.starts_with('/') {
        req.path
    } else {
        format!("/{}", req.path)
    };
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(30_000).max(1_000));
    let host_port = info
        .base_url
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let body = req.body.unwrap_or_default();
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host_port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n",
        token = info.token
    );
    if !body.is_empty() {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).map_err(AppError::from)?;
    if !body.is_empty() {
        stream.write_all(body.as_bytes()).map_err(AppError::from)?;
    }

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(AppError::from)?;
    let raw_str = String::from_utf8_lossy(&raw);
    let (header_part, body_part) = raw_str
        .split_once("\r\n\r\n")
        .or_else(|| raw_str.split_once("\n\n"))
        .unwrap_or((raw_str.as_ref(), ""));
    let status = header_part
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let content_type = header_part
        .lines()
        .find_map(|line| {
            let lower = line.to_ascii_lowercase();
            lower
                .strip_prefix("content-type:")
                .map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| "application/json".into());
    let chunked = header_part.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });
    let body = if chunked {
        decode_chunked_body(body_part)
    } else {
        body_part.to_string()
    };
    Ok(SidecarHttpResponse {
        status,
        body,
        content_type,
    })
}

/// Streamable HTTP (SSE) proxy: read sidecar event-stream and invoke callback per `data:` JSON.
/// Callback returning `false` or error stops the stream early.
pub fn sidecar_sse_stream(
    app: &AppHandle,
    path: &str,
    mut on_event: impl FnMut(serde_json::Value) -> AppResult<bool>,
) -> AppResult<()> {
    let info = ensure_sidecar(app)?;
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let host_port = info
        .base_url
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    // Long-lived stream: generous read timeout; refresh on each read progress.
    stream
        .set_read_timeout(Some(Duration::from_secs(600)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .ok();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host_port}\r\nAuthorization: Bearer {token}\r\nAccept: text/event-stream\r\nConnection: close\r\n\r\n",
        token = info.token
    );
    stream.write_all(request.as_bytes()).map_err(AppError::from)?;

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader.read_line(&mut status_line).map_err(AppError::from)?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let mut headers = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(AppError::from)?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        headers.push_str(&line);
    }
    if status >= 400 {
        let mut err_body = String::new();
        reader.read_to_string(&mut err_body).ok();
        return Err(AppError::msg(format!(
            "sidecar stream HTTP {status}: {}",
            err_body.chars().take(300).collect::<String>()
        )));
    }
    let chunked = headers.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });

    let mut sse_buf = String::new();
    if chunked {
        loop {
            let mut size_line = String::new();
            if reader.read_line(&mut size_line).map_err(AppError::from)? == 0 {
                break;
            }
            let size_hex = size_line.trim().split(';').next().unwrap_or("").trim();
            let Ok(size) = usize::from_str_radix(size_hex, 16) else {
                break;
            };
            if size == 0 {
                break;
            }
            let mut chunk = vec![0u8; size];
            reader.read_exact(&mut chunk).map_err(AppError::from)?;
            // Trailing CRLF after chunk
            let mut crlf = [0u8; 2];
            let _ = reader.read_exact(&mut crlf);
            sse_buf.push_str(&String::from_utf8_lossy(&chunk));
            if !drain_sse_buffer(&mut sse_buf, &mut on_event)? {
                return Ok(());
            }
        }
    } else {
        loop {
            let mut line = String::new();
            let n = reader.read_line(&mut line).map_err(AppError::from)?;
            if n == 0 {
                break;
            }
            sse_buf.push_str(&line);
            if !drain_sse_buffer(&mut sse_buf, &mut on_event)? {
                return Ok(());
            }
        }
    }
    let _ = on_event(json!({
        "type": "stream_end",
        "payload": { "status": "closed" },
        "status": "closed"
    }));
    Ok(())
}

fn drain_sse_buffer(
    buf: &mut String,
    on_event: &mut impl FnMut(serde_json::Value) -> AppResult<bool>,
) -> AppResult<bool> {
    loop {
        let sep = buf
            .find("\r\n\r\n")
            .map(|i| (i, 4))
            .or_else(|| buf.find("\n\n").map(|i| (i, 2)));
        let Some((idx, sep_len)) = sep else {
            return Ok(true);
        };
        let block = buf[..idx].to_string();
        *buf = buf[idx + sep_len..].to_string();
        for line in block.replace("\r\n", "\n").split('\n') {
            let line = line.trim_end();
            if let Some(data) = line.strip_prefix("data:") {
                let payload = data.trim_start();
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(val) => {
                        let stop = val
                            .get("type")
                            .and_then(|t| t.as_str())
                            .is_some_and(|t| t == "stream_end");
                        if !on_event(val)? {
                            return Ok(false);
                        }
                        if stop {
                            return Ok(false);
                        }
                    }
                    Err(_) => {
                        // ignore malformed
                    }
                }
            }
        }
    }
}

fn decode_chunked_body(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while !rest.is_empty() {
        let (size_line, after) = match rest.split_once("\r\n") {
            Some(v) => v,
            None => match rest.split_once('\n') {
                Some(v) => v,
                None => break,
            },
        };
        let size_hex = size_line.trim().split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_hex, 16) else {
            break;
        };
        if size == 0 {
            break;
        }
        if after.len() < size {
            out.push_str(after);
            break;
        }
        out.push_str(&after[..size]);
        rest = &after[size..];
        if let Some(stripped) = rest.strip_prefix("\r\n") {
            rest = stripped;
        } else if let Some(stripped) = rest.strip_prefix('\n') {
            rest = stripped;
        }
    }
    if out.is_empty() {
        input.to_string()
    } else {
        out
    }
}
