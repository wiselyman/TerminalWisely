import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import {
  k8sReadKubeconfig,
  k8sUpdateKubeconfig,
} from "../../lib/k8s/api";
import type { K8sClusterTarget } from "../../lib/k8s/types";
import { useK8sStore } from "../../stores/k8sStore";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../../lib/formatAppError";

type Props = {
  cluster: K8sClusterTarget;
  onClose: () => void;
};

export function EditK8sClusterModal({ cluster, onClose }: Props) {
  const { t } = useTranslation(["k8s", "common"]);
  const pushToast = useToastStore((s) => s.pushToast);
  const refreshClusters = useK8sStore((s) => s.refreshClusters);
  const selectCluster = useK8sStore((s) => s.selectCluster);
  const [name, setName] = useState(cluster.display_name);
  const [yaml, setYaml] = useState("");
  const [loadingYaml, setLoadingYaml] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const path = cluster.kubeconfig_path?.trim() || "";

  useEffect(() => {
    let cancelled = false;
    setLoadingYaml(true);
    setLoadError(null);
    void k8sReadKubeconfig(path)
      .then((text) => {
        if (!cancelled) setYaml(text);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(formatAppError(err) || t("editClusterLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingYaml(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, t]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !path || !yaml.trim()) return;
    setBusy(true);
    try {
      await k8sUpdateKubeconfig(path, {
        displayName: trimmedName,
        yaml,
      });
      await refreshClusters();
      selectCluster(cluster.id);
      pushToast(t("editClusterOk"), true);
      onClose();
    } catch (err) {
      pushToast(
        formatAppError(err) || t("editClusterFailed"),
        false,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("editClusterTitle")} onClose={onClose}>
      <form className="k8s-add-cluster connection-form" onSubmit={(e) => void onSave(e)}>
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
        <p className="k8s-edit-path" title={path}>
          {path}
        </p>
        <label>
          {t("editClusterYaml")}
          {loadingYaml ? (
            <p className="k8s-loading">{t("loading")}</p>
          ) : loadError ? (
            <p className="k8s-error">{loadError}</p>
          ) : (
            <textarea
              className="k8s-add-yaml"
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              spellCheck={false}
              rows={18}
            />
          )}
        </label>
        <div className="form-row">
          <button
            type="submit"
            disabled={busy || loadingYaml || Boolean(loadError) || !name.trim() || !yaml.trim()}
          >
            {t("common:save")}
          </button>
          <button type="button" onClick={onClose}>
            {t("common:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
