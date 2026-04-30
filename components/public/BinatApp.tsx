"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import type { ActiveConfigResult } from "@/lib/config/repository";
import type { AppConfig, CalculationPreset, Language, Onah } from "@/lib/config/schema";
import { direction, text } from "@/lib/i18n";
import {
  assertDateOnly,
  dateOnlyFromHebrewDate,
  dateOnlyToLocalDate,
  daysInHebrewMonth,
  formatDateOnly,
  formatHebrewDate,
  hDateFromDateOnly,
  hebrewDayLabel,
  hebrewMonthName,
  hebrewYearLabel,
  localDateToDateOnly,
  nextHebrewMonthRef,
  previousHebrewMonthRef,
  todayDateOnly,
  type DateOnly,
} from "@/lib/dates";
import { calculateVesatot, type PeriodEntry, vesetTypeLabel } from "@/lib/veset";

type Tab = "upcoming" | "calendar" | "entries" | "settings";
type CalendarMode = "gregorian" | "hebrew";

interface UserPreferences {
  language: Language;
  activePresetId: string;
  calendarMode: CalendarMode;
}

interface EntryForm {
  id: string | null;
  date: DateOnly;
  onah: Onah;
}

const ENTRY_STORAGE_KEY = "period_entries";
const PREFERENCES_STORAGE_KEY = "user_preferences";
const CONFIG_VERSION_STORAGE_KEY = "active_config_version";

