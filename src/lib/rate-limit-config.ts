// Rate-limit thresholds for the public booking endpoint.
// Persisted in app_settings (key = 'rate_limits'); localStorage acts as an
// instant-boot cache for the admin UI. Backend fetches the row per request.

import { supabase } from "@/integrations/supabase/client";

export const RATE_LIMIT_CONFIG_KEY = "reelio.ratelimits.public";
export const RATE_LIMIT_SETTINGS_ROW_KEY = "rate_limits";

export type RateBucket = { max: number; windowMinutes: number };

export type RateLimitConfig = {
  ip: { short: RateBucket; long: RateBucket };
  email: { short: RateBucket; long: RateBucket };
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  ip: {
    short: { max: 5, windowMinutes: 10 },
    long: { max: 20, windowMinutes: 60 },
  },
  email: {
    short: { max: 3, windowMinutes: 60 },
    long: { max: 10, windowMinutes: 60 * 24 },
  },
};

function normBucket(v: unknown, fallback: RateBucket): RateBucket {
  const o = (v ?? {}) as Partial<RateBucket>;
  const max = Number.isFinite(o.max) ? Math.max(1, Math.floor(o.max as number)) : fallback.max;
  const windowMinutes = Number.isFinite(o.windowMinutes)
    ? Math.max(1, Math.floor(o.windowMinutes as number))
    : fallback.windowMinutes;
  return { max, windowMinutes };
}

export function normalizeRateLimitConfig(v: unknown): RateLimitConfig {
  const o = (v ?? {}) as Partial<RateLimitConfig>;
  return {
    ip: {
      short: normBucket(o.ip?.short, DEFAULT_RATE_LIMIT_CONFIG.ip.short),
      long: normBucket(o.ip?.long, DEFAULT_RATE_LIMIT_CONFIG.ip.long),
    },
    email: {
      short: normBucket(o.email?.short, DEFAULT_RATE_LIMIT_CONFIG.email.short),
      long: normBucket(o.email?.long, DEFAULT_RATE_LIMIT_CONFIG.email.long),
    },
  };
}

export function loadRateLimitConfig(): RateLimitConfig {
  if (typeof window === "undefined") return DEFAULT_RATE_LIMIT_CONFIG;
  try {
    const raw = window.localStorage.getItem(RATE_LIMIT_CONFIG_KEY);
    if (!raw) return DEFAULT_RATE_LIMIT_CONFIG;
    return normalizeRateLimitConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RATE_LIMIT_CONFIG;
  }
}

function writeCache(cfg: RateLimitConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RATE_LIMIT_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export async function fetchRateLimitConfig(): Promise<RateLimitConfig> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", RATE_LIMIT_SETTINGS_ROW_KEY)
    .maybeSingle();
  if (error) return loadRateLimitConfig();
  const cfg = normalizeRateLimitConfig(data?.value);
  writeCache(cfg);
  return cfg;
}

export async function saveRateLimitConfig(
  cfg: RateLimitConfig,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeRateLimitConfig(cfg);
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: RATE_LIMIT_SETTINGS_ROW_KEY,
      value: normalized as unknown as Record<string, unknown>,
      updated_by: userRes.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  writeCache(normalized);
  return { ok: true };
}
