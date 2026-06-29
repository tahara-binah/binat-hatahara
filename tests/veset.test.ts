import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import type { CalculationPreset } from "@/lib/config/schema";
import { dateOnlyFromHebrewDate } from "@/lib/dates";
import { calculateEstimatedFutureVesatot, calculateVesatot, type PeriodEntry } from "@/lib/veset";

const standard = DEFAULT_APP_CONFIG.presets.find((preset) => preset.id === "standard")!;

describe("calculateVesatot", () => {
  it("calculates day-based Haflagah from the last two entries", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-29", onah: "day" },
    ];

    const results = calculateVesatot(entries, standard, "en");
    const haflagah = results.find((result) => result.type === "Haflagah");

    expect(haflagah?.date).toBe("2026-02-26");
    expect(haflagah?.onah).toBe("day");
  });

  it("calculates Chabad-style onah Haflagah when enabled", () => {
    const preset: CalculationPreset = {
      ...standard,
      customs: { ...standard.customs, chabadHaflagah: true },
    };
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-02", onah: "night" },
    ];

    const results = calculateVesatot(entries, preset, "en");
    const haflagah = results.find((result) => result.type === "Haflagah");

    expect(haflagah?.date).toBe("2026-01-04");
    expect(haflagah?.onah).toBe("day");
  });

  it("adds both day and night entries for 24-hour Onah Beinonit", () => {
    const preset: CalculationPreset = {
      ...standard,
      customs: { ...standard.customs, onahBeinonit24h: true },
    };

    const results = calculateVesatot(
      [{ id: "a", date: "2026-01-01", onah: "night" }],
      preset,
      "en",
    ).filter((result) => result.type === "Onah Beinonit");

    expect(results.map((result) => result.onah).sort()).toEqual(["day", "night"]);
    expect(results.every((result) => result.date === "2026-01-30")).toBe(true);
  });

  it("adds Or Zarua before each configured veset", () => {
    const preset: CalculationPreset = {
      ...standard,
      customs: { ...standard.customs, includeOrZarua: true },
    };

    const results = calculateVesatot(
      [{ id: "a", date: "2026-01-01", onah: "day" }],
      preset,
      "en",
    );

    const day30 = results.find(
      (result) => result.type === "Onah Beinonit" && result.sourceRule === "onah-beinonit",
    );
    const orZarua = results.find(
      (result) => result.type === "Or Zarua" && result.sourceRule === "or-zarua:onah-beinonit",
    );

    expect(day30?.date).toBe("2026-01-30");
    expect(orZarua?.date).toBe("2026-01-29");
    expect(orZarua?.onah).toBe("night");
  });

  it("uses Hebrew rule names inside Hebrew Or Zarua descriptions", () => {
    const preset: CalculationPreset = {
      ...standard,
      customs: { ...standard.customs, includeOrZarua: true },
    };

    const results = calculateVesatot(
      [{ id: "a", date: "2026-01-01", onah: "day" }],
      preset,
      "he",
    );
    const orZarua = results.find(
      (result) => result.type === "Or Zarua" && result.sourceRule === "or-zarua:onah-beinonit",
    );

    expect(orZarua?.description).toContain("עונה בינונית");
    expect(orZarua?.description).not.toContain("Onah Beinonit");
  });

  it("uses only a fixed Yom HaChodesh after three matching Hebrew dates", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: dateOnlyFromHebrewDate(5, 7, 5786), onah: "day" },
      { id: "b", date: dateOnlyFromHebrewDate(5, 8, 5786), onah: "day" },
      { id: "c", date: dateOnlyFromHebrewDate(5, 9, 5786), onah: "day" },
    ];

    const results = calculateVesatot(entries, standard, "en");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "Yom HaChodesh",
      date: dateOnlyFromHebrewDate(5, 10, 5786),
      onah: "day",
      sourceRule: "veset-kavua-hodesh",
    });
  });

  it("uses only a fixed Haflagah after three equal intervals", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-29", onah: "day" },
      { id: "c", date: "2026-02-26", onah: "day" },
      { id: "d", date: "2026-03-26", onah: "day" },
    ];

    const results = calculateVesatot(entries, standard, "en");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "Haflagah",
      date: "2026-04-23",
      onah: "day",
      sourceRule: "veset-kavua-haflagah",
    });
  });

  it("keeps a fixed veset after one changed sighting and suppresses Onah Beinonit", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: dateOnlyFromHebrewDate(5, 7, 5786), onah: "day" },
      { id: "b", date: dateOnlyFromHebrewDate(5, 8, 5786), onah: "day" },
      { id: "c", date: dateOnlyFromHebrewDate(5, 9, 5786), onah: "day" },
      { id: "d", date: dateOnlyFromHebrewDate(8, 10, 5786), onah: "night" },
    ];

    const results = calculateVesatot(entries, standard, "en");

    expect(results.map((result) => result.sourceRule)).toEqual(
      expect.arrayContaining([
        "veset-kavua-hodesh",
        "yom-hachodesh-after-fixed-change",
        "haflagah-after-fixed-change",
      ]),
    );
    expect(results.some((result) => result.type === "Onah Beinonit")).toBe(false);
  });

  it("returns to standard calculations after three consecutive deviations from a fixed veset", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: dateOnlyFromHebrewDate(5, 7, 5786), onah: "day" },
      { id: "b", date: dateOnlyFromHebrewDate(5, 8, 5786), onah: "day" },
      { id: "c", date: dateOnlyFromHebrewDate(5, 9, 5786), onah: "day" },
      { id: "d", date: dateOnlyFromHebrewDate(8, 10, 5786), onah: "night" },
      { id: "e", date: dateOnlyFromHebrewDate(9, 11, 5786), onah: "day" },
      { id: "f", date: dateOnlyFromHebrewDate(11, 12, 5786), onah: "night" },
    ];

    const results = calculateVesatot(entries, standard, "en");

    expect(results.some((result) => result.sourceRule === "veset-kavua-hodesh")).toBe(false);
    expect(results.some((result) => result.type === "Onah Beinonit")).toBe(true);
  });

  it("does not estimate future dates until at least two period entries exist", () => {
    const results = calculateEstimatedFutureVesatot(
      [{ id: "a", date: "2026-01-01", onah: "day" }],
      standard,
      "en",
    );

    expect(results).toEqual([]);
  });

  it("estimates six months ahead from the median interval across all entries", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-29", onah: "day" },
      { id: "c", date: "2026-02-28", onah: "day" },
      { id: "d", date: "2026-03-28", onah: "day" },
    ];

    const results = calculateEstimatedFutureVesatot(entries, standard, "en");

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.estimated)).toBe(true);
    expect(results.every((result) => result.date <= "2026-10-26")).toBe(true);
    expect(results.some((result) => result.description.includes("28-day cycle"))).toBe(true);
    expect(results.some((result) => result.sourceRule.startsWith("estimated-median:1:"))).toBe(true);
  });

  it("uses the median interval instead of letting one long cycle pull projections upward", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-03-19", onah: "day" },
      { id: "b", date: "2026-04-22", onah: "day" },
      { id: "c", date: "2026-05-20", onah: "day" },
      { id: "d", date: "2026-06-16", onah: "day" },
    ];

    const results = calculateEstimatedFutureVesatot(entries, standard, "en", 2);

    expect(results.some((result) => result.description.includes("28-day cycle"))).toBe(true);
    expect(results.some((result) => result.description.includes("30-day"))).toBe(false);
  });

  it("starts the estimate window after the current confirmed calculations", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-03-19", onah: "day" },
      { id: "b", date: "2026-04-22", onah: "day" },
      { id: "c", date: "2026-05-20", onah: "day" },
      { id: "d", date: "2026-06-16", onah: "day" },
    ];
    const confirmed = calculateVesatot(entries, standard, "en");
    const latestConfirmed = confirmed.reduce(
      (latest, veset) => (veset.date > latest ? veset.date : latest),
      confirmed[0].date,
    );

    const results = calculateEstimatedFutureVesatot(entries, standard, "en", 1);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.date > latestConfirmed)).toBe(true);
    expect(results.every((result) => result.date <= "2026-08-14")).toBe(true);
  });

  it("estimates Yom HaChodesh from the typical recent Hebrew day", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-03-19", onah: "day" },
      { id: "b", date: "2026-04-22", onah: "day" },
      { id: "c", date: "2026-05-20", onah: "day" },
      { id: "d", date: "2026-06-16", onah: "day" },
    ];

    const results = calculateEstimatedFutureVesatot(entries, standard, "en", 2);
    const yomHaChodesh = results.find(
      (result) =>
        result.type === "Yom HaChodesh" &&
        result.sourceRule.includes("typical-hebrew-day"),
    );

    expect(yomHaChodesh?.description).toContain("(4)");
  });

  it("recalculates estimated dates after a new confirmed period entry is added", () => {
    const before: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-29", onah: "day" },
      { id: "c", date: "2026-02-26", onah: "day" },
    ];
    const after: PeriodEntry[] = [
      ...before,
      { id: "d", date: "2026-03-30", onah: "night" },
    ];

    const beforeFirstEstimated = calculateEstimatedFutureVesatot(before, standard, "en")[0];
    const afterFirstEstimated = calculateEstimatedFutureVesatot(after, standard, "en")[0];

    expect(beforeFirstEstimated.date).not.toBe(afterFirstEstimated.date);
    expect(afterFirstEstimated.sourceEntryId).toBe("d");
  });

  it("does not establish a fixed veset from repeated projected future entries", () => {
    const entries: PeriodEntry[] = [
      { id: "a", date: "2026-01-01", onah: "day" },
      { id: "b", date: "2026-01-29", onah: "day" },
    ];

    const results = calculateEstimatedFutureVesatot(entries, standard, "en", 6);
    const thirdProjectedCycle = results.filter((result) => result.estimatedCycleIndex === 3);

    expect(results.some((result) => result.sourceRule.includes("veset-kavua"))).toBe(false);
    expect(thirdProjectedCycle.some((result) => result.type === "Haflagah")).toBe(true);
    expect(thirdProjectedCycle.some((result) => result.type === "Onah Beinonit")).toBe(true);
  });
});
