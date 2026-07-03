import { Modal } from "./Modal";
import { useSudoPromptStore } from "../stores/sudoPromptStore";

export function SudoPasswordModal() {
  const open = useSudoPromptStore((s) => s.open);
  const action = useSudoPromptStore((s) => s.action);
  const path = useSudoPromptStore((s) => s.path);
  const password = useSudoPromptStore((s) => s.password);
  const pending = useSudoPromptStore((s) => s.pending);
  const setPassword = useSudoPromptStore((s) => s.setPassword);
  const submit = useSudoPromptStore((s) => s.submit);
  const cancel = useSudoPromptStore((s) => s.cancel);

  if (!open) return null;

  return (
    <Modal title="需要 sudo 权限" onClose={cancel}>
      <form
        className="connection-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="modal-hint">
          {action}需要管理员权限。请输入当前 SSH 用户在服务器上的 sudo 密码。
        </p>
        {path ? <p className="modal-hint preview-panel-path">{path}</p> : null}
        <label>
          sudo 密码
          <input
            type="password"
            value={password}
            disabled={pending}
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="form-row">
          <button type="submit" disabled={pending || !password.trim()}>
            {pending ? "处理中…" : "确认"}
          </button>
          <button type="button" disabled={pending} onClick={cancel}>
            取消
          </button>
        </div>
      </form>
    </Modal>
  );
}
