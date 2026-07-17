import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  initialParamValues,
  resolveCommandText,
  validateParamValues,
} from "../lib/commandTemplate";
import {
  localizeCommandDescription,
  localizeCommandTitle,
  localizeParamLabel,
} from "../lib/localizeCommand";
import type { CommandTemplate } from "../types";
import { useProcessList } from "../hooks/useProcessList";
import { usePasswdAccounts } from "../hooks/usePasswdAccounts";
import { useSystemdUnits } from "../hooks/useSystemdUnits";
import { useCommandNavigatorStore } from "../stores/commandNavigatorStore";
import { useToastStore } from "../stores/toastStore";
import { Modal } from "./Modal";
import { AccountSelect } from "./AccountSelect";
import { ChmodModeInput } from "./ChmodModeInput";
import { PathInput } from "./PathInput";
import { PortInput } from "./PortInput";
import { ProcessSelect } from "./ProcessSelect";
import { SearchKeywordInput } from "./SearchKeywordInput";
import { SearchableSelect } from "./SearchableSelect";

interface CommandRunDialogProps {
  sessionId: string;
  command: CommandTemplate;
}

export function CommandRunDialog({ sessionId, command }: CommandRunDialogProps) {
  const { t } = useTranslation("commands");
  const closeRunDialog = useCommandNavigatorStore((s) => s.closeRunDialog);
  const insertCommand = useCommandNavigatorStore((s) => s.insertCommand);
  const pushToast = useToastStore((s) => s.pushToast);
  const [values, setValues] = useState(() => initialParamValues(command));
  const [submitting, setSubmitting] = useState(false);

  const needsSystemdUnits = useMemo(
    () => command.params.some((param) => param.inputKind === "systemd-unit"),
    [command.params],
  );
  const needsProcessList = useMemo(
    () =>
      command.params.some(
        (param) =>
          param.inputKind === "process-pid" || param.inputKind === "process-name",
      ),
    [command.params],
  );
  const needsPasswdAccounts = useMemo(
    () =>
      command.params.some(
        (param) =>
          param.inputKind === "unix-user" || param.inputKind === "unix-group",
      ),
    [command.params],
  );
  const { units, loading: unitsLoading } = useSystemdUnits(
    sessionId,
    needsSystemdUnits,
  );
  const { processes, loading: processesLoading } = useProcessList(
    sessionId,
    needsProcessList,
  );
  const { accounts, loading: accountsLoading } = usePasswdAccounts(
    sessionId,
    needsPasswdAccounts,
  );

  const preview = useMemo(
    () => resolveCommandText(command, values),
    [command, values],
  );

  const handleSubmit = async () => {
    const error = validateParamValues(command.params, values);
    if (error) {
      pushToast(error, false);
      return;
    }
    setSubmitting(true);
    try {
      await insertCommand(sessionId, preview);
      closeRunDialog();
    } catch (err) {
      pushToast(String(err), false);
    } finally {
      setSubmitting(false);
    }
  };

  const description = localizeCommandDescription(command);

  return (
    <Modal title={localizeCommandTitle(command)} onClose={closeRunDialog}>
      {description ? <p className="cmd-run-desc">{description}</p> : null}

      {command.params.length > 0 ? (
        <div className="cmd-run-fields">
          {command.params.map((param) => (
            <label key={param.name} className="cmd-run-field">
              <span>{localizeParamLabel(param.name, param.label)}</span>
              {param.inputKind === "systemd-unit" ? (
                <SearchableSelect
                  value={values[param.name] ?? ""}
                  options={units}
                  loading={unitsLoading}
                  placeholder={param.placeholder ?? t("run.placeholderService")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "path" ? (
                <PathInput
                  sessionId={sessionId}
                  value={values[param.name] ?? ""}
                  placeholder={param.placeholder ?? t("run.placeholderPath")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "process-pid" ? (
                <ProcessSelect
                  value={values[param.name] ?? ""}
                  processes={processes}
                  loading={processesLoading}
                  placeholder={param.placeholder ?? t("run.placeholderProcessPid")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "process-name" ? (
                <ProcessSelect
                  pick="name"
                  value={values[param.name] ?? ""}
                  processes={processes}
                  loading={processesLoading}
                  placeholder={param.placeholder ?? t("run.placeholderProcessName")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "chmod-mode" ? (
                <ChmodModeInput
                  value={values[param.name] ?? ""}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "unix-user" ? (
                <AccountSelect
                  kind="user"
                  value={values[param.name] ?? ""}
                  users={accounts.users}
                  groups={accounts.groups}
                  loading={accountsLoading}
                  placeholder={t("run.placeholderUser")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "unix-group" ? (
                <AccountSelect
                  kind="group"
                  value={values[param.name] ?? ""}
                  users={accounts.users}
                  groups={accounts.groups}
                  loading={accountsLoading}
                  optional={param.required === false}
                  placeholder={t("run.placeholderKeepGroup")}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "search-keyword" && param.keywordVariant ? (
                <SearchKeywordInput
                  variant={param.keywordVariant}
                  value={values[param.name] ?? ""}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : param.inputKind === "port" ? (
                <PortInput
                  value={values[param.name] ?? ""}
                  optional={param.required === false}
                  onChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: next,
                    }))
                  }
                />
              ) : (
                <input
                  type="text"
                  value={values[param.name] ?? ""}
                  placeholder={param.placeholder}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [param.name]: event.target.value,
                    }))
                  }
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

      <div className="cmd-run-preview">
        <span className="cmd-run-preview-label">{t("run.previewLabel")}</span>
        <code>{preview}</code>
      </div>

      <div className="cmd-run-actions">
        <button type="button" className="preview-action-btn" onClick={closeRunDialog}>
          {t("common:cancel")}
        </button>
        <button
          type="button"
          className="preview-action-btn preview-action-btn-primary"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {t("run.insertToTerminal")}
        </button>
      </div>
    </Modal>
  );
}
