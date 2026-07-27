// Global captcha config shared between admin settings and the public booking
// form. Persisted in the `app_settings` table (key = 'captcha') so it stays
// consistent across devices and admin sessions. localStorage is used only as
// an instant-boot cache; the backend is the source of truth.

import { supabase } from "@/integrations/supabase/client";

export const CAPTCHA_CONFIG_KEY = "reelio.captcha.public";
const SETTINGS_ROW_KEY = "captcha";

export type CaptchaConfig = {
  enabled: boolean;
  siteKey: string;
};

export const DEFAULT_CAPTCHA_CONFIG: CaptchaConfig = {
  enabled: false,
  siteKey: "",
};

function normalize(v: unknown): CaptchaConfig {
  const o = (v ?? {}) as Partial<CaptchaConfig>;
  return {
    enabled: !!o.enabled,
    siteKey: typeof o.siteKey === "string" ? o.siteKey : "",
  };
}

/** Synchronous cache read (instant boot). May be stale — always follow with fetchCaptchaConfig(). */
export function loadCaptchaConfig(): CaptchaConfig {
  if (typeof window === "undefined") return DEFAULT_CAPTCHA_CONFIG;
  try {
    const raw = window.localStorage.getItem(CAPTCHA_CONFIG_KEY);
    if (!raw) return DEFAULT_CAPTCHA_CONFIG;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_CAPTCHA_CONFIG;
  }
}

function writeCache(cfg: CaptchaConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAPTCHA_CONFIG_KEY, JSON.stringify(cfg));
    window.dispatchEvent(new CustomEvent("reelio:captcha-config", { detail: cfg }));
  } catch {
    /* ignore */
  }
}

/** Fetch the authoritative config from the backend and refresh the local cache. */
export async function fetchCaptchaConfig(): Promise<CaptchaConfig> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_ROW_KEY)
    .maybeSingle();
  if (error) return loadCaptchaConfig();
  const cfg = normalize(data?.value);
  writeCache(cfg);
  return cfg;
}

/** Upsert config to the backend (admin only via RLS). Refreshes the local cache on success. */
export async function saveCaptchaConfig(cfg: CaptchaConfig): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalize(cfg);
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_ROW_KEY,
      value: normalized,
      updated_by: userRes.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  writeCache(normalized);
  return { ok: true };
}

const HCAPTCHA_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit";

let hcaptchaPromise: Promise<any> | null = null;

export function loadHCaptchaScript(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.hcaptcha) return Promise.resolve(w.hcaptcha);
  if (hcaptchaPromise) return hcaptchaPromise;
  hcaptchaPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${HCAPTCHA_SRC}"]`) as HTMLScriptElement | null;
    const onReady = () => {
      if ((window as any).hcaptcha) resolve((window as any).hcaptcha);
      else reject(new Error("hCaptcha failed to load"));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("hCaptcha failed to load")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = HCAPTCHA_SRC;
    s.async = true;
    s.defer = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("hCaptcha failed to load"));
    document.head.appendChild(s);
  });
  return hcaptchaPromise;
}
