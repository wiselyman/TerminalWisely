import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureSidecar, listAiModels } from "../../lib/aiEngineer/api";
import type { AiModelProfile } from "../../lib/aiEngineer/api";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { AiEngineerPlatformPanel } from "./AiEngineerPlatformPanel";

/** All types speak OpenAI-compatible HTTP via ModelGateway. */
type ProviderType = "openai" | "anthropic" | "gemini" | "ollama";

type View =
  | { kind: "list" }
  | { kind: "platform" }
  | { kind: "pick_type" }
  | { kind: "edit"; profile: AiModelProfile; isNew: boolean; providerType: ProviderType };

const PROVIDER_PRESETS: Record<
  ProviderType,
  { name: string; provider: string; base_url: string; ollama_base_url: string; model: string }
> = {
  openai: {
    name: "OpenAI compatible",
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    ollama_base_url: "",
    model: "",
  },
  anthropic: {
    name: "Anthropic compatible",
    provider: "anthropic",
    base_url: "",
    ollama_base_url: "",
    model: "",
  },
  gemini: {
    name: "Gemini",
    provider: "gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    ollama_base_url: "",
    model: "",
  },
  ollama: {
    name: "Ollama",
    provider: "ollama",
    base_url: "",
    ollama_base_url: "http://127.0.0.1:11434",
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
  if (provider === "anthropic" || base.includes("anthropic")) return "anthropic";
  if (provider === "gemini" || base.includes("generativelanguage.googleapis")) return "gemini";
  if (provider === "openai" || provider === "deepseek" || base.includes("openai.com")) {
    return "openai";
  }
  // Legacy custom / unknown → OpenAI-compatible
  return "openai";
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

/** Client-side http(s) base URL check before refresh/save. */
function validateHttpBaseUrl(raw: string, label: string): string | null {
  const value = raw.trim();
  if (!value) return `${label} is required`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${label} is not a valid URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${label} must start with http:// or https://`;
  }
  if (!parsed.hostname) return `${label} is missing a host`;
  return null;
}

function profileEndpointError(
  providerType: ProviderType,
  profile: AiModelProfile,
): string | null {
  if (providerType === "ollama") {
    return validateHttpBaseUrl(
      profile.ollama_base_url || "http://127.0.0.1:11434",
      "Ollama base URL",
    );
  }
  return validateHttpBaseUrl(profile.base_url, "Base URL");
}

export function AiEngineerSettings() {
  const { t } = useTranslation("tools");
  const settings = useAiEngineerStore((s) => s.settings);
  const setSettingsOpen = useAiEngineerStore((s) => s.setSettingsOpen);
  const saveSettings = useAiEngineerStore((s) => s.saveSettings);
  const refreshSettings = useAiEngineerStore((s) => s.refreshSettings);

  const [view, setView] = useState<View>({ kind: "list" });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [modelHint, setModelHint] = useState<string | null>(null);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const profiles = settings?.profiles ?? [];
  const activeId = settings?.active_profile_id ?? "";

  const persist = async (next: {
    profiles: AiModelProfile[];
    active_profile_id: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        profiles: next.profiles,
        active_profile_id: next.active_profile_id,
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
    const endpointErr = profileEndpointError(view.providerType, draft);
    if (endpointErr) {
      setError(endpointErr);
      setModelHint(endpointErr);
      return;
    }
    setSaving(true);
    setError(null);
    setModelHint(null);
    try {
      await ensureSidecar();
      const verify = await listAiModels({
        provider: draft.provider,
        base_url: draft.base_url,
        ollama_base_url: draft.ollama_base_url,
        profile_id: view.isNew ? null : draft.id,
        api_key: apiKey || null,
        configured_model: draft.model,
      });
      if (verify.error || verify.models.length === 0) {
        setError(verify.error?.trim() || t("aiEngineer.settings.modelVerifyFailed"));
        return;
      }
      let model = draft.model.trim();
      if (verify.resolved_model?.trim()) {
        model = verify.resolved_model.trim();
      } else if (!verify.models.includes(model)) {
        setError(
          t("aiEngineer.settings.modelNotServed", {
            ids: verify.models.join(", "),
          }),
        );
        return;
      }
      if (verify.auto_corrected) {
        setModelHint(t("aiEngineer.settings.modelAutoCorrected", { model }));
      }
      const others = settings.profiles.filter((p) => p.id !== draft.id);
      const saved: AiModelProfile = {
        ...draft,
        model,
        api_key: apiKey || undefined,
      };
      const nextProfiles = [...others, saved];
      await persist({
        profiles: nextProfiles,
        active_profile_id: settings.active_profile_id || draft.id,
      });
      setApiKey("");
      setView({ kind: "list" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const onRefreshModels = async () => {
    if (view.kind !== "edit") return;
    const endpointErr = profileEndpointError(view.providerType, view.profile);
    if (endpointErr) {
      setError(endpointErr);
      setModelHint(endpointErr);
      setModelOptions([]);
      return;
    }
    setRefreshingModels(true);
    setModelHint(null);
    setError(null);
    try {
      const result = await listAiModels({
        provider: view.profile.provider,
        base_url: view.profile.base_url,
        ollama_base_url: view.profile.ollama_base_url,
        profile_id: view.isNew ? null : view.profile.id,
        api_key: apiKey || null,
        configured_model: view.profile.model,
      });
      if (result.error || result.models.length === 0) {
        const msg =
          result.error?.trim() ||
          t("aiEngineer.settings.refreshEmpty");
        setError(msg);
        setModelHint(msg);
        setModelOptions([]);
        return;
      }
      setError(null);
      setModelHint(
        t("aiEngineer.settings.refreshOk", { count: result.models.length }),
      );
      setModelOptions(result.models);
      const resolved = result.resolved_model?.trim();
      if (resolved) {
        setView({
          ...view,
          profile: { ...view.profile, model: resolved },
        });
        if (result.auto_corrected) {
          setModelHint(
            t("aiEngineer.settings.modelAutoCorrected", { model: resolved }),
          );
        }
      } else if (
        result.models.length === 1 &&
        !view.profile.model.trim()
      ) {
        setView({
          ...view,
          profile: { ...view.profile, model: result.models[0] },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setModelHint(msg);
      setModelOptions([]);
    } finally {
      setRefreshingModels(false);
    }
  };

  const title =
    view.kind === "list"
      ? t("aiEngineer.settings.title")
      : view.kind === "platform"
        ? t("aiEngineer.platform.title")
        : view.kind === "pick_type"
        ? t("aiEngineer.settings.pickType")
        : view.isNew
          ? t("aiEngineer.settings.newProfile")
          : t("aiEngineer.settings.editProfile");

  return (
    <div
      className="ai-engineer-settings-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setSettingsOpen(false);
      }}
      role="presentation"
    >
      <div
        className="ai-engineer-settings ai-engineer-settings-wide"
        onMouseDown={(e) => e.stopPropagation()}
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
                    view.kind === "platform"
                      ? { kind: "list" }
                      : view.kind === "edit" && view.isNew
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
              <button
                type="button"
                className="ai-engineer-text-btn"
                onClick={() => setView({ kind: "platform" })}
              >
                {t("aiEngineer.platform.open")}
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
                            setModelOptions(p.model ? [p.model] : []);
                            setModelHint(null);
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

            <div className="ai-engineer-approval-actions">
              <button
                type="button"
                className="find-panel-run"
                onClick={() => setSettingsOpen(false)}
              >
                {t("aiEngineer.settings.done")}
              </button>
            </div>
          </>
        ) : null}

        {view.kind === "platform" ? (
          <>
            <AiEngineerPlatformPanel />
            <div className="ai-engineer-approval-actions">
              <button
                type="button"
                className="find-panel-run"
                onClick={() => setView({ kind: "list" })}
              >
                {t("aiEngineer.settings.back")}
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
                  setModelOptions([]);
                  setModelHint(null);
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
                  placeholder={
                    view.providerType === "anthropic"
                      ? "https://your-openai-compat-gateway/v1"
                      : view.providerType === "gemini"
                        ? "https://generativelanguage.googleapis.com/v1beta/openai"
                        : "https://api.openai.com/v1"
                  }
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
            <label>
              {t("aiEngineer.settings.model")}
              <div className="ai-engineer-model-field">
                {modelOptions.length > 0 ? (
                  <select
                    value={
                      modelOptions.includes(view.profile.model)
                        ? view.profile.model
                        : view.profile.model.trim()
                          ? view.profile.model
                          : ""
                    }
                    onChange={(e) =>
                      setView({
                        ...view,
                        profile: { ...view.profile, model: e.target.value },
                      })
                    }
                  >
                    <option value="" disabled>
                      {t("aiEngineer.settings.modelPick")}
                    </option>
                    {!modelOptions.includes(view.profile.model) &&
                    view.profile.model.trim() ? (
                      <option value={view.profile.model}>
                        {view.profile.model}
                      </option>
                    ) : null}
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={view.profile.model}
                    onChange={(e) =>
                      setView({
                        ...view,
                        profile: { ...view.profile, model: e.target.value },
                      })
                    }
                    placeholder={t("aiEngineer.settings.modelPlaceholder")}
                  />
                )}
                <button
                  type="button"
                  className="ai-engineer-text-btn"
                  disabled={refreshingModels || saving}
                  onClick={() => void onRefreshModels()}
                >
                  {refreshingModels
                    ? t("aiEngineer.settings.refreshing")
                    : t("aiEngineer.settings.refreshModels")}
                </button>
              </div>
              {modelHint ? (
                <span
                  className={`ai-engineer-model-hint${error ? " is-error" : ""}`}
                >
                  {modelHint}
                </span>
              ) : null}
            </label>
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
