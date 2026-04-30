import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import type { CalculationPreset } from "@/lib/config/schema";
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
});
