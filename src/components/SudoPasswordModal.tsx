import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { useSudoPromptStore } from "../stores/sudoPromptStore";

export function SudoPasswordModal() {
  const { t } = useTranslation("terminal");
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
    <Modal title={t("sudoModalTitle")} onClose={cancel}>
      <form
        className="connection-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="modal-hint">{t("sudoModalHint", { action })}</p>
        {path ? <p className="modal-hint preview-panel-path">{path}</p> : null}
        <label>
          {t("sudoPassword")}
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
            {pending ? t("common:processing") : t("common:confirm")}
          </button>
          <button type="button" disabled={pending} onClick={cancel}>
            {t("common:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
