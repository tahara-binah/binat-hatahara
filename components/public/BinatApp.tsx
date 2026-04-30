"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  House,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import type { ActiveConfigResult } from "@/lib/config/repository";
import type { AppConfig, CalculationPreset, CustomOption, Language, Onah } from "@/lib/config/schema";
import { direction, text } from "@/lib/i18n";
import {
  addDaysToDateOnly,
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
type AppNotificationPermission = NotificationPermission | "unsupported";

interface ReminderPreferences {
  enabled: boolean;
  sameDay: boolean;
  dayBefore: boolean;
  time: string;
  disabledVesetIds: Record<string, boolean>;
}

interface UserPreferences {
  language: Language;
  calendarMode: CalendarMode;
  customOptions: Record<string, boolean>;
  reminders: ReminderPreferences;
}

type StoredUserPreferences = Partial<UserPreferences> & {
  activePresetId?: string;
};

interface EntryForm {
  id: string | null;
  date: DateOnly;
  onah: Onah;
}

const ENTRY_STORAGE_KEY = "period_entries";
const PREFERENCES_STORAGE_KEY = "user_preferences";
const CONFIG_VERSION_STORAGE_KEY = "active_config_version";
const REMINDER_SENT_STORAGE_KEY = "local_reminders_sent";

export function BinatApp({ initialConfig }: { initialConfig: ActiveConfigResult }) {
  const [configInfo, setConfigInfo] = useState(initialConfig);
  const [entries, setEntries] = useState<PeriodEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [form, setForm] = useState<EntryForm | null>(null);
  const [localStorageReady, setLocalStorageReady] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<AppNotificationPermission>("unsupported");
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    defaultPreferences(initialConfig.config),
  );

  const config = configInfo.config;
  const language = preferences.language;
  const isRtl = direction(language) === "rtl";

  const activePreset = useMemo(
    () => buildPresetWithCustomOptions(config, preferences.customOptions),
    [config, preferences.customOptions],
  );

  const calculated = useMemo(
    () => calculateVesatot(entries, activePreset, language),
    [entries, activePreset, language],
  );

  useEffect(() => {
    let cancelled = false;
    registerServiceWorker();

    queueMicrotask(() => {
      if (!cancelled && "Notification" in window) {
        setNotificationPermission(Notification.permission);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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

      const savedPreferences = safeReadJson<StoredUserPreferences | null>(PREFERENCES_STORAGE_KEY, null);
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

  useEffect(() => {
    maybeShowLocalReminders({
      calculated,
      config,
      language,
      localStorageReady,
      reminders: preferences.reminders,
    });
  }, [calculated, config, language, localStorageReady, preferences.reminders]);

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return "unsupported" as const;
    }

    await registerServiceWorker();
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }

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

  function toggleVesetReminder(vesetId: string) {
    setPreferences((current) => {
      const disabledVesetIds = { ...current.reminders.disabledVesetIds };
      const currentlyEnabled = current.reminders.enabled && !disabledVesetIds[vesetId];

      if (currentlyEnabled) {
        disabledVesetIds[vesetId] = true;
      } else {
        delete disabledVesetIds[vesetId];
      }

      return {
        ...current,
        reminders: {
          ...current.reminders,
          enabled: true,
          disabledVesetIds,
        },
      };
    });
  }

  return (
    <main dir={isRtl ? "rtl" : "ltr"} className="min-h-screen px-3 py-3 text-ink sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col items-center gap-4 rounded-3xl border border-white bg-white/85 p-4 text-center shadow-soft backdrop-blur sm:p-5">
          <div className="mx-auto">
            <p className="mb-2 inline-flex items-center justify-center gap-2 rounded-full bg-cedar/10 px-3 py-1 text-xs font-semibold text-cedar">
              <ShieldCheck size={14} />
              {text(config.appText.privacyNote, language)}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{text(config.appText.appTitle, language)}</h1>
            <p className="mx-auto mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {text(config.appText.guidanceNotice, language)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
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

        <section className="grid gap-4 lg:grid-cols-[13rem_1fr] lg:gap-5">
          <aside className="flex flex-col gap-3">
            <nav className="grid grid-cols-4 gap-1 rounded-3xl border border-white bg-white/80 p-1 shadow-soft lg:grid-cols-1 lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <TabButton
                active={activeTab === "upcoming"}
                icon={House}
                label={language === "he" ? "בית" : "Home"}
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
                reminders={preferences.reminders}
                notificationPermission={notificationPermission}
                onOpenReminderSettings={() => setActiveTab("settings")}
                onToggleReminder={toggleVesetReminder}
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
                notificationPermission={notificationPermission}
                onRequestNotifications={requestNotificationPermission}
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
  reminders,
  notificationPermission,
  onOpenReminderSettings,
  onToggleReminder,
}: {
  config: AppConfig;
  entries: PeriodEntry[];
  language: Language;
  calculated: ReturnType<typeof calculateVesatot>;
  reminders: ReminderPreferences;
  notificationPermission: AppNotificationPermission;
  onOpenReminderSettings: () => void;
  onToggleReminder: (vesetId: string) => void;
}) {
  const reminderStatus = reminderHeaderStatus(reminders, notificationPermission, language);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{text(config.appText.upcomingOnot, language)}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenReminderSettings}
            aria-label={reminderStatus.label}
            title={reminderStatus.label}
            className={`focus-ring relative flex h-9 w-9 items-center justify-center rounded-full transition ${reminderStatus.className}`}
          >
            <Bell size={18} />
            {reminderStatus.showDot && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-current ring-2 ring-white" />
            )}
          </button>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {entries.length} {text(config.appText.entries, language)}
          </span>
        </div>
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
          {calculated.map((veset) => {
            const itemStatus = reminderItemStatus(
              veset.id,
              reminders,
              notificationPermission,
              language,
            );
            const ReminderIcon = itemStatus.enabled ? Bell : BellOff;

            return (
              <div
                key={veset.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3 sm:gap-4">
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
                      {formatUpcomingDate(veset.date, language)}
                    </p>
                    {language !== "he" && <p className="text-sm text-berry">{veset.hebrewDate}</p>}
                    <p className="mt-2 text-sm leading-6 text-slate-500">{veset.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleReminder(veset.id)}
                    aria-pressed={itemStatus.enabled}
                    aria-label={itemStatus.label}
                    title={itemStatus.label}
                    className={`focus-ring relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition ${itemStatus.className}`}
                  >
                    <ReminderIcon size={22} />
                    {itemStatus.showDot && (
                      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-current ring-2 ring-white" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
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
  notificationPermission,
  onRequestNotifications,
  onPreferencesChange,
}: {
  config: AppConfig;
  language: Language;
  preferences: UserPreferences;
  notificationPermission: AppNotificationPermission;
  onRequestNotifications: () => Promise<AppNotificationPermission>;
  onPreferencesChange: (preferences: UserPreferences) => void;
}) {
  function updateCustomOption(optionId: string, enabled: boolean) {
    onPreferencesChange({
      ...preferences,
      customOptions: {
        ...preferences.customOptions,
        [optionId]: enabled,
      },
    });
  }

  function updateReminderPreference(next: ReminderPreferences) {
    onPreferencesChange({
      ...preferences,
      reminders: next,
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold sm:text-2xl">{text(config.appText.settings, language)}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
          <h3 className="font-bold text-cedar">{language === "he" ? "שפה" : "Language"}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
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

        <section className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
          <h3 className="font-bold text-cedar">
            {language === "he" ? "לוח שנה" : "Calendar"}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
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

      {config.customOptions.length > 0 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
          <div className="mb-3">
            <h3 className="font-bold text-cedar">
              {language === "he" ? "תוספות חישוב" : "Calculation Add-ons"}
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {language === "he"
                ? "יום החודש, הפלגה, ועונה בינונית כלולים תמיד."
                : "Yom HaChodesh, Haflagah, and Onah Beinonit are always included."}
            </p>
          </div>
          <div className="grid gap-2">
            {config.customOptions.map((option) => (
              <CustomOptionToggle
                key={option.id}
                option={option}
                language={language}
                checked={isCustomOptionEnabled(option, preferences.customOptions)}
                onChange={(checked) => updateCustomOption(option.id, checked)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bell size={18} className="text-cedar" />
          <h3 className="font-bold text-cedar">
            {language === "he" ? "תזכורות מקומיות" : "Local Reminders"}
          </h3>
        </div>
        <p className="mb-3 text-xs font-semibold leading-5 text-slate-500">
          {language === "he"
            ? "התזכורות נשמרות במכשיר בלבד ונבדקות כשהאפליקציה נפתחת. הן אינן נשלחות לסופאבייס."
            : "Reminders stay on this device and are checked when the app is opened. They are not sent to Supabase."}
        </p>
        {notificationPermission === "unsupported" ? (
          <p className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
            {language === "he"
              ? "הדפדפן הזה לא תומך בהתראות PWA."
              : "This browser does not support PWA notifications."}
          </p>
        ) : (
          <div className="grid gap-2">
            <ReminderToggle
              label={language === "he" ? "הפעלת תזכורות" : "Enable reminders"}
              checked={preferences.reminders.enabled}
              onChange={(checked) =>
                updateReminderPreference({ ...preferences.reminders, enabled: checked })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <ReminderToggle
                label={language === "he" ? "ביום עצמו" : "Same day"}
                checked={preferences.reminders.sameDay}
                onChange={(checked) =>
                  updateReminderPreference({ ...preferences.reminders, sameDay: checked })
                }
              />
              <ReminderToggle
                label={language === "he" ? "יום לפני" : "Day before"}
                checked={preferences.reminders.dayBefore}
                onChange={(checked) =>
                  updateReminderPreference({ ...preferences.reminders, dayBefore: checked })
                }
              />
            </div>
            <label className="block rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                {language === "he" ? "שעת בדיקה" : "Reminder time"}
              </span>
              <input
                type="time"
                value={preferences.reminders.time}
                onChange={(event) =>
                  updateReminderPreference({ ...preferences.reminders, time: event.target.value })
                }
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </label>
            {notificationPermission === "denied" && (
              <p className="rounded-2xl bg-berry/10 p-3 text-xs font-semibold leading-5 text-berry">
                {language === "he"
                  ? "ההתראות חסומות בדפדפן. יש לפתוח אותן בהגדרות האתר במכשיר."
                  : "Notifications are blocked in the browser. Enable them in this site’s device settings."}
              </p>
            )}
            {notificationPermission === "default" && (
              <button
                type="button"
                onClick={onRequestNotifications}
                className="focus-ring rounded-2xl bg-cedar px-4 py-3 text-sm font-bold text-white"
              >
                {language === "he" ? "אישור התראות" : "Allow notifications"}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {config.instructions.map((instruction) => (
          <div key={instruction.id} className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4">
            <h3 className="font-bold text-cedar">{text(instruction.title, language)}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{text(instruction.body, language)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomOptionToggle({
  option,
  language,
  checked,
  onChange,
}: {
  option: CustomOption;
  language: Language;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800">{text(option.name, language)}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {text(option.description, language)}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-cedar"
      />
    </label>
  );
}

function ReminderToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`focus-ring flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
        checked
          ? "border-cedar/20 bg-cedar/10"
          : "border-slate-100 bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${
          checked ? "bg-cedar" : "bg-slate-300"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "translate-x-5 rtl:-translate-x-5" : ""
          }`}
        />
      </span>
    </button>
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
      className={`focus-ring flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-center text-[11px] font-semibold transition lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-left lg:text-sm ${
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
    calendarMode: defaultCalendarMode(config),
    customOptions: {},
    reminders: defaultReminderPreferences(),
  };
}

function defaultReminderPreferences(): ReminderPreferences {
  return {
    enabled: false,
    sameDay: true,
    dayBefore: true,
    time: "09:00",
    disabledVesetIds: {},
  };
}

function reminderHeaderStatus(
  reminders: ReminderPreferences,
  notificationPermission: AppNotificationPermission,
  language: Language,
): { label: string; className: string; showDot: boolean } {
  if (!reminders.enabled) {
    return {
      label: language === "he" ? "תזכורות כבויות" : "Reminders off",
      className: "bg-slate-100 text-slate-500 hover:bg-slate-200",
      showDot: false,
    };
  }

  if (notificationPermission === "granted") {
    return {
      label: language === "he" ? "תזכורות פעילות" : "Reminders on",
      className: "bg-cedar/10 text-cedar hover:bg-cedar/15",
      showDot: true,
    };
  }

  if (notificationPermission === "unsupported") {
    return {
      label: language === "he" ? "הדפדפן לא תומך בהתראות" : "Notifications are not supported",
      className: "bg-slate-100 text-slate-400 hover:bg-slate-200",
      showDot: false,
    };
  }

  return {
    label:
      notificationPermission === "denied"
        ? language === "he"
          ? "ההתראות חסומות"
          : "Notifications blocked"
        : language === "he"
          ? "צריך לאשר התראות"
          : "Allow notifications",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    showDot: true,
  };
}

function reminderItemStatus(
  vesetId: string,
  reminders: ReminderPreferences,
  notificationPermission: AppNotificationPermission,
  language: Language,
): { enabled: boolean; label: string; className: string; showDot: boolean } {
  const enabled = isVesetReminderEnabled(vesetId, reminders);

  if (!enabled) {
    return {
      enabled,
      label: language === "he" ? "הפעלת תזכורת לפריט הזה" : "Turn on reminder for this item",
      className: "bg-slate-100 text-slate-500 hover:bg-slate-200",
      showDot: false,
    };
  }

  if (notificationPermission === "granted") {
    return {
      enabled,
      label: language === "he" ? "כיבוי תזכורת לפריט הזה" : "Turn off reminder for this item",
      className: "bg-cedar/10 text-cedar hover:bg-cedar/15",
      showDot: true,
    };
  }

  if (notificationPermission === "denied") {
    return {
      enabled,
      label: language === "he" ? "התזכורת פעילה, אבל ההתראות חסומות" : "Reminder on, but notifications are blocked",
      className: "bg-berry/10 text-berry hover:bg-berry/15",
      showDot: true,
    };
  }

  if (notificationPermission === "unsupported") {
    return {
      enabled,
      label: language === "he" ? "התזכורת פעילה, אבל הדפדפן לא תומך בהתראות" : "Reminder on, but notifications are not supported",
      className: "bg-slate-100 text-slate-400 hover:bg-slate-200",
      showDot: false,
    };
  }

  return {
    enabled,
    label: language === "he" ? "התזכורת פעילה, צריך לאשר התראות" : "Reminder on, allow notifications",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    showDot: true,
  };
}

function isVesetReminderEnabled(vesetId: string, reminders: ReminderPreferences): boolean {
  return reminders.enabled && !reminders.disabledVesetIds[vesetId];
}

function formatUpcomingDate(date: DateOnly, language: Language): string {
  if (language !== "he") {
    return formatDateOnly(date, "EEEE, MMM d, yyyy");
  }

  const weekdays = [
    "יום ראשון",
    "יום שני",
    "יום שלישי",
    "יום רביעי",
    "יום חמישי",
    "יום שישי",
    "שבת",
  ];
  const localDate = dateOnlyToLocalDate(date);

  return `${weekdays[localDate.getDay()]}, ${formatHebrewDate(date, "he")}`;
}

function normalizePreferences(config: AppConfig, preferences: StoredUserPreferences): UserPreferences {
  const language = preferences.language && config.enabledLanguages.includes(preferences.language)
    ? preferences.language
    : preferredDefaultLanguage(config);
  const calendarMode =
    preferences.calendarMode === "hebrew" && !config.featureFlags.showHebrewCalendar
      ? "gregorian"
      : preferences.calendarMode === "hebrew" || preferences.calendarMode === "gregorian"
        ? preferences.calendarMode
        : defaultCalendarMode(config);
  const customOptions: Record<string, boolean> = {};
  const reminders = normalizeReminderPreferences(preferences.reminders);
  const legacyPreset = preferences.activePresetId
    ? config.presets.find((preset) => preset.id === preferences.activePresetId)
    : null;

  for (const option of config.customOptions) {
    const saved = preferences.customOptions?.[option.id];
    if (typeof saved === "boolean") {
      customOptions[option.id] = saved;
    } else if (legacyPreset) {
      customOptions[option.id] = legacyPreset.customs[option.customKey];
    }
  }

  return {
    language,
    calendarMode,
    customOptions,
    reminders,
  };
}

function normalizeReminderPreferences(reminders: Partial<ReminderPreferences> | undefined): ReminderPreferences {
  const defaults = defaultReminderPreferences();
  const time = typeof reminders?.time === "string" && /^\d{2}:\d{2}$/.test(reminders.time)
    ? reminders.time
    : defaults.time;
  const disabledVesetIds =
    reminders?.disabledVesetIds && typeof reminders.disabledVesetIds === "object"
      ? Object.fromEntries(
          Object.entries(reminders.disabledVesetIds).filter(([, disabled]) => disabled === true),
        )
      : defaults.disabledVesetIds;

  return {
    enabled: typeof reminders?.enabled === "boolean" ? reminders.enabled : defaults.enabled,
    sameDay: typeof reminders?.sameDay === "boolean" ? reminders.sameDay : defaults.sameDay,
    dayBefore: typeof reminders?.dayBefore === "boolean" ? reminders.dayBefore : defaults.dayBefore,
    time,
    disabledVesetIds,
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

function buildPresetWithCustomOptions(
  config: AppConfig,
  customOptions: Record<string, boolean>,
): CalculationPreset {
  const basePreset = requirePreset(config, config.activePresetId);
  const customs = { ...basePreset.customs };

  for (const option of config.customOptions) {
    customs[option.customKey] = isCustomOptionEnabled(option, customOptions);
  }

  return {
    ...basePreset,
    customs,
  };
}

function isCustomOptionEnabled(option: CustomOption, customOptions: Record<string, boolean>) {
  return customOptions[option.id] ?? option.defaultEnabled;
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

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    registration.update().catch(() => undefined);
    return registration;
  } catch {
    return null;
  }
}

function maybeShowLocalReminders({
  calculated,
  config,
  language,
  localStorageReady,
  reminders,
}: {
  calculated: ReturnType<typeof calculateVesatot>;
  config: AppConfig;
  language: Language;
  localStorageReady: boolean;
  reminders: ReminderPreferences;
}) {
  if (
    !localStorageReady ||
    !reminders.enabled ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    calculated.length === 0
  ) {
    return;
  }

  if (currentTimeValue() < reminders.time) {
    return;
  }

  const today = todayDateOnly();
  const tomorrow = addDaysToDateOnly(today, 1);
  const sent = safeReadJson<Record<string, boolean>>(REMINDER_SENT_STORAGE_KEY, {});
  const due = calculated.filter((veset) => {
    if (!isVesetReminderEnabled(veset.id, reminders)) {
      return false;
    }

    if (reminders.sameDay && veset.date === today) {
      return true;
    }

    return reminders.dayBefore && veset.date === tomorrow;
  });

  if (due.length === 0) {
    return;
  }

  registerServiceWorker()
    .then((registration) => registration || navigator.serviceWorker?.ready)
    .then((registration) => {
      if (!registration) {
        return;
      }

      for (const veset of due.slice(0, 4)) {
        const timing = veset.date === today ? "today" : "tomorrow";
        const tag = `${today}:${timing}:${veset.id}`;
        if (sent[tag]) {
          continue;
        }

        const onahLabel = veset.onah === "day"
          ? text(config.appText.day, language)
          : text(config.appText.night, language);
        const title = language === "he"
          ? `${vesetTypeLabel(veset.type, language)} - ${onahLabel}`
          : `${vesetTypeLabel(veset.type, language)} - ${onahLabel}`;
        const body = language === "he"
          ? `${timing === "today" ? "היום" : "מחר"}: ${formatUpcomingDate(veset.date, language)}`
          : `${timing === "today" ? "Today" : "Tomorrow"}: ${formatUpcomingDate(veset.date, language)}`;

        registration.showNotification(title, {
          body,
          tag,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
        });
        sent[tag] = true;
      }

      safeWriteJson(REMINDER_SENT_STORAGE_KEY, sent);
    })
    .catch(() => undefined);
}

function currentTimeValue(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
