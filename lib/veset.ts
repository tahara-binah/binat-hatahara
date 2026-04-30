import type { CalculationPreset, Language, Onah } from "@/lib/config/schema";
import {
  absoluteIndexToOnah,
  addDaysToDateOnly,
  assertDateOnly,
  dateOnlyFromHebrewDate,
  diffDateOnlyDays,
  formatHebrewDate,
  hDateFromDateOnly,
  daysInHebrewMonth,
  nextHebrewMonthRef,
  nextHebrewMonthSameDay,
  onahToAbsoluteIndex,
  type DateOnly,
} from "@/lib/dates";

export interface PeriodEntry {
  id: string;
  date: DateOnly;
  onah: Onah;
}

export type VesetType =
  | "Yom HaChodesh"
  | "Haflagah"
  | "Onah Beinonit"
  | "Day 31"
  | "Or Zarua";

export interface CalculatedVeset {
  id: string;
  type: VesetType;
  date: DateOnly;
  onah: Onah;
  hebrewDate: string;
  description: string;
  sourceEntryId: string;
  sourceRule: string;
}

type VesetDraft = Omit<CalculatedVeset, "id" | "hebrewDate">;

type FixedVeset =
  | {
      kind: "hodesh";
      hebrewDay: number;
      onah: Onah;
      establishedIndex: number;
      deviations: number;
    }
  | {
      kind: "haflagah";
      intervalDays: number;
      onah: Onah;
      establishedIndex: number;
      deviations: number;
    };

