// Lightweight analytics helper.
// Enables GA4 when VITE_GA_MEASUREMENT_ID is set (e.g. "G-XXXXXXXXXX").
// Always pushes events into window.dataLayer so you can swap providers later.

type EventParams = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
let initialized = false;

function isBrowser() {
  return typeof window !== "undefined";
}

export function initAnalytics() {
  if (!isBrowser() || initialized) return;
  initialized = true;
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag = window.gtag || gtag;

  if (!MEASUREMENT_ID) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[analytics] VITE_GA_MEASUREMENT_ID not set — running in dev/no-op mode.");
    }
    return;
  }

  // Load gtag.js
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.gtag!("js", new Date());
  window.gtag!("config", MEASUREMENT_ID, {
    send_page_view: false, // handled manually via trackPageview
    anonymize_ip: true,
  });
}

export function trackPageview(path: string, title?: string) {
  if (!isBrowser()) return;
  const params = {
    page_path: path,
    page_location: window.location.href,
    page_title: title ?? document.title,
  };
  if (MEASUREMENT_ID && window.gtag) {
    window.gtag("event", "page_view", params);
  } else {
    (window.dataLayer ||= []).push(["event", "page_view", params]);
    if (import.meta.env.DEV) console.debug("[analytics] page_view", params);
  }
}

export function trackEvent(name: string, params: EventParams = {}) {
  if (!isBrowser()) return;
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  );
  if (MEASUREMENT_ID && window.gtag) {
    window.gtag("event", name, clean);
  } else {
    (window.dataLayer ||= []).push(["event", name, clean]);
    if (import.meta.env.DEV) console.debug(`[analytics] ${name}`, clean);
  }
}

// Convenience wrappers
export const trackClick = (label: string, extra: EventParams = {}) =>
  trackEvent("click", { label, ...extra });

export const trackFormSubmit = (form: string, extra: EventParams = {}) =>
  trackEvent("form_submit", { form, ...extra });
