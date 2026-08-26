import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { useK8sStore } from "../../stores/k8sStore";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../../lib/formatAppError";

type Props = {
  onClose: () => void;
};

export function AddK8sClusterModal({ onClose }: Props) {
  const { t } = useTranslation(["k8s", "common"]);
  const pushToast = useToastStore((s) => s.pushToast);
  const importKubeconfig = useK8sStore((s) => s.importKubeconfig);
  const importKubeconfigYaml = useK8sStore((s) => s.importKubeconfigYaml);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [name, setName] = useState("");
  const [yaml, setYaml] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const nameReady = trimmedName.length > 0;

  const pickFile = async () => {
    if (!nameReady) return;
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        title: t("addClusterPickFile"),
        filters: [
          {
            name: "kubeconfig",
            extensions: ["yaml", "yml", "conf", "config"],
          },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      await importKubeconfig(selected, trimmedName);
      pushToast(t("importOk"), true);
      onClose();
    } catch (err) {
      pushToast(
        formatAppError(err) || t("importFailed") || t("kubectlRequired"),
        false,
      );
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async (event: FormEvent) => {
    event.preventDefault();
    if (!nameReady || !yaml.trim()) return;
    setBusy(true);
    try {
      await importKubeconfigYaml(yaml, trimmedName);
      pushToast(t("importOk"), true);
      onClose();
    } catch (err) {
      pushToast(
        formatAppError(err) || t("importFailed") || t("kubectlRequired"),
        false,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("addClusterTitle")} onClose={onClose}>
      <div className="k8s-add-cluster">
        <label className="k8s-add-name">
          {t("addClusterName")}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("addClusterNamePlaceholder")}
            autoFocus
            required
          />
        </label>
        <div className="k8s-add-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={tab === "file" ? "active" : ""}
            aria-selected={tab === "file"}
            onClick={() => setTab("file")}
          >
            {t("addClusterFromFile")}
          </button>
          <button
            type="button"
            role="tab"
            className={tab === "paste" ? "active" : ""}
            aria-selected={tab === "paste"}
            onClick={() => setTab("paste")}
          >
            {t("addClusterPaste")}
          </button>
        </div>
        {tab === "file" ? (
          <div className="k8s-add-file">
            <button
              type="button"
              className="find-panel-run primary"
              disabled={busy || !nameReady}
              onClick={() => void pickFile()}
            >
              {t("addClusterPickFile")}
            </button>
            <div className="form-row">
              <button type="button" onClick={onClose}>
                {t("common:cancel")}
              </button>
            </div>
          </div>
        ) : (
          <form className="connection-form" onSubmit={(e) => void onPaste(e)}>
            <label>
              {t("addClusterPasteLabel")}
              <textarea
                className="k8s-add-yaml"
                value={yaml}
                onChange={(e) => setYaml(e.target.value)}
                spellCheck={false}
                rows={16}
                placeholder={"apiVersion: v1\nkind: Config\n..."}
              />
            </label>
            <div className="form-row">
              <button type="submit" disabled={busy || !nameReady || !yaml.trim()}>
                {t("addClusterSubmit")}
              </button>
              <button type="button" onClick={onClose}>
                {t("common:cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