export function calculateVesatot(
  entries: PeriodEntry[],
  preset: CalculationPreset,
  language: Language,
): CalculatedVeset[] {
  if (entries.length === 0) {
    return [];
  }

  const sortedEntries = entries
    .map((entry) => ({
      ...entry,
      date: assertDateOnly(entry.date),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lastEntry = sortedEntries[sortedEntries.length - 1];
  const results: CalculatedVeset[] = [];

  const buildVeset = (veset: VesetDraft): CalculatedVeset => ({
      ...veset,
      id: `${veset.type}:${veset.date}:${veset.onah}:${veset.sourceRule}`,
      hebrewDate: formatHebrewDate(veset.date, language),
    });

  const addVeset = (veset: VesetDraft) => {
    results.push(buildVeset(veset));
  };

  const fixedVeset = detectActiveFixedVeset(sortedEntries);
  if (fixedVeset) {
    const fixedResults = [buildVeset(createFixedVeset(fixedVeset, lastEntry, language))];
    if (fixedVeset.deviations === 0) {
      return fixedResults;
    }

    const changedSightResults = [...fixedResults];
    const yomHaChodeshAfterChange = nextHebrewMonthSameDay(lastEntry.date);
    if (yomHaChodeshAfterChange) {
      changedSightResults.push(
        buildVeset({
          type: "Yom HaChodesh",
          date: yomHaChodeshAfterChange,
          onah: lastEntry.onah,
          description:
            language === "he"
              ? "וסת החודש מהראייה האחרונה"
              : "Yom HaChodesh from the most recent sighting",
          sourceEntryId: lastEntry.id,
          sourceRule: "yom-hachodesh-after-fixed-change",
        }),
      );
    }

    if (sortedEntries.length >= 2) {
      const previousEntry = sortedEntries[sortedEntries.length - 2];
      const intervalDays = diffDateOnlyDays(lastEntry.date, previousEntry.date);
      changedSightResults.push(
        buildVeset({
          type: "Haflagah",
          date: addDaysToDateOnly(lastEntry.date, intervalDays),
          onah: lastEntry.onah,
          description:
            language === "he"
              ? `הפלגה מהראייה האחרונה (${intervalDays} ימים)`
              : `Haflagah from the most recent sighting (${intervalDays} days)`,
          sourceEntryId: lastEntry.id,
          sourceRule: "haflagah-after-fixed-change",
        }),
      );
    }

    return sortVesatot(changedSightResults);
  }

  const yomHaChodeshDate = nextHebrewMonthSameDay(lastEntry.date);
  if (yomHaChodeshDate) {
    addVeset({
      type: "Yom HaChodesh",
      date: yomHaChodeshDate,
      onah: lastEntry.onah,
      description:
        language === "he"
          ? "אותו יום עברי בחודש הבא"
          : "Same Hebrew day in the following month",
      sourceEntryId: lastEntry.id,
      sourceRule: "yom-hachodesh",
    });
  }

  const day30 = addDaysToDateOnly(lastEntry.date, 29);
  if (preset.customs.onahBeinonit24h) {
    addVeset({
      type: "Onah Beinonit",
      date: day30,
      onah: "day",
      description:
        language === "he"
          ? "היום השלושים לתחילת המחזור - עונת היום"
          : "The 30th day of the cycle - day onah",
      sourceEntryId: lastEntry.id,
      sourceRule: "onah-beinonit-24h-day",
    });
    addVeset({
      type: "Onah Beinonit",
      date: day30,
      onah: "night",
      description:
        language === "he"
          ? "היום השלושים לתחילת המחזור - עונת הלילה"
          : "The 30th day of the cycle - night onah",
      sourceEntryId: lastEntry.id,
      sourceRule: "onah-beinonit-24h-night",
    });
  } else {
    addVeset({
      type: "Onah Beinonit",
      date: day30,
      onah: lastEntry.onah,
      description:
        language === "he"
          ? "היום השלושים לתחילת המחזור"
          : "The 30th day of the cycle",
      sourceEntryId: lastEntry.id,
      sourceRule: "onah-beinonit",
    });
  }

  if (preset.customs.includeDay31) {
    const day31 = addDaysToDateOnly(lastEntry.date, 30);
    addVeset({
      type: "Day 31",
      date: day31,
      onah: lastEntry.onah,
      description:
        language === "he"
          ? "היום השלושים ואחד לתחילת המחזור"
          : "The 31st day of the cycle",
      sourceEntryId: lastEntry.id,
      sourceRule: "day-31",
    });
  }

  if (sortedEntries.length >= 2) {
    const previousEntry = sortedEntries[sortedEntries.length - 2];

    if (preset.customs.chabadHaflagah) {
      const intervalOnot =
        onahToAbsoluteIndex(lastEntry.date, lastEntry.onah) -
        onahToAbsoluteIndex(previousEntry.date, previousEntry.onah);
      const next = absoluteIndexToOnah(
        onahToAbsoluteIndex(lastEntry.date, lastEntry.onah) + intervalOnot,
      );

      addVeset({
        type: "Haflagah",
        date: next.date,
        onah: next.onah,
        description:
          language === "he"
            ? `אותה הפלגה (${intervalOnot} עונות) מהמחזור הקודם`
            : `Same interval (${intervalOnot} onot) as the last two cycles`,
        sourceEntryId: lastEntry.id,
        sourceRule: "haflagah-onot",
      });
    } else {
      const intervalDays = diffDateOnlyDays(lastEntry.date, previousEntry.date);
      const haflagahDate = addDaysToDateOnly(lastEntry.date, intervalDays);

      addVeset({
        type: "Haflagah",
        date: haflagahDate,
        onah: lastEntry.onah,
        description:
          language === "he"
            ? `אותה הפלגה (${intervalDays} ימים) מהמחזור הקודם`
            : `Same interval (${intervalDays} days) as the last two cycles`,
        sourceEntryId: lastEntry.id,
        sourceRule: "haflagah-days",
      });
    }
  }

  const withOrZarua = [...results];
  if (preset.customs.includeOrZarua) {
    for (const veset of results) {
      withOrZarua.push(createOrZarua(veset, language));
    }
  }

  return sortVesatot(withOrZarua);
}

function sortVesatot(vesatot: CalculatedVeset[]): CalculatedVeset[] {
  return vesatot.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return a.onah === b.onah ? a.type.localeCompare(b.type) : a.onah === "day" ? -1 : 1;
  });
}

function detectActiveFixedVeset(entries: PeriodEntry[]): FixedVeset | null {
  const candidates: FixedVeset[] = [];

  for (let index = 2; index < entries.length; index += 1) {
    const first = entries[index - 2];
    const second = entries[index - 1];
    const third = entries[index];
    const firstHebrew = hDateFromDateOnly(first.date);
    const secondHebrew = hDateFromDateOnly(second.date);
    const thirdHebrew = hDateFromDateOnly(third.date);

    if (
      firstHebrew.getDate() === secondHebrew.getDate() &&
      secondHebrew.getDate() === thirdHebrew.getDate() &&
      first.onah === second.onah &&
      second.onah === third.onah
    ) {
      const evaluated = evaluateFixedVeset(
        {
          kind: "hodesh",
          hebrewDay: thirdHebrew.getDate(),
          onah: third.onah,
          establishedIndex: index,
          deviations: 0,
        },
        entries,
      );

      if (evaluated) {
        candidates.push(evaluated);
      }
    }
  }

  for (let index = 3; index < entries.length; index += 1) {
    const firstInterval = diffDateOnlyDays(entries[index - 2].date, entries[index - 3].date);
    const secondInterval = diffDateOnlyDays(entries[index - 1].date, entries[index - 2].date);
    const thirdInterval = diffDateOnlyDays(entries[index].date, entries[index - 1].date);
    const targetOnah = entries[index].onah;

    if (
      firstInterval === secondInterval &&
      secondInterval === thirdInterval &&
      entries[index - 2].onah === targetOnah &&
      entries[index - 1].onah === targetOnah
    ) {
      const evaluated = evaluateFixedVeset(
        {
          kind: "haflagah",
          intervalDays: thirdInterval,
          onah: targetOnah,
          establishedIndex: index,
          deviations: 0,
        },
        entries,
      );

      if (evaluated) {
        candidates.push(evaluated);
      }
    }
  }

  return (
    candidates.sort((a, b) => {
      if (a.establishedIndex !== b.establishedIndex) {
        return b.establishedIndex - a.establishedIndex;
      }

      return a.kind === "hodesh" ? -1 : 1;
    })[0] || null
  );
}

function evaluateFixedVeset(pattern: FixedVeset, entries: PeriodEntry[]): FixedVeset | null {
  let deviations = 0;

  for (let index = pattern.establishedIndex + 1; index < entries.length; index += 1) {
    const onPattern =
      pattern.kind === "hodesh"
        ? isFixedHodeshOccurrence(entries[index], pattern)
        : isFixedHaflagahOccurrence(entries, index, pattern);

    deviations = onPattern ? 0 : deviations + 1;
    if (deviations >= 3) {
      return null;
    }
  }

  return {
    ...pattern,
    deviations,
  };
}

function isFixedHodeshOccurrence(
  entry: PeriodEntry,
  pattern: Extract<FixedVeset, { kind: "hodesh" }>,
): boolean {
  const hDate = hDateFromDateOnly(entry.date);
  return hDate.getDate() === pattern.hebrewDay && entry.onah === pattern.onah;
}

function isFixedHaflagahOccurrence(
  entries: PeriodEntry[],
  index: number,
  pattern: Extract<FixedVeset, { kind: "haflagah" }>,
): boolean {
  if (index === 0) {
    return false;
  }

  return (
    diffDateOnlyDays(entries[index].date, entries[index - 1].date) === pattern.intervalDays &&
    entries[index].onah === pattern.onah
  );
}

function createFixedVeset(pattern: FixedVeset, lastEntry: PeriodEntry, language: Language): VesetDraft {
  if (pattern.kind === "hodesh") {
    return {
      type: "Yom HaChodesh",
      date: nextHebrewDayAfter(lastEntry.date, pattern.hebrewDay),
      onah: pattern.onah,
      description:
        language === "he"
          ? "וסת קבוע - וסת החודש"
          : "Fixed veset - Yom HaChodesh",
      sourceEntryId: lastEntry.id,
      sourceRule: "veset-kavua-hodesh",
    };
  }

  return {
    type: "Haflagah",
    date: addDaysToDateOnly(lastEntry.date, pattern.intervalDays),
    onah: pattern.onah,
    description:
      language === "he"
        ? `וסת קבוע - הפלגה של ${pattern.intervalDays} ימים`
        : `Fixed veset - ${pattern.intervalDays}-day Haflagah`,
    sourceEntryId: lastEntry.id,
    sourceRule: "veset-kavua-haflagah",
  };
}

function nextHebrewDayAfter(reference: DateOnly, hebrewDay: number): DateOnly {
  const referenceHebrew = hDateFromDateOnly(reference);
  let month = referenceHebrew.getMonth();
  let year = referenceHebrew.getFullYear();

  for (let attempts = 0; attempts < 24; attempts += 1) {
    if (hebrewDay <= daysInHebrewMonth(month, year)) {
      const candidate = dateOnlyFromHebrewDate(hebrewDay, month, year);
      if (candidate > reference) {
        return candidate;
      }
    }

    const next = nextHebrewMonthRef(month, year);
    month = next.month;
    year = next.year;
  }

  throw new Error("Unable to find the next Hebrew fixed veset date.");
}

function createOrZarua(veset: CalculatedVeset, language: Language): CalculatedVeset {
  const previous =
    veset.onah === "day"
      ? { date: addDaysToDateOnly(veset.date, -1), onah: "night" as const }
      : { date: veset.date, onah: "day" as const };

  return {
    id: `or-zarua:${veset.id}`,
    type: "Or Zarua",
    date: previous.date,
    onah: previous.onah,
    hebrewDate: formatHebrewDate(previous.date, language),
    description:
      language === "he"
        ? `אור זרוע עבור ${vesetTypeLabel(veset.type, language)}`
        : `Or Zarua for ${veset.type}`,
    sourceEntryId: veset.sourceEntryId,
    sourceRule: `or-zarua:${veset.sourceRule}`,
  };
}

export function vesetTypeLabel(type: VesetType, language: Language): string {
  const labels: Record<VesetType, Record<Language, string>> = {
    "Yom HaChodesh": { en: "Yom HaChodesh", he: "יום החודש" },
    Haflagah: { en: "Haflagah", he: "הפלגה" },
    "Onah Beinonit": { en: "Onah Beinonit", he: "עונה בינונית" },
    "Day 31": { en: "Day 31", he: "יום ל״א" },
    "Or Zarua": { en: "Or Zarua", he: "אור זרוע" },
  };

  return labels[type][language];
}
