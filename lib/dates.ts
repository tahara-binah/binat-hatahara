import { HDate, gematriya } from "@hebcal/core";
import { format } from "date-fns";

export type DateOnly = `${number}-${number}-${number}`;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface HebrewMonthRef {
  month: number;
  year: number;
}

export function todayDateOnly(now = new Date()): DateOnly {
  return localDateToDateOnly(now);
}

export function assertDateOnly(value: string): DateOnly {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  const parts = parseDateOnly(value as DateOnly);
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return value as DateOnly;
}

export function parseDateOnly(value: DateOnly): DateParts {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function dateOnlyToLocalDate(value: DateOnly): Date {
  const { year, month, day } = parseDateOnly(value);
  return new Date(year, month - 1, day);
}

export function dateOnlyToUtcDayIndex(value: DateOnly): number {
  const { year, month, day } = parseDateOnly(value);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function utcDayIndexToDateOnly(index: number): DateOnly {
  const date = new Date(index * DAY_MS);
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function localDateToDateOnly(date: Date): DateOnly {
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function hDateToDateOnly(hDate: HDate): DateOnly {
  return localDateToDateOnly(hDate.greg());
}

export function addDaysToDateOnly(value: DateOnly, days: number): DateOnly {
  return utcDayIndexToDateOnly(dateOnlyToUtcDayIndex(value) + days);
}

export function diffDateOnlyDays(later: DateOnly, earlier: DateOnly): number {
  return dateOnlyToUtcDayIndex(later) - dateOnlyToUtcDayIndex(earlier);
}

export function hDateFromDateOnly(value: DateOnly): HDate {
  return new HDate(dateOnlyToLocalDate(value));
}

export function formatDateOnly(value: DateOnly, pattern = "MMM d, yyyy"): string {
  return format(dateOnlyToLocalDate(value), pattern);
}

export function formatHebrewDate(value: DateOnly, language: "en" | "he"): string {
  const hDate = hDateFromDateOnly(value);
  return language === "he" ? hDate.renderGematriya() : hDate.toString();
}

export function hebrewDayLabel(day: number): string {
  return gematriya(day);
}

export function hebrewYearLabel(year: number): string {
  return gematriya(year);
}

export function hebrewMonthName(month: number, year: number, language: "en" | "he"): string {
  if (language === "en") {
    return HDate.getMonthName(month, year);
  }

  const leapMonthNames: Record<number, string> = {
    1: "ניסן",
    2: "אייר",
    3: "סיוון",
    4: "תמוז",
    5: "אב",
    6: "אלול",
    7: "תשרי",
    8: "חשוון",
    9: "כסלו",
    10: "טבת",
    11: "שבט",
    12: "אדר א׳",
    13: "אדר ב׳",
  };
  const commonMonthNames: Record<number, string> = {
    ...leapMonthNames,
    12: "אדר",
  };

  return (HDate.isLeapYear(year) ? leapMonthNames : commonMonthNames)[month] || "";
}

export function daysInHebrewMonth(month: number, year: number): number {
  return HDate.daysInMonth(month, year);
}

export function dateOnlyFromHebrewDate(day: number, month: number, year: number): DateOnly {
  return hDateToDateOnly(new HDate(day, month, year));
}

export function hebrewMonthOptions(year: number): HebrewMonthRef[] {
  const months = HDate.isLeapYear(year)
    ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

  return months.map((month) => ({ month, year }));
}

export function nextHebrewMonthRef(month: number, year: number): HebrewMonthRef {
  return nextHebrewMonth(month, year);
}

export function previousHebrewMonthRef(month: number, year: number): HebrewMonthRef {
  if (month === 7) {
    return { month: 6, year: year - 1 };
  }

  if (month === 1) {
    return { month: HDate.isLeapYear(year) ? 13 : 12, year };
  }

  return { month: month - 1, year };
}

export function nextHebrewMonthSameDay(value: DateOnly): DateOnly | null {
  const hDate = hDateFromDateOnly(value);
  const day = hDate.getDate();
  const { month, year } = nextHebrewMonth(hDate.getMonth(), hDate.getFullYear());
  const monthStart = new HDate(1, month, year);

  if (day > monthStart.daysInMonth()) {
    return null;
  }

  return hDateToDateOnly(new HDate(day, month, year));
}

function nextHebrewMonth(month: number, year: number): { month: number; year: number } {
  const isLeapYear = new HDate(1, month, year).isLeapYear();

  if (month === 6) {
    return { month: 7, year: year + 1 };
  }

  if (month === 12 && !isLeapYear) {
    return { month: 1, year };
  }

  if (month === 13) {
    return { month: 1, year };
  }

  return { month: month + 1, year };
}

export function onahToAbsoluteIndex(date: DateOnly, onah: "day" | "night"): number {
  return dateOnlyToUtcDayIndex(date) * 2 + (onah === "day" ? 0 : 1);
}

export function absoluteIndexToOnah(index: number): { date: DateOnly; onah: "day" | "night" } {
  return {
    date: utcDayIndexToDateOnly(Math.floor(index / 2)),
    onah: index % 2 === 0 ? "day" : "night",
  };
}

function formatDateParts(year: number, month: number, day: number): DateOnly {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
}
