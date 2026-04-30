import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import { safeParseAppConfig } from "@/lib/config/schema";

describe("app config schema", () => {
  it("accepts the bundled default config", () => {
    expect(safeParseAppConfig(DEFAULT_APP_CONFIG).success).toBe(true);
  });

  it("rejects configs whose active preset is missing", () => {
    const result = safeParseAppConfig({
      ...DEFAULT_APP_CONFIG,
      activePresetId: "missing",
    });

    expect(result.success).toBe(false);
  });

  it("validates public calculation add-ons", () => {
    const result = safeParseAppConfig(DEFAULT_APP_CONFIG);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customOptions.map((option) => option.id)).toContain("or-zarua");
      expect(result.data.customOptions.every((option) => option.defaultEnabled === false)).toBe(true);
    }
  });
});
