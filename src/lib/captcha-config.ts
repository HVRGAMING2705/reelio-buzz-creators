// Global (non per-user) captcha config shared between admin settings and the
// public booking form. Admin writes it; the booking modal reads it.

export const CAPTCHA_CONFIG_KEY = "reelio.captcha.public";

export type CaptchaConfig = {
  enabled: boolean;
  siteKey: string;
};

export const DEFAULT_CAPTCHA_CONFIG: CaptchaConfig = {
  enabled: false,
  siteKey: "",
};

export function loadCaptchaConfig(): CaptchaConfig {
  if (typeof window === "undefined") return DEFAULT_CAPTCHA_CONFIG;
  try {
    const raw = window.localStorage.getItem(CAPTCHA_CONFIG_KEY);
    if (!raw) return DEFAULT_CAPTCHA_CONFIG;
    return { ...DEFAULT_CAPTCHA_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CAPTCHA_CONFIG;
  }
}

export function saveCaptchaConfig(cfg: CaptchaConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAPTCHA_CONFIG_KEY, JSON.stringify(cfg));
    // Notify same-tab listeners (storage events don't fire in the tab that wrote).
    window.dispatchEvent(new CustomEvent("reelio:captcha-config", { detail: cfg }));
  } catch {
    /* ignore */
  }
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
