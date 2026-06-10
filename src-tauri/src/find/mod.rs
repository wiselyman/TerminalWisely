mod local;
mod remote;

use crate::error::{AppError, AppResult};
use crate::types::{FindFilesRequest, FindFilesResult};

const MAX_RESULTS: usize = 500;

pub(crate) fn normalize_request(request: &FindFilesRequest) -> AppResult<FindFilesRequest> {
    let path = request.path.trim();
    if path.is_empty() {
        return Err(AppError::msg("搜索路径不能为空"));
    }
    if path.contains('\0') || path.contains('\n') {
        return Err(AppError::msg("搜索路径无效"));
    }

    let name_pattern = request.name_pattern.trim();
    if name_pattern.is_empty() {
        return Err(AppError::msg("文件名模式不能为空"));
    }
    if name_pattern.contains('\0') || name_pattern.contains('\n') {
        return Err(AppError::msg("文件名模式无效"));
    }

    let max_depth = request.max_depth.clamp(1, 32);

    Ok(FindFilesRequest {
        session_id: request.session_id.clone(),
        path: path.to_string(),
        name_pattern: name_pattern.to_string(),
        type_filter: request.type_filter.clone(),
        max_depth,
        case_insensitive: request.case_insensitive,
    })
}

pub async fn find_remote_files(
    handle: std::sync::Arc<tokio::sync::Mutex<russh::client::Handle<crate::ssh::client::ClientHandler>>>,
    start_path: &str,
    request: FindFilesRequest,
) -> AppResult<FindFilesResult> {
    remote::find_files(handle, start_path, request, MAX_RESULTS).await
}

pub fn find_local_files(start_path: &str, request: FindFilesRequest) -> AppResult<FindFilesResult> {
    #[cfg(unix)]
    {
        local::find_files(start_path, request, MAX_RESULTS)
    }
    #[cfg(not(unix))]
    {
        let _ = (start_path, request);
        Err(AppError::msg(
            "本地 Windows 会话暂不支持 find 命令，请连接 Linux SSH 主机后使用",
        ))
    }
}
