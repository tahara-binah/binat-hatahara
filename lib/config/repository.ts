import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_CONFIG, DEFAULT_CONFIG_VERSION } from "./defaults";
import { parseAppConfig, safeParseAppConfig, type AppConfig } from "./schema";

export interface ActiveConfigResult {
  config: AppConfig;
  version: number;
  source: "supabase" | "bundled-default";
  publishedAt: string | null;
}

export interface DraftConfigResult {
  config: AppConfig;
  updatedAt: string | null;
  source: "draft" | "active" | "bundled-default";
}

export interface ConfigVersionSummary {
  id: string;
  version: number;
  status: "active" | "superseded";
  publishedAt: string;
  label: string;
}

export async function loadActiveConfig(
  supabase: SupabaseClient | null,
): Promise<ActiveConfigResult> {
  if (!supabase) {
    return {
      config: DEFAULT_APP_CONFIG,
      version: DEFAULT_CONFIG_VERSION.version,
      source: "bundled-default",
      publishedAt: null,
    };
  }

  const { data, error } = await supabase
    .from("config_versions")
    .select("version, config, published_at")
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      config: DEFAULT_APP_CONFIG,
      version: DEFAULT_CONFIG_VERSION.version,
      source: "bundled-default",
      publishedAt: null,
    };
  }

  return {
    config: parseStoredAppConfig(data.config),
    version: data.version,
    source: "supabase",
    publishedAt: data.published_at,
  };
}

export async function loadDraftConfig(
  supabase: SupabaseClient,
): Promise<DraftConfigResult> {
  const { data, error } = await supabase
    .from("config_drafts")
    .select("config, updated_at")
    .eq("draft_key", "main")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return {
      config: parseStoredAppConfig(data.config),
      updatedAt: data.updated_at,
      source: "draft",
    };
  }

  const active = await loadActiveConfig(supabase);
  return {
    config: active.config,
    updatedAt: active.publishedAt,
    source: active.source === "supabase" ? "active" : "bundled-default",
  };
}

export async function saveDraftConfig(
  supabase: SupabaseClient,
  config: unknown,
  userId: string,
): Promise<DraftConfigResult> {
  const parsed = parseAppConfig(config);

  const { data, error } = await supabase
    .from("config_drafts")
    .upsert(
      {
        draft_key: "main",
        config: parsed,
        updated_by: userId,
      },
      { onConflict: "draft_key" },
    )
    .select("config, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditEvent(supabase, userId, "draft.save", {
    versionLabel: parsed.versionLabel,
  });

  return {
    config: parseStoredAppConfig(data.config),
    updatedAt: data.updated_at,
    source: "draft",
  };
}

export async function publishDraftConfig(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveConfigResult> {
  const draft = await loadDraftConfig(supabase);
  const parsed = parseAppConfig(draft.config);

  const { data: latest, error: latestError } = await supabase
    .from("config_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  const nextVersion = latest ? latest.version + 1 : 1;

  const { error: supersedeError } = await supabase
    .from("config_versions")
    .update({ status: "superseded" })
    .eq("status", "active");

  if (supersedeError) {
    throw new Error(supersedeError.message);
  }

  const { data, error } = await supabase
    .from("config_versions")
    .insert({
      version: nextVersion,
      config: parsed,
      status: "active",
      published_by: userId,
    })
    .select("version, config, published_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditEvent(supabase, userId, "config.publish", {
    version: nextVersion,
    versionLabel: parsed.versionLabel,
  });

  return {
    config: parseStoredAppConfig(data.config),
    version: data.version,
    source: "supabase",
    publishedAt: data.published_at,
  };
}

export async function listConfigVersions(
  supabase: SupabaseClient,
): Promise<ConfigVersionSummary[]> {
  const { data, error } = await supabase
    .from("config_versions")
    .select("id, version, status, published_at, config")
    .order("version", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row) => {
    const parsed = safeParseAppConfig(row.config);
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      publishedAt: row.published_at,
      label: parsed.success ? parsed.data.versionLabel : `Version ${row.version}`,
    };
  });
}

export async function rollbackToVersion(
  supabase: SupabaseClient,
  version: number,
  userId: string,
): Promise<ActiveConfigResult> {
  const { data: target, error: targetError } = await supabase
    .from("config_versions")
    .select("version, config, published_at")
    .eq("version", version)
    .maybeSingle();

  if (targetError || !target) {
    throw new Error(targetError?.message || "Version not found.");
  }

  const { error: supersedeError } = await supabase
    .from("config_versions")
    .update({ status: "superseded" })
    .eq("status", "active");

  if (supersedeError) {
    throw new Error(supersedeError.message);
  }

  const { error: activateError } = await supabase
    .from("config_versions")
    .update({ status: "active" })
    .eq("version", version);

  if (activateError) {
    throw new Error(activateError.message);
  }

  await insertAuditEvent(supabase, userId, "config.rollback", {
    version,
  });

  return {
    config: parseStoredAppConfig(target.config),
    version: target.version,
    source: "supabase",
    publishedAt: target.published_at,
  };
}

function parseStoredAppConfig(input: unknown): AppConfig {
  const parsed = parseAppConfig(input);

  if (input && typeof input === "object" && "customOptions" in input) {
    return parsed;
  }

  return {
    ...parsed,
    customOptions: DEFAULT_APP_CONFIG.customOptions,
  };
}

export async function insertAuditEvent(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from("audit_events").insert({
    actor_id: userId,
    action,
    metadata,
  });

  if (error) {
    throw new Error(error.message);
  }
}
