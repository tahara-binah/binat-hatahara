import type { AppConfig } from "./schema";

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 1,
  versionLabel: "Default v1",
  defaultLanguage: "he",
  enabledLanguages: ["en", "he"],
  activePresetId: "standard",
  presets: [
    {
      id: "standard",
      name: {
        en: "Standard",
        he: "רגיל",
      },
      description: {
        en: "Yom HaChodesh, Haflagah, and Onah Beinonit with conservative defaults.",
        he: "יום החודש, הפלגה, ועונה בינונית עם ברירות מחדל שמרניות.",
      },
      customs: {
        includeDay31: false,
        onahBeinonit24h: false,
        includeOrZarua: false,
        chabadHaflagah: false,
        chabadCarryover: false,
      },
    },
    {
      id: "expanded",
      name: {
        en: "Expanded Customs",
        he: "מנהגים מורחבים",
      },
      description: {
        en: "Adds Day 31 and Or Zarua while keeping day-based Haflagah.",
        he: "מוסיף יום ל״א ואור זרוע, עם הפלגה לפי ימים.",
      },
      customs: {
        includeDay31: true,
        onahBeinonit24h: false,
        includeOrZarua: true,
        chabadHaflagah: false,
        chabadCarryover: false,
      },
    },
    {
      id: "chabad",
      name: {
        en: "Chabad-Oriented",
        he: "מנהג חב״ד",
      },
      description: {
        en: "Uses onah-based Haflagah and keeps carryover behavior enabled for future rule refinements.",
        he: "משתמש בהפלגה לפי עונות ושומר אפשרות גרירה לעדכוני כללים עתידיים.",
      },
      customs: {
        includeDay31: true,
        onahBeinonit24h: true,
        includeOrZarua: true,
        chabadHaflagah: true,
        chabadCarryover: true,
      },
    },
  ],
  customOptions: [
    {
      id: "day-31",
      name: {
        en: "Day 31",
        he: "יום ל״א",
      },
      description: {
        en: "Add the 31st day reminder.",
        he: "הוספת תזכורת ליום השלושים ואחד.",
      },
      customKey: "includeDay31",
      defaultEnabled: false,
    },
    {
      id: "onah-beinonit-24h",
      name: {
        en: "24-hour Onah Beinonit",
        he: "עונה בינונית 24 שעות",
      },
      description: {
        en: "Show both day and night onot for Onah Beinonit.",
        he: "הצגת עונת יום ועונת לילה לעונה בינונית.",
      },
      customKey: "onahBeinonit24h",
      defaultEnabled: false,
    },
    {
      id: "or-zarua",
      name: {
        en: "Or Zarua",
        he: "אור זרוע",
      },
      description: {
        en: "Add Or Zarua reminders before calculated vesatot.",
        he: "הוספת תזכורות אור זרוע לפני וסתות מחושבות.",
      },
      customKey: "includeOrZarua",
      defaultEnabled: false,
    },
    {
      id: "chabad-haflagah",
      name: {
        en: "Onah-based Haflagah",
        he: "הפלגה לפי עונות",
      },
      description: {
        en: "Calculate Haflagah by onot instead of whole days.",
        he: "חישוב הפלגה לפי עונות במקום ימים שלמים.",
      },
      customKey: "chabadHaflagah",
      defaultEnabled: false,
    },
  ],
  featureFlags: {
    showHebrewCalendar: true,
    allowManualPresetSelection: false,
    showAdminLink: true,
  },
  appText: {
    appTitle: {
      en: "Binat Hatahara",
      he: "בינת הטהרה",
    },
    upcomingOnot: {
      en: "Upcoming Onot Perishah",
      he: "עונות פרישה קרובות",
    },
    entries: {
      en: "Entries",
      he: "רשומות",
    },
    settings: {
      en: "Settings",
      he: "הגדרות",
    },
    calendar: {
      en: "Calendar",
      he: "לוח שנה",
    },
    addEntry: {
      en: "Add period start",
      he: "הוספת תחילת מחזור",
    },
    editEntry: {
      en: "Edit entry",
      he: "עריכת רשומה",
    },
    date: {
      en: "Date",
      he: "תאריך",
    },
    onah: {
      en: "Onah",
      he: "עונה",
    },
    day: {
      en: "Day",
      he: "יום",
    },
    night: {
      en: "Night",
      he: "לילה",
    },
    save: {
      en: "Save",
      he: "שמירה",
    },
    cancel: {
      en: "Cancel",
      he: "ביטול",
    },
    delete: {
      en: "Delete",
      he: "מחיקה",
    },
    noEntries: {
      en: "Add your last two period starts to unlock the full interval calculation.",
      he: "הוסיפי את שתי תחילות המחזור האחרונות כדי לחשב גם הפלגה.",
    },
    privacyNote: {
      en: "Your entries stay private on this device.",
      he: "הרשומות שלך נשמרות באופן פרטי במכשיר זה.",
    },
    guidanceNotice: {
      en: "This app provides configurable reminders and should be used according to your Rav or halachic authority.",
      he: "האפליקציה מספקת תזכורות לפי הגדרות ויש להשתמש בה לפי הוראת הרב או הסמכות ההלכתית שלך.",
    },
    activePreset: {
      en: "Active preset",
      he: "הגדרה פעילה",
    },
  },
  instructions: [
    {
      id: "entries",
      title: {
        en: "Add entries",
        he: "הוספת רשומות",
      },
      body: {
        en: "Record the date and onah for each period start. Two entries are needed for Haflagah.",
        he: "רשמי תאריך ועונה לכל תחילת מחזור. לחישוב הפלגה נדרשות שתי רשומות.",
      },
    },
    {
      id: "privacy",
      title: {
        en: "Privacy",
        he: "פרטיות",
      },
      body: {
        en: "Personal entries are saved locally in your browser and are not sent to Supabase.",
        he: "הרשומות האישיות נשמרות בדפדפן בלבד ואינן נשלחות לסופאבייס.",
      },
    },
  ],
};

export const DEFAULT_CONFIG_VERSION = {
  version: 0,
  source: "bundled-default",
};