export function BinatApp({ initialConfig }: { initialConfig: ActiveConfigResult }) {
  const [configInfo, setConfigInfo] = useState(initialConfig);
  const [entries, setEntries] = useState<PeriodEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [form, setForm] = useState<EntryForm | null>(null);
  const [localStorageReady, setLocalStorageReady] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    defaultPreferences(initialConfig.config),
  );

  const config = configInfo.config;
  const language = preferences.language;
  const isRtl = direction(language) === "rtl";

  const activePreset = useMemo(() => {
    if (!config.featureFlags.allowManualPresetSelection) {
      return requirePreset(config, config.activePresetId);
    }

    return requirePreset(config, preferences.activePresetId);
  }, [config, preferences.activePresetId]);

  const calculated = useMemo(
    () => calculateVesatot(entries, activePreset, language),
    [entries, activePreset, language],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const savedEntries = safeReadJson<PeriodEntry[] | null>(ENTRY_STORAGE_KEY, []);
      setEntries(
        (Array.isArray(savedEntries) ? savedEntries : [])
          .map((entry) => {
            try {
              return { ...entry, date: assertDateOnly(entry.date) };
            } catch {
              return null;
            }
          })
          .filter((entry): entry is PeriodEntry => Boolean(entry)),
      );

      const savedPreferences = safeReadJson<UserPreferences | null>(PREFERENCES_STORAGE_KEY, null);
      if (savedPreferences) {
        setPreferences(normalizePreferences(initialConfig.config, savedPreferences));
      }
      setLocalStorageReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialConfig.config]);

  useEffect(() => {
    if (!localStorageReady) {
      return;
    }

    safeWriteJson(ENTRY_STORAGE_KEY, entries);
  }, [entries, localStorageReady]);

  useEffect(() => {
    if (!localStorageReady) {
      return;
    }

    safeWriteJson(PREFERENCES_STORAGE_KEY, preferences);
  }, [preferences, localStorageReady]);

  useEffect(() => {
    safeWriteString(CONFIG_VERSION_STORAGE_KEY, String(configInfo.version));
  }, [configInfo.version]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/config/active", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ActiveConfigResult | null) => {
        if (payload && isMounted && payload.version !== configInfo.version) {
          setConfigInfo(payload);
          setPreferences((current) => normalizePreferences(payload.config, current));
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [configInfo.version]);

  function openAdd(date = todayDateOnly()) {
    setForm({ id: null, date, onah: "day" });
  }

  function openAddInEntries(date = todayDateOnly()) {
    setActiveTab("entries");
    setForm({ id: null, date, onah: "day" });
  }

  function openEdit(entry: PeriodEntry) {
    setForm({ id: entry.id, date: entry.date, onah: entry.onah });
  }

  function saveEntry() {
    if (!form) {
      return;
    }

    const normalized: PeriodEntry = {
      id: form.id || crypto.randomUUID(),
      date: assertDateOnly(form.date),
      onah: form.onah,
    };

    setEntries((current) => {
      if (form.id) {
        return current.map((entry) => (entry.id === form.id ? normalized : entry));
      }

      return [...current, normalized].sort((a, b) => a.date.localeCompare(b.date));
    });
    setForm(null);
  }

  function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <main dir={isRtl ? "rtl" : "ltr"} className="min-h-screen px-3 py-3 text-ink sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-white bg-white/85 p-4 shadow-soft backdrop-blur sm:p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-cedar/10 px-3 py-1 text-xs font-semibold text-cedar">
              <ShieldCheck size={14} />
              {text(config.appText.privacyNote, language)}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{text(config.appText.appTitle, language)}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {text(config.appText.guidanceNotice, language)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/admin"
              className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition ${
                config.featureFlags.showAdminLink
                  ? "bg-berry text-white hover:bg-berry/90"
                  : "hidden"
              }`}
            >
              Admin
            </a>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:gap-5">
          <aside className="flex flex-col gap-3">
            <ConfigStatus configInfo={configInfo} activePreset={activePreset} language={language} />
            <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <TabButton
                active={activeTab === "upcoming"}
                icon={Clock3}
                label={text(config.appText.upcomingOnot, language)}
                onClick={() => setActiveTab("upcoming")}
              />
              <TabButton
                active={activeTab === "calendar"}
                icon={CalendarDays}
                label={text(config.appText.calendar, language)}
                onClick={() => setActiveTab("calendar")}
              />
              <TabButton
                active={activeTab === "entries"}
                icon={Edit3}
                label={text(config.appText.entries, language)}
                onClick={() => setActiveTab("entries")}
              />
              <TabButton
                active={activeTab === "settings"}
                icon={Settings}
                label={text(config.appText.settings, language)}
                onClick={() => setActiveTab("settings")}
              />
            </nav>
          </aside>

          <section className="min-h-[30rem] rounded-3xl border border-white bg-white/90 p-3 shadow-soft sm:min-h-[34rem] sm:p-6">
            {activeTab === "upcoming" && (
              <UpcomingPanel
                config={config}
                entries={entries}
                language={language}
                calculated={calculated}
              />
            )}
            {activeTab === "calendar" && (
              <CalendarPanel
                entries={entries}
                language={language}
                calculated={calculated}
                mode={preferences.calendarMode}
                onDateClick={openAddInEntries}
              />
            )}
            {activeTab === "entries" && (
              <EntriesPanel
                config={config}
                entries={entries}
                language={language}
                onAdd={() => openAdd()}
                onEdit={openEdit}
                onDelete={deleteEntry}
              />
            )}
            {activeTab === "settings" && (
              <SettingsPanel
                config={config}
                language={language}
                preferences={preferences}
                onPreferencesChange={setPreferences}
              />
            )}
          </section>
        </section>
      </div>

      {form && (
        <EntryModal
          config={config}
          language={language}
          calendarMode={preferences.calendarMode}
          form={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSave={saveEntry}
        />
      )}
    </main>
  );
}

function UpcomingPanel({
  config,
  entries,
  language,
  calculated,
}: {
  config: AppConfig;
  entries: PeriodEntry[];
  language: Language;
  calculated: ReturnType<typeof calculateVesatot>;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{text(config.appText.upcomingOnot, language)}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {entries.length} {text(config.appText.entries, language)}
        </span>
      </div>

      {entries.length === 1 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {language === "he"
            ? "נשמרה רשומה אחת. אפשר להמשיך כך, אבל חישוב הפלגה יופיע רק לאחר הוספת תחילת מחזור נוספת."
            : "One entry is saved. You can continue with one, but Haflagah appears only after you add one more period start."}
        </div>
      )}

      {calculated.length === 0 ? (
        <EmptyState message={text(config.appText.noEntries, language)} />
      ) : (
        <div className="grid gap-3">
          {calculated.map((veset) => (
            <div
              key={veset.id}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                    veset.onah === "day" ? "bg-amber-100 text-amber-600" : "bg-slate-900 text-white"
                  }`}
                >
                  {veset.onah === "day" ? <Sun size={22} /> : <Moon size={22} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{vesetTypeLabel(veset.type, language)}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {veset.onah === "day"
                        ? text(config.appText.day, language)
                        : text(config.appText.night, language)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDateOnly(veset.date, "EEEE, MMM d, yyyy")}
                  </p>
                  <p className="text-sm text-berry">{veset.hebrewDate}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{veset.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarPanel({
  entries,
  calculated,
  language,
  mode,
  onDateClick,
}: {
  entries: PeriodEntry[];
  calculated: ReturnType<typeof calculateVesatot>;
  language: Language;
  mode: CalendarMode;
  onDateClick: (date: DateOnly) => void;
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const currentDateOnly = localDateToDateOnly(currentDate);
  const today = todayDateOnly();
  const displayLanguage: Language = mode === "hebrew" ? "he" : "en";

  const gregorianMonthStart = startOfMonth(currentDate);
  const gregorianDays = eachDayOfInterval({
    start: startOfWeek(gregorianMonthStart),
    end: endOfWeek(endOfMonth(gregorianMonthStart)),
  });

  const currentHebrew = hDateFromDateOnly(currentDateOnly);
  const hebrewMonth = currentHebrew.getMonth();
  const hebrewYear = currentHebrew.getFullYear();
  const hebrewMonthStart = hDateFromDateOnly(dateOnlyFromHebrewDate(1, hebrewMonth, hebrewYear));
  const hebrewDaysInMonth = daysInHebrewMonth(hebrewMonth, hebrewYear);

  const calendar =
    mode === "hebrew"
      ? {
          dir: "rtl" as const,
          title: `${hebrewMonthName(hebrewMonth, hebrewYear, "he")} ${hebrewYearLabel(hebrewYear)}`,
          subtitle: "לוח עברי",
          weekDays: ["א", "ב", "ג", "ד", "ה", "ו", "ש"],
          previousLabel: "הקודם",
          nextLabel: "הבא",
          previous: () => {
            const previous = previousHebrewMonthRef(hebrewMonth, hebrewYear);
            setCurrentDate(dateOnlyToLocalDate(dateOnlyFromHebrewDate(1, previous.month, previous.year)));
          },
          next: () => {
            const next = nextHebrewMonthRef(hebrewMonth, hebrewYear);
            setCurrentDate(dateOnlyToLocalDate(dateOnlyFromHebrewDate(1, next.month, next.year)));
          },
          cells: [
            ...Array.from({ length: hebrewMonthStart.getDay() }, (_, index) => ({
              key: `hebrew-pad-start-${index}`,
              date: null,
              label: "",
              inMonth: false,
            })),
            ...Array.from({ length: hebrewDaysInMonth }, (_, index) => {
              const day = index + 1;
              const dateOnly = dateOnlyFromHebrewDate(day, hebrewMonth, hebrewYear);
              return {
                key: dateOnly,
                date: dateOnly,
                label: hebrewDayLabel(day),
                inMonth: true,
              };
            }),
            ...Array.from(
              { length: (7 - ((hebrewMonthStart.getDay() + hebrewDaysInMonth) % 7)) % 7 },
              (_, index) => ({
                key: `hebrew-pad-end-${index}`,
                date: null,
                label: "",
                inMonth: false,
              }),
            ),
          ],
        }
      : {
          dir: "ltr" as const,
          title: format(currentDate, "MMMM yyyy"),
          subtitle: "Gregorian calendar",
          weekDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          previousLabel: "Prev",
          nextLabel: "Next",
          previous: () => setCurrentDate((date) => subMonths(date, 1)),
          next: () => setCurrentDate((date) => addMonths(date, 1)),
          cells: gregorianDays.map((day) => {
            const dateOnly = localDateToDateOnly(day);
            return {
              key: dateOnly,
              date: dateOnly,
              label: format(day, "d"),
              inMonth: day.getMonth() === currentDate.getMonth(),
            };
          }),
        };

  return (
    <div className="space-y-4" dir={calendar.dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">{calendar.title}</h2>
          <p className="text-sm text-slate-500">{calendar.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={calendar.previous}
            className="focus-ring rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm"
          >
            {calendar.previousLabel}
          </button>
          <button
            type="button"
            onClick={calendar.next}
            className="focus-ring rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm"
          >
            {calendar.nextLabel}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-slate-100 bg-white">
        {calendar.weekDays.map((day) => (
          <div key={day} className="bg-slate-50 p-1.5 text-center text-[11px] font-bold text-slate-400 sm:p-2 sm:text-xs">
            {day}
          </div>
        ))}
        {calendar.cells.map((cell) => {
          if (!cell.date) {
            return <div key={cell.key} className="min-h-16 border-t border-slate-100 bg-slate-50/70 sm:min-h-28" />;
          }

          const dayEntries = entries.filter((entry) => entry.date === cell.date);
          const dayVesatot = calculated.filter((veset) => veset.date === cell.date);
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className={`focus-ring min-h-16 border-t border-slate-100 p-1.5 text-start transition hover:bg-cedar/5 sm:min-h-28 sm:p-2 ${
                cell.inMonth ? "bg-white" : "bg-slate-50/70 text-slate-400"
              }`}
            >
              <span
                className={`block text-sm font-bold ${
                  cell.date === today
                    ? "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-cedar px-2 text-white"
                    : ""
                }`}
              >
                {cell.label}
              </span>
              <div className="mt-2 space-y-1">
                {dayEntries.map((entry) => (
                  <span key={entry.id} className="block truncate rounded bg-cedar/10 px-1 py-0.5 text-[10px] font-bold text-cedar sm:px-1.5 sm:text-[11px]">
                    {displayLanguage === "he" ? "רשומה" : "Entry"} ·{" "}
                    {entry.onah === "day"
                      ? displayLanguage === "he"
                        ? "יום"
                        : "day"
                      : displayLanguage === "he"
                        ? "לילה"
                        : "night"}
                  </span>
                ))}
                {dayVesatot.map((veset) => (
                  <span key={veset.id} className="block truncate rounded bg-berry/10 px-1 py-0.5 text-[10px] font-bold text-berry sm:px-1.5 sm:text-[11px]">
                    {vesetTypeLabel(veset.type, displayLanguage)}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EntriesPanel({
  config,
  entries,
  language,
  onAdd,
  onEdit,
  onDelete,
}: {
  config: AppConfig;
  entries: PeriodEntry[];
  language: Language;
  onAdd: () => void;
  onEdit: (entry: PeriodEntry) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold sm:text-2xl">{text(config.appText.entries, language)}</h2>
        <button
          type="button"
          onClick={onAdd}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cedar px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-cedar/90 sm:w-auto"
        >
          <Plus size={18} />
          {text(config.appText.addEntry, language)}
        </button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState message={text(config.appText.noEntries, language)} />
      ) : (
        <div className="grid gap-3">
          {sorted.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold">{formatDateOnly(entry.date, "EEEE, MMM d, yyyy")}</p>
                <p className="text-sm text-slate-500">
                  {formatHebrewDate(entry.date, language)} ·{" "}
                  {entry.onah === "day" ? text(config.appText.day, language) : text(config.appText.night, language)}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  className="focus-ring rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                  aria-label={text(config.appText.editEntry, language)}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  className="focus-ring rounded-full bg-berry/10 p-2 text-berry transition hover:bg-berry/20"
                  aria-label={text(config.appText.delete, language)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  config,
  language,
  preferences,
  onPreferencesChange,
}: {
  config: AppConfig;
  language: Language;
  preferences: UserPreferences;
  onPreferencesChange: (preferences: UserPreferences) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">{text(config.appText.settings, language)}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="font-bold text-cedar">{language === "he" ? "שפה" : "Language"}</h3>
          <div className="mt-3 grid gap-2">
            {config.enabledLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onPreferencesChange({ ...preferences, language: lang })}
                className={`focus-ring rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  preferences.language === lang
                    ? "bg-ink text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {lang === "he" ? "עברית" : "English"}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="font-bold text-cedar">
            {language === "he" ? "לוח שנה להזנה ותצוגה" : "Calendar for entries and view"}
          </h3>
          <div className="mt-3 grid gap-2">
            {(["hebrew", "gregorian"] as CalendarMode[])
              .filter((mode) => mode === "gregorian" || config.featureFlags.showHebrewCalendar)
              .map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onPreferencesChange({ ...preferences, calendarMode: mode })}
                  className={`focus-ring rounded-2xl px-4 py-3 text-sm font-bold transition ${
                    preferences.calendarMode === mode
                      ? "bg-ink text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {mode === "hebrew"
                    ? language === "he"
                      ? "לוח עברי"
                      : "Hebrew calendar"
                    : language === "he"
                      ? "לוח לועזי"
                      : "Gregorian calendar"}
                </button>
              ))}
          </div>
        </section>
      </div>

      {config.featureFlags.allowManualPresetSelection && (
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600">
            {text(config.appText.activePreset, language)}
          </span>
          <select
            value={preferences.activePresetId}
            onChange={(event) =>
              onPreferencesChange({ ...preferences, activePresetId: event.target.value })
            }
            className="focus-ring w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            {config.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {text(preset.name, language)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {config.instructions.map((instruction) => (
          <div key={instruction.id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <h3 className="font-bold text-cedar">{text(instruction.title, language)}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{text(instruction.body, language)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryModal({
  config,
  language,
  calendarMode,
  form,
  onChange,
  onClose,
  onSave,
}: {
  config: AppConfig;
  language: Language;
  calendarMode: CalendarMode;
  form: EntryForm;
  onChange: (form: EntryForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const hebrewDate = hDateFromDateOnly(form.date);
  const hMonth = hebrewDate.getMonth();
  const hYear = hebrewDate.getFullYear();
  const [visibleHebrewMonth, setVisibleHebrewMonth] = useState(() => ({
    month: hMonth,
    year: hYear,
  }));

  const visibleHebrewMonthStart = hDateFromDateOnly(
    dateOnlyFromHebrewDate(1, visibleHebrewMonth.month, visibleHebrewMonth.year),
  );
  const visibleHebrewDays = daysInHebrewMonth(visibleHebrewMonth.month, visibleHebrewMonth.year);
  const hebrewCalendarCells = [
    ...Array.from({ length: visibleHebrewMonthStart.getDay() }, (_, index) => ({
      key: `entry-hebrew-pad-${index}`,
      day: null,
      date: null,
    })),
    ...Array.from({ length: visibleHebrewDays }, (_, index) => {
      const day = index + 1;
      return {
        key: `entry-hebrew-${day}`,
        day,
        date: dateOnlyFromHebrewDate(day, visibleHebrewMonth.month, visibleHebrewMonth.year),
      };
    }),
  ];

  function moveEntryHebrewMonth(direction: "previous" | "next") {
    setVisibleHebrewMonth((current) =>
      direction === "previous"
        ? previousHebrewMonthRef(current.month, current.year)
        : nextHebrewMonthRef(current.month, current.year),
    );
  }

  function selectHebrewDay(day: number) {
    onChange({
      ...form,
      date: dateOnlyFromHebrewDate(day, visibleHebrewMonth.month, visibleHebrewMonth.year),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-soft sm:rounded-[2rem] sm:p-5">
        <h2 className="text-xl font-bold sm:text-2xl">
          {form.id ? text(config.appText.editEntry, language) : text(config.appText.addEntry, language)}
        </h2>
        <div className="mt-4 space-y-4 sm:mt-5">
          {calendarMode === "hebrew" ? (
            <fieldset dir="rtl" className="rounded-2xl border border-slate-100 bg-white p-3">
              <legend className="px-1 text-sm font-bold text-slate-600">תאריך עברי</legend>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => moveEntryHebrewMonth("previous")}
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                  aria-label="חודש קודם"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="text-center">
                  <p className="font-bold">
                    {hebrewMonthName(visibleHebrewMonth.month, visibleHebrewMonth.year, "he")}{" "}
                    {hebrewYearLabel(visibleHebrewMonth.year)}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {formatHebrewDate(form.date, "he")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => moveEntryHebrewMonth("next")}
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                  aria-label="חודש הבא"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
                {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {hebrewCalendarCells.map((cell) =>
                  cell.day ? (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => selectHebrewDay(cell.day)}
                      className={`focus-ring flex h-10 items-center justify-center rounded-xl text-sm font-bold transition ${
                        cell.date === form.date
                          ? "bg-cedar text-white shadow-sm"
                          : "bg-slate-50 text-slate-700 hover:bg-cedar/10"
                      }`}
                    >
                      {hebrewDayLabel(cell.day)}
                    </button>
                  ) : (
                    <span key={cell.key} />
                  ),
                )}
              </div>
            </fieldset>
          ) : (
            <label className="block" dir="ltr">
              <span className="mb-2 block text-sm font-bold text-slate-600">Gregorian date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => onChange({ ...form, date: assertDateOnly(event.target.value) })}
                className="focus-ring w-full rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-600">
              {text(config.appText.onah, language)}
            </legend>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              {(["day", "night"] as Onah[]).map((onah) => (
                <button
                  key={onah}
                  type="button"
                  onClick={() => onChange({ ...form, onah })}
                  className={`focus-ring flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold ${
                    form.onah === onah ? "bg-white text-ink shadow-sm" : "text-slate-500"
                  }`}
                >
                  {onah === "day" ? <Sun size={18} /> : <Moon size={18} />}
                  {onah === "day" ? text(config.appText.day, language) : text(config.appText.night, language)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-700"
          >
            {text(config.appText.cancel, language)}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="focus-ring flex-1 rounded-2xl bg-cedar px-4 py-3 font-bold text-white"
          >
            {text(config.appText.save, language)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigStatus({
  configInfo,
  activePreset,
  language,
}: {
  configInfo: ActiveConfigResult;
  activePreset: CalculationPreset;
  language: Language;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white bg-white/85 p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cedar">
        <CheckCircle2 size={14} />
        Config v{configInfo.version}
      </p>
      <h2 className="mt-2 font-bold">{text(activePreset.name, language)}</h2>
      <p className="mt-1 text-sm leading-5 text-slate-500">{text(activePreset.description, language)}</p>
      <p className="mt-3 text-xs font-semibold text-slate-400">
        Source: {configInfo.source}
      </p>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Clock3;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring flex items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold transition ${
        active ? "bg-ink text-white shadow-soft" : "bg-white/85 text-slate-600 hover:bg-white"
      }`}
    >
      <Icon size={18} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <CalendarDays className="text-slate-300" size={44} />
      <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">{message}</p>
    </div>
  );
}

function defaultPreferences(config: AppConfig): UserPreferences {
  return {
    language: preferredDefaultLanguage(config),
    activePresetId: config.activePresetId,
    calendarMode: defaultCalendarMode(config),
  };
}

function normalizePreferences(config: AppConfig, preferences: UserPreferences): UserPreferences {
  const language = config.enabledLanguages.includes(preferences.language)
    ? preferences.language
    : preferredDefaultLanguage(config);
  const activePresetId = config.presets.some((preset) => preset.id === preferences.activePresetId)
    ? preferences.activePresetId
    : config.activePresetId;
  const calendarMode =
    preferences.calendarMode === "hebrew" && !config.featureFlags.showHebrewCalendar
      ? "gregorian"
      : preferences.calendarMode === "hebrew" || preferences.calendarMode === "gregorian"
        ? preferences.calendarMode
        : defaultCalendarMode(config);

  return {
    language,
    activePresetId,
    calendarMode,
  };
}

function preferredDefaultLanguage(config: AppConfig): Language {
  return config.enabledLanguages.includes("he") ? "he" : config.defaultLanguage;
}

function defaultCalendarMode(config: AppConfig): CalendarMode {
  return config.featureFlags.showHebrewCalendar ? "hebrew" : "gregorian";
}

function requirePreset(config: AppConfig, id: string): CalculationPreset {
  return config.presets.find((preset) => preset.id === id) || config.presets[0];
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in restricted browser modes.
  }
}

function safeWriteString(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be unavailable in restricted browser modes.
  }
}
