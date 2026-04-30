"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileJson,
  History,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import type {
  ConfigVersionSummary,
  DraftConfigResult,
} from "@/lib/config/repository";
import {
  safeParseAppConfig,
  type AppConfig,
  type AppInstruction,
  type CalculationCustomKey,
  type CalculationPreset,
  type CustomOption,
  type Language,
  type LocalizedText,
} from "@/lib/config/schema";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import { calculateVesatot, type PeriodEntry, vesetTypeLabel } from "@/lib/veset";
import { text } from "@/lib/i18n";

type Status = "idle" | "saving" | "publishing" | "rolling-back";

const PREVIEW_ENTRIES: PeriodEntry[] = [
  { id: "preview-1", date: "2026-01-05", onah: "day" },
  { id: "preview-2", date: "2026-02-02", onah: "night" },
];

const CUSTOM_KEY_OPTIONS: Array<[CalculationCustomKey, string]> = [
  ["includeDay31", "Day 31"],
  ["onahBeinonit24h", "24-hour Onah Beinonit"],
  ["includeOrZarua", "Or Zarua"],
  ["chabadHaflagah", "Onah-based Haflagah"],
];

export function AdminDashboard({
  initialDraft,
  initialVersions,
  userEmail,
}: {
  initialDraft: DraftConfigResult;
  initialVersions: ConfigVersionSummary[];
  userEmail: string;
}) {
  const [config, setConfig] = useState<AppConfig>(initialDraft.config);
  const [versions, setVersions] = useState(initialVersions);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialDraft.config, null, 2));
  const [showJson, setShowJson] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => safeParseAppConfig(config), [config]);
  const previewPreset = useMemo(() => buildPresetWithDefaultOptions(config), [config]);
  const unusedCustomKeyCount = CUSTOM_KEY_OPTIONS.filter(
    ([key]) => !config.customOptions.some((option) => option.customKey === key),
  ).length;
  const preview = useMemo(
    () => calculateVesatot(PREVIEW_ENTRIES, previewPreset, config.defaultLanguage),
    [previewPreset, config.defaultLanguage],
  );

  function updateConfig(next: AppConfig) {
    setConfig(next);
    setJsonText(JSON.stringify(next, null, 2));
  }

  async function saveDraft() {
    const parsed = safeParseAppConfig(config);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join("; "));
      return;
    }

    setStatus("saving");
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/config/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: parsed.data }),
    });
    const payload = await response.json();
    setStatus("idle");

    if (!response.ok) {
      setError(payload.error || "Unable to save draft.");
      return;
    }

    setNotice("Draft saved.");
    updateConfig(payload.config);
  }

  async function publishDraft() {
    setStatus("publishing");
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/config/publish", { method: "POST" });
    const payload = await response.json();
    setStatus("idle");

    if (!response.ok) {
      setError(payload.error || "Unable to publish draft.");
      return;
    }

    setNotice(`Published config version ${payload.version}.`);
    await refreshVersions();
  }

  async function rollback(version: number) {
    setStatus("rolling-back");
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/config/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    const payload = await response.json();
    setStatus("idle");

    if (!response.ok) {
      setError(payload.error || "Unable to roll back.");
      return;
    }

    setNotice(`Rolled active config back to version ${version}.`);
    await refreshVersions();
  }

  async function refreshVersions() {
    const response = await fetch("/api/admin/config/versions", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { versions: ConfigVersionSummary[] };
    setVersions(payload.versions);
  }

  function applyJson() {
    try {
      const parsedJson = JSON.parse(jsonText);
      const parsed = safeParseAppConfig(parsedJson);
      if (!parsed.success) {
        setError(parsed.error.issues.map((issue) => issue.message).join("; "));
        return;
      }

      setConfig(parsed.data);
      setError(null);
      setNotice("JSON applied to the draft editor.");
    } catch (jsonError) {
      setError(jsonError instanceof Error ? jsonError.message : "Invalid JSON.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/90 p-5 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-cedar">Admin Panel</p>
          <h1 className="mt-1 text-3xl font-bold">Configuration Control</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as <span className="font-semibold">{userEmail}</span>. Draft source:{" "}
            {initialDraft.source}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={Save} disabled={status !== "idle"} onClick={saveDraft}>
            {status === "saving" ? "Saving..." : "Save Draft"}
          </ActionButton>
          <ActionButton icon={Send} disabled={status !== "idle" || !validation.success} onClick={publishDraft}>
            {status === "publishing" ? "Publishing..." : "Publish"}
          </ActionButton>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </header>

      {notice && (
        <p className="rounded-2xl border border-cedar/20 bg-cedar/10 p-3 text-sm font-semibold text-cedar">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-2xl border border-berry/20 bg-berry/10 p-3 text-sm font-semibold text-berry">
          {error}
        </p>
      )}

      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Panel title="Release Basics">
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="Version label"
                value={config.versionLabel}
                onChange={(value) => updateConfig({ ...config, versionLabel: value })}
              />
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Default language</span>
                <select
                  value={config.defaultLanguage}
                  onChange={(event) =>
                    updateConfig({ ...config, defaultLanguage: event.target.value as Language })
                  }
                  className="focus-ring w-full rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <option value="en">English</option>
                  <option value="he">Hebrew</option>
                </select>
              </label>
            </div>
          </Panel>

          <Panel title="Public App Text">
            <div className="grid gap-4 lg:grid-cols-2">
              <LocalizedInput
                label="App title"
                value={config.appText.appTitle}
                onChange={(value) =>
                  updateConfig({ ...config, appText: { ...config.appText, appTitle: value } })
                }
              />
              <LocalizedInput
                label="Privacy note"
                value={config.appText.privacyNote}
                onChange={(value) =>
                  updateConfig({ ...config, appText: { ...config.appText, privacyNote: value } })
                }
              />
              <LocalizedTextarea
                label="Guidance notice"
                value={config.appText.guidanceNotice}
                onChange={(value) =>
                  updateConfig({ ...config, appText: { ...config.appText, guidanceNotice: value } })
                }
              />
              <LocalizedTextarea
                label="Empty state"
                value={config.appText.noEntries}
                onChange={(value) =>
                  updateConfig({ ...config, appText: { ...config.appText, noEntries: value } })
                }
              />
            </div>
          </Panel>

          <Panel
            title="Calculation Add-ons"
            action={
              <button
                type="button"
                disabled={unusedCustomKeyCount === 0}
                onClick={() => {
                  const option = newCustomOption(config.customOptions);
                  if (!option) {
                    return;
                  }

                  updateConfig({
                    ...config,
                    customOptions: [...config.customOptions, option],
                  });
                }}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} />
                Add option
              </button>
            }
          >
            <div className="mb-4 rounded-2xl border border-cedar/10 bg-cedar/5 p-4 text-sm leading-6 text-slate-600">
              Yom HaChodesh, Haflagah, and Onah Beinonit are always included. Each option below appears
              as its own on/off switch in the public Settings page after publishing. New calculation
              formulas still need to be added in code first.
            </div>
            {unusedCustomKeyCount === 0 && (
              <p className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                All available calculation behaviors are already exposed. Edit or delete an existing
                option to change what appears in Settings.
              </p>
            )}
            <div className="grid gap-3">
              {config.customOptions.map((option) => (
                <CustomOptionEditor
                  key={option.id}
                  option={option}
                  canDelete={config.customOptions.length > 1}
                  existingOptions={config.customOptions}
                  onDelete={() =>
                    updateConfig({
                      ...config,
                      customOptions: config.customOptions.filter((item) => item.id !== option.id),
                    })
                  }
                  onChange={(next) =>
                    updateConfig({
                      ...config,
                      customOptions: config.customOptions.map((item) =>
                        item.id === option.id ? next : item,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </Panel>

          <Panel title="Instructions">
            <div className="space-y-3">
              {config.instructions.map((instruction) => (
                <InstructionEditor
                  key={instruction.id}
                  instruction={instruction}
                  canDelete={config.instructions.length > 1}
                  onDelete={() =>
                    updateConfig({
                      ...config,
                      instructions: config.instructions.filter((item) => item.id !== instruction.id),
                    })
                  }
                  onChange={(next) =>
                    updateConfig({
                      ...config,
                      instructions: config.instructions.map((item) =>
                        item.id === instruction.id ? next : item,
                      ),
                    })
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  updateConfig({
                    ...config,
                    instructions: [...config.instructions, newInstruction(config.instructions)],
                  })
                }
                className="focus-ring inline-flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-600"
              >
                <Plus size={16} />
                Add instruction
              </button>
            </div>
          </Panel>

          <Panel title="Feature Flags">
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  ["showHebrewCalendar", "Show Hebrew calendar"],
                  ["showAdminLink", "Show public admin link"],
                ] as const
              ).map(([key, label]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={config.featureFlags[key]}
                  onChange={(checked) =>
                    updateConfig({
                      ...config,
                      featureFlags: { ...config.featureFlags, [key]: checked },
                    })
                  }
                />
              ))}
            </div>
          </Panel>

          <Panel
            title="Advanced JSON"
            action={
              <button
                type="button"
                onClick={() => setShowJson((value) => !value)}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <FileJson size={14} />
                {showJson ? "Hide" : "Show"}
              </button>
            }
          >
            {showJson && (
              <div className="space-y-3">
                <textarea
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  className="focus-ring min-h-96 w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-50"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={applyJson}
                  className="focus-ring rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white"
                >
                  Apply JSON
                </button>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Validation">
            {validation.success ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-cedar">
                <CheckCircle2 size={18} />
                Draft is valid.
              </p>
            ) : (
              <ul className="space-y-2 text-sm text-berry">
                {validation.error.issues.map((issue) => (
                  <li key={`${issue.path.join(".")}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Preview" icon={Eye}>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Default public settings preview:{" "}
                <span className="font-bold">{text(previewPreset.name, config.defaultLanguage)}</span>
              </p>
              {preview.map((veset) => (
                <div key={veset.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-bold">{vesetTypeLabel(veset.type, config.defaultLanguage)}</p>
                  <p className="text-xs text-slate-500">
                    {veset.date} · {veset.onah} · {veset.hebrewDate}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Published Versions" icon={History}>
            <div className="space-y-3">
              {versions.length === 0 ? (
                <p className="text-sm text-slate-500">No published versions yet.</p>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-2xl border border-slate-100 bg-white p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">
                          v{version.version} · {version.label}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(version.publishedAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                          version.status === "active"
                            ? "bg-cedar/10 text-cedar"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {version.status}
                      </span>
                    </div>
                    {version.status !== "active" && (
                      <button
                        type="button"
                        onClick={() => rollback(version.version)}
                        disabled={status !== "idle"}
                        className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        <RotateCcw size={14} />
                        Roll back
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function CustomOptionEditor({
  option,
  canDelete,
  existingOptions,
  onDelete,
  onChange,
}: {
  option: CustomOption;
  canDelete: boolean;
  existingOptions: CustomOption[];
  onDelete: () => void;
  onChange: (option: CustomOption) => void;
}) {
  const availableKeys = CUSTOM_KEY_OPTIONS.filter(
    ([key]) =>
      key === option.customKey ||
      !existingOptions.some((existingOption) => existingOption.customKey === key),
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_14rem_auto]">
        <TextInput
          label="Option ID"
          value={option.id}
          onChange={(value) => onChange({ ...option, id: slugify(value) })}
        />
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600">Calculation behavior</span>
          <select
            value={option.customKey}
            onChange={(event) =>
              onChange({ ...option, customKey: event.target.value as CalculationCustomKey })
            }
            className="focus-ring w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            {availableKeys.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Toggle
            label="Default on"
            checked={option.defaultEnabled}
            onChange={(checked) => onChange({ ...option, defaultEnabled: checked })}
          />
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="focus-ring rounded-2xl bg-berry/10 p-3 text-berry"
              aria-label="Delete add-on"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LocalizedInput label="Name" value={option.name} onChange={(name) => onChange({ ...option, name })} />
        <LocalizedTextarea
          label="Description"
          value={option.description}
          onChange={(description) => onChange({ ...option, description })}
        />
      </div>
    </div>
  );
}

function InstructionEditor({
  instruction,
  canDelete,
  onChange,
  onDelete,
}: {
  instruction: AppInstruction;
  canDelete: boolean;
  onChange: (instruction: AppInstruction) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-3">
        <TextInput
          label="Instruction ID"
          value={instruction.id}
          onChange={(value) => onChange({ ...instruction, id: slugify(value) })}
        />
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="focus-ring mt-7 rounded-2xl bg-berry/10 p-3 text-berry"
            aria-label="Delete instruction"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LocalizedInput
          label="Title"
          value={instruction.title}
          onChange={(title) => onChange({ ...instruction, title })}
        />
        <LocalizedTextarea
          label="Body"
          value={instruction.body}
          onChange={(body) => onChange({ ...instruction, body })}
        />
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  action,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: typeof Eye;
}) {
  return (
    <section className="rounded-[2rem] border border-white bg-white/90 p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          {Icon && <Icon size={18} className="text-cedar" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring w-full rounded-2xl border border-slate-200 px-4 py-3"
      />
    </label>
  );
}

function LocalizedInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
}) {
  return (
    <div className="grid gap-3">
      <TextInput label={`${label} EN`} value={value.en} onChange={(en) => onChange({ ...value, en })} />
      <TextInput label={`${label} HE`} value={value.he} onChange={(he) => onChange({ ...value, he })} />
    </div>
  );
}

function LocalizedTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
}) {
  return (
    <div className="grid gap-3">
      <Textarea label={`${label} EN`} value={value.en} onChange={(en) => onChange({ ...value, en })} />
      <Textarea label={`${label} HE`} value={value.he} onChange={(he) => onChange({ ...value, he })} />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-cedar"
      />
    </label>
  );
}

function ActionButton({
  icon: Icon,
  children,
  disabled,
  onClick,
}: {
  icon: typeof Save;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-cedar px-4 py-3 text-sm font-bold text-white transition hover:bg-cedar/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function buildPresetWithDefaultOptions(config: AppConfig): CalculationPreset {
  const basePreset =
    config.presets.find((preset) => preset.id === config.activePresetId) ||
    config.presets[0] ||
    DEFAULT_APP_CONFIG.presets[0];
  const customs = { ...basePreset.customs };

  for (const option of config.customOptions) {
    customs[option.customKey] = option.defaultEnabled;
  }

  return {
    ...basePreset,
    customs,
  };
}

function newCustomOption(existing: CustomOption[]): CustomOption | null {
  const template = DEFAULT_APP_CONFIG.customOptions.find(
    (option) => !existing.some((existingOption) => existingOption.customKey === option.customKey),
  );
  if (!template) {
    return null;
  }

  const id = uniqueId(template.id, existing.map((option) => option.id));

  return {
    ...template,
    id,
  };
}

function newInstruction(existing: AppInstruction[]): AppInstruction {
  const id = uniqueId("new-instruction", existing.map((instruction) => instruction.id));
  return {
    id,
    title: { en: "New instruction", he: "הוראה חדשה" },
    body: { en: "Add instruction text.", he: "הוסיפי טקסט הוראה." },
  };
}

function uniqueId(base: string, existing: string[]): string {
  const safeBase = slugify(base) || "item";
  let candidate = safeBase;
  let index = 2;
  while (existing.includes(candidate)) {
    candidate = `${safeBase}-${index}`;
    index += 1;
  }
  return candidate;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
