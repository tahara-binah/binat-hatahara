import { z } from "zod";

export const languageSchema = z.enum(["en", "he"]);
export const onahSchema = z.enum(["day", "night"]);

export const localizedTextSchema = z.object({
  en: z.string().min(1, "English text is required"),
  he: z.string().min(1, "Hebrew text is required"),
});

export const calculationCustomsSchema = z.object({
  includeDay31: z.boolean(),
  onahBeinonit24h: z.boolean(),
  includeOrZarua: z.boolean(),
  chabadHaflagah: z.boolean(),
  chabadCarryover: z.boolean(),
});

export const calculationCustomKeySchema = z.enum([
  "includeDay31",
  "onahBeinonit24h",
  "includeOrZarua",
  "chabadHaflagah",
]);

export const calculationPresetSchema = z.object({
  id: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
  name: localizedTextSchema,
  description: localizedTextSchema,
  customs: calculationCustomsSchema,
});

export const customOptionSchema = z.object({
  id: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
  name: localizedTextSchema,
  description: localizedTextSchema,
  customKey: calculationCustomKeySchema,
  defaultEnabled: z.boolean(),
});

export const appInstructionSchema = z.object({
  id: z.string().min(2),
  title: localizedTextSchema,
  body: localizedTextSchema,
});

export const appConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    versionLabel: z.string().min(1),
    defaultLanguage: languageSchema,
    enabledLanguages: z.array(languageSchema).min(1),
    activePresetId: z.string().min(2),
    presets: z.array(calculationPresetSchema).min(1),
    customOptions: z.array(customOptionSchema).default([]),
    featureFlags: z.object({
      showHebrewCalendar: z.boolean(),
      allowManualPresetSelection: z.boolean(),
      showAdminLink: z.boolean(),
    }),
    appText: z.object({
      appTitle: localizedTextSchema,
      upcomingOnot: localizedTextSchema,
      entries: localizedTextSchema,
      settings: localizedTextSchema,
      calendar: localizedTextSchema,
      addEntry: localizedTextSchema,
      editEntry: localizedTextSchema,
      date: localizedTextSchema,
      onah: localizedTextSchema,
      day: localizedTextSchema,
      night: localizedTextSchema,
      save: localizedTextSchema,
      cancel: localizedTextSchema,
      delete: localizedTextSchema,
      noEntries: localizedTextSchema,
      privacyNote: localizedTextSchema,
      guidanceNotice: localizedTextSchema,
      activePreset: localizedTextSchema,
    }),
    instructions: z.array(appInstructionSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const presetIds = new Set(config.presets.map((preset) => preset.id));
    if (!presetIds.has(config.activePresetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activePresetId must match one of the presets",
        path: ["activePresetId"],
      });
    }

    const customOptionIds = new Set<string>();
    const customOptionKeys = new Set<string>();
    config.customOptions.forEach((option, index) => {
      if (customOptionIds.has(option.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom option IDs must be unique",
          path: ["customOptions", index, "id"],
        });
      }
      customOptionIds.add(option.id);

      if (customOptionKeys.has(option.customKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only one public add-on can control each calculation behavior",
          path: ["customOptions", index, "customKey"],
        });
      }
      customOptionKeys.add(option.customKey);
    });

    for (const language of config.enabledLanguages) {
      if (!["en", "he"].includes(language)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unsupported enabled language",
          path: ["enabledLanguages"],
        });
      }
    }
  });

export type Language = z.infer<typeof languageSchema>;
export type Onah = z.infer<typeof onahSchema>;
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type CalculationCustoms = z.infer<typeof calculationCustomsSchema>;
export type CalculationCustomKey = z.infer<typeof calculationCustomKeySchema>;
export type CalculationPreset = z.infer<typeof calculationPresetSchema>;
export type CustomOption = z.infer<typeof customOptionSchema>;
export type AppInstruction = z.infer<typeof appInstructionSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;

export function parseAppConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}

export function safeParseAppConfig(input: unknown) {
  return appConfigSchema.safeParse(input);
}
