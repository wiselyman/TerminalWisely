import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RISK_CODES, riskDescKey, riskLabelKey } from "../../lib/aiEngineer/riskLabels";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import type { AiModelProfile } from "../../lib/aiEngineer/api";

const SECURITY_MODES = ["observe", "safe", "autonomous", "production"] as const;

type ProviderType = "openai" | "deepseek" | "ollama" | "custom";

type View =
  | { kind: "list" }
  | { kind: "pick_type" }
  | { kind: "edit"; profile: AiModelProfile; isNew: boolean; providerType: ProviderType };

const PROVIDER_PRESETS: Record<
  ProviderType,
  { name: string; provider: string; base_url: string; ollama_base_url: string; model: string }
> = {
  openai: {
    name: "OpenAI",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    ollama_base_url: "",
    model: "gpt-4o-mini",
  },
  deepseek: {
    name: "DeepSeek",
    provider: "deepseek",
    base_url: "https://api.deepseek.com",
    ollama_base_url: "",
    model: "deepseek-chat",
  },
  ollama: {
    name: "Ollama",
    provider: "ollama",
    base_url: "",
    ollama_base_url: "http://127.0.0.1:11434",
    model: "llama3.2",
  },
  custom: {
    name: "Custom",
    provider: "openai",
    base_url: "",
    ollama_base_url: "",
    model: "",
  },
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferType(p: AiModelProfile): ProviderType {
  const provider = (p.provider || "").toLowerCase();
  const base = (p.base_url || "").toLowerCase();
  if (provider === "ollama" || p.ollama_base_url) return "ollama";
  if (provider === "deepseek" || base.includes("deepseek")) return "deepseek";
  if (provider === "openai" || base.includes("openai.com")) return "openai";
  return "custom";
}

function blankFromType(type: ProviderType): AiModelProfile {
  const preset = PROVIDER_PRESETS[type];
  return {
    id: newId(),
    name: preset.name,
    provider: preset.provider,
    model: preset.model,
    base_url: preset.base_url,
    ollama_base_url: preset.ollama_base_url,
    has_api_key: false,
  };
}

export function AiEngineerSettings() {
  const { t } = useTranslation("tools");
  const settings = useAiEngineerStore((s) => s.settings);
  const setSettingsOpen = useAiEngineerStore((s) => s.setSettingsOpen);
  const saveSettings = useAiEngineerStore((s) => s.saveSettings);
  const refreshSettings = useAiEngineerStore((s) => s.refreshSettings);

  const [view, setView] = useState<View>({ kind: "list" });
  const [securityMode, setSecurityMode] = useState("safe");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (!settings) return;
    setSecurityMode(settings.security_mode || "safe");
  }, [settings]);

  const profiles = settings?.profiles ?? [];
  const activeId = settings?.active_profile_id ?? "";

  const persist = async (next: {
    profiles: AiModelProfile[];
    active_profile_id: string;
    security_mode?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        profiles: next.profiles,
        active_profile_id: next.active_profile_id,
        security_mode: next.security_mode ?? securityMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const onSetActive = async (id: string) => {
    if (!settings) return;
    await persist({
      profiles: settings.profiles,
      active_profile_id: id,
    });
  };

  const onDelete = async (id: string) => {
    if (!settings) return;
    const next = settings.profiles.filter((p) => p.id !== id);
    const active =
      settings.active_profile_id === id
        ? next[0]?.id ?? ""
        : settings.active_profile_id;
    await persist({ profiles: next, active_profile_id: active });
    if (view.kind === "edit" && view.profile.id === id) {
      setView({ kind: "list" });
      setApiKey("");
    }
  };

  const onSaveProfile = async () => {
    if (view.kind !== "edit" || !settings) return;
    const draft = view.profile;
    if (!draft.name.trim()) {
      setError(t("aiEngineer.settings.nameRequired"));
      return;
    }
    if (!draft.model.trim()) {
      setError(t("aiEngineer.settings.modelRequired"));
      return;
    }
    const others = settings.profiles.filter((p) => p.id !== draft.id);
    const saved: AiModelProfile = {
      ...draft,
      api_key: apiKey || undefined,
    };
    const nextProfiles = [...others, saved];
    await persist({
      profiles: nextProfiles,
      active_profile_id: settings.active_profile_id || draft.id,
    });
    setApiKey("");
    setView({ kind: "list" });
  };

  const onSaveSecurity = async () => {
    if (!settings) return;
    await persist({
      profiles: settings.profiles,
      active_profile_id: settings.active_profile_id,
      security_mode: securityMode,
    });
  };

  const title =
    view.kind === "list"
      ? t("aiEngineer.settings.title")
      : view.kind === "pick_type"
        ? t("aiEngineer.settings.pickType")
        : view.isNew
          ? t("aiEngineer.settings.newProfile")
          : t("aiEngineer.settings.editProfile");

  return (
    <div
      className="ai-engineer-settings-overlay"
      onClick={() => setSettingsOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setSettingsOpen(false);
      }}
      role="presentation"
    >
      <div
        className="ai-engineer-settings ai-engineer-settings-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="ai-engineer-settings-head">
          <div className="ai-engineer-settings-head-left">
            {view.kind !== "list" ? (
              <button
                type="button"
                className="ai-engineer-icon-btn"
                onClick={() => {
                  setError(null);
                  setApiKey("");
                  setView(
                    view.kind === "edit" && view.isNew
                      ? { kind: "pick_type" }
                      : { kind: "list" },
                  );
                }}
                aria-label="Back"
              >
                ←
              </button>
            ) : null}
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            className="ai-engineer-icon-btn"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="ai-engineer-settings-body">
        {error ? <p className="ai-engineer-settings-error">{error}</p> : null}

        {view.kind === "list" ? (
          <>
            <div className="ai-engineer-settings-toolbar">
              <button
                type="button"
                className="find-panel-run"
                onClick={() => setView({ kind: "pick_type" })}
              >
                {t("aiEngineer.settings.new")}
              </button>
            </div>

            {profiles.length === 0 ? (
              <p className="find-panel-empty">{t("aiEngineer.settings.empty")}</p>
            ) : (
              <ul className="ai-engineer-profile-list">
                {profiles.map((p) => {
                  const active = p.id === activeId;
                  return (
                    <li key={p.id} className={`ai-engineer-profile-row${active ? " active" : ""}`}>
                      <div className="ai-engineer-profile-meta">
                        <div className="ai-engineer-profile-name">
                          {p.name}
                          {active ? (
                            <span className="ai-engineer-profile-badge">
                              {t("aiEngineer.settings.active")}
                            </span>
                          ) : null}
                        </div>
                        <div className="ai-engineer-profile-sub">
                          {p.provider} · {p.model || "—"}
                          {p.has_api_key ? ` · ${t("aiEngineer.settings.keySaved")}` : ""}
                        </div>
                      </div>
                      <div className="ai-engineer-profile-actions">
                        {!active ? (
                          <button
                            type="button"
                            className="ai-engineer-text-btn"
                            disabled={saving}
                            onClick={() => void onSetActive(p.id)}
                          >
                            {t("aiEngineer.settings.use")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ai-engineer-text-btn"
                          onClick={() => {
                            setApiKey("");
                            setError(null);
                            setView({
                              kind: "edit",
                              profile: { ...p },
                              isNew: false,
                              providerType: inferType(p),
                            });
                          }}
                        >
                          {t("aiEngineer.settings.edit")}
                        </button>
                        <button
                          type="button"
                          className="ai-engineer-text-btn danger"
                          disabled={saving || profiles.length <= 1}
                          onClick={() => void onDelete(p.id)}
                        >
                          {t("aiEngineer.settings.delete")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <section className="ai-engineer-settings-security-block">
              <label className="ai-engineer-settings-security">
                {t("aiEngineer.settings.securityMode")}
                <select
                  value={securityMode}
                  onChange={(e) => setSecurityMode(e.target.value)}
                >
                  {SECURITY_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`aiEngineer.settings.securityModeOption.${m}.label`)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="ai-engineer-settings-security-hint">
                {t(`aiEngineer.settings.securityModeOption.${securityMode}.desc`)}
              </p>
            </section>

            <section
              className="ai-engineer-settings-risk-guide"
              aria-label={t("aiEngineer.settings.riskGuideTitle")}
            >
              <h4 className="ai-engineer-settings-risk-guide-title">
                {t("aiEngineer.settings.riskGuideTitle")}
              </h4>
              <p className="ai-engineer-settings-risk-guide-intro">
                {t("aiEngineer.settings.riskGuideIntro")}
              </p>
              <ul className="ai-engineer-settings-risk-list">
                {RISK_CODES.map((code) => (
                  <li key={code} className="ai-engineer-settings-risk-row">
                    <span className="ai-engineer-settings-risk-badge" title={code}>
                      {t(riskLabelKey(code))}
                    </span>
                    <span className="ai-engineer-settings-risk-text">
                      {t(riskDescKey(code))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="ai-engineer-approval-actions">
              <button
                type="button"
                className="find-panel-run"
                disabled={saving}
                onClick={() => {
                  void onSaveSecurity()
                    .then(() => setSettingsOpen(false))
                    .catch(() => undefined);
                }}
              >
                {t("aiEngineer.settings.done")}
              </button>
            </div>
          </>
        ) : null}

        {view.kind === "pick_type" ? (
          <div className="ai-engineer-type-grid">
            {(Object.keys(PROVIDER_PRESETS) as ProviderType[]).map((type) => (
              <button
                key={type}
                type="button"
                className="ai-engineer-type-card"
                onClick={() => {
                  setApiKey("");
                  setError(null);
                  setView({
                    kind: "edit",
                    profile: blankFromType(type),
                    isNew: true,
                    providerType: type,
                  });
                }}
              >
                <strong>{t(`aiEngineer.settings.type.${type}`)}</strong>
                <span>{t(`aiEngineer.settings.typeHint.${type}`)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {view.kind === "edit" ? (
          <>
            <p className="ai-engineer-settings-type-tag">
              {t(`aiEngineer.settings.type.${view.providerType}`)}
            </p>
            <label>
              {t("aiEngineer.settings.name")}
              <input
                value={view.profile.name}
                onChange={(e) =>
                  setView({
                    ...view,
                    profile: { ...view.profile, name: e.target.value },
                  })
                }
              />
            </label>
            {view.providerType === "custom" ? (
              <label>
                {t("aiEngineer.settings.provider")}
                <input
                  value={view.profile.provider}
                  onChange={(e) =>
                    setView({
                      ...view,
                      profile: { ...view.profile, provider: e.target.value },
                    })
                  }
                />
              </label>
            ) : null}
            <label>
              {t("aiEngineer.settings.model")}
              <input
                value={view.profile.model}
                onChange={(e) =>
                  setView({
                    ...view,
                    profile: { ...view.profile, model: e.target.value },
                  })
                }
                placeholder={
                  view.providerType === "ollama" ? "llama3.2" : "model id"
                }
              />
            </label>
            {view.providerType === "ollama" ? (
              <label>
                {t("aiEngineer.settings.ollamaBase")}
                <input
                  value={view.profile.ollama_base_url}
                  onChange={(e) =>
                    setView({
                      ...view,
                      profile: { ...view.profile, ollama_base_url: e.target.value },
                    })
                  }
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
            ) : (
              <label>
                {t("aiEngineer.settings.baseUrl")}
                <input
                  value={view.profile.base_url}
                  onChange={(e) =>
                    setView({
                      ...view,
                      profile: { ...view.profile, base_url: e.target.value },
                    })
                  }
                  placeholder="https://api.openai.com/v1"
                />
              </label>
            )}
            {view.providerType !== "ollama" ? (
              <label>
                {t("aiEngineer.settings.apiKey")}
                {view.profile.has_api_key
                  ? ` (${t("aiEngineer.settings.keySaved")})`
                  : ""}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("aiEngineer.settings.apiKeyPlaceholder")}
                  autoComplete="off"
                />
              </label>
            ) : null}
            <div className="ai-engineer-approval-actions">
              <button
                type="button"
                className="find-panel-run"
                disabled={saving}
                onClick={() => void onSaveProfile()}
              >
                {t("aiEngineer.settings.saveProfile")}
              </button>
            </div>
          </>
        ) : null}
        </div>
      </div>
    </div>
  );
}
