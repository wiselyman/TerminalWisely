; Kill TerminalWisely.exe and AI sidecar Python that lock runtime DLLs.
; Never match *-setup.exe (installer name contains TerminalWisely).

!macro TWKillSidecarProcesses
  DetailPrint "Stopping TerminalWisely and AI sidecar Python..."

  nsExec::ExecToLog 'taskkill /F /IM TerminalWisely.exe /T'
  Sleep 400

  ; Write kill script without nested quotes (FileWrite is space-split).
  FileOpen $0 "$PLUGINSDIR\tw-kill-ai.ps1" w
  FileWrite $0 "$$ErrorActionPreference = 'SilentlyContinue'$\r$\n"
  FileWrite $0 "Stop-Process -Name TerminalWisely -Force$\r$\n"
  FileWrite $0 "Get-CimInstance Win32_Process | ForEach-Object {$\r$\n"
  FileWrite $0 "  $$name = [string]$$_.Name$\r$\n"
  FileWrite $0 "  $$path = [string]$$_.ExecutablePath$\r$\n"
  FileWrite $0 "  $$cmd = [string]$$_.CommandLine$\r$\n"
  FileWrite $0 "  if ($$name -like '*-setup.exe') { return }$\r$\n"
  FileWrite $0 "  if ($$name -like '*uninstall*') { return }$\r$\n"
  FileWrite $0 "  $$hit = $$false$\r$\n"
  FileWrite $0 "  if ($$name -eq 'TerminalWisely.exe') { $$hit = $$true }$\r$\n"
  FileWrite $0 "  if ($$cmd -like '*uvicorn app.main:app*') { $$hit = $$true }$\r$\n"
  FileWrite $0 "  if ($$path -like '*\TerminalWisely\agent-sidecar\*') { $$hit = $$true }$\r$\n"
  FileWrite $0 "  if ($$path -like '*\TerminalWisely\ai-engineer\runtime\*') { $$hit = $$true }$\r$\n"
  FileWrite $0 "  if ($$path -like '*\com.wangyunfei.terminalwisely\ai-engineer\runtime\*') { $$hit = $$true }$\r$\n"
  FileWrite $0 "  if ($$hit) { Stop-Process -Id $$_.ProcessId -Force }$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0

  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\tw-kill-ai.ps1"'
  Sleep 800
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\tw-kill-ai.ps1"'
  Sleep 1200
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro TWKillSidecarProcesses
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro TWKillSidecarProcesses
!macroend
