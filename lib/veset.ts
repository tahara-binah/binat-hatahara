import type { CalculationPreset, Language, Onah } from "@/lib/config/schema";
import {
  absoluteIndexToOnah,
  addDaysToDateOnly,
  assertDateOnly,
  diffDateOnlyDays,
  formatHebrewDate,
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

  const addVeset = (veset: Omit<CalculatedVeset, "id" | "hebrewDate">) => {
    results.push({
      ...veset,
      id: `${veset.type}:${veset.date}:${veset.onah}:${veset.sourceRule}`,
      hebrewDate: formatHebrewDate(veset.date, language),
    });
  };

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

  return withOrZarua.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return a.onah === b.onah ? a.type.localeCompare(b.type) : a.onah === "day" ? -1 : 1;
  });
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
