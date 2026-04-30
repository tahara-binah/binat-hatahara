import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import type { CalculationPreset } from "@/lib/config/schema";
import { dateOnlyFromHebrewDate } from "@/lib/dates";
import { calculateVesatot, type PeriodEntry } from "@/lib/veset";

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
});
