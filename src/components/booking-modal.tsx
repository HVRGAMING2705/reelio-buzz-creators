import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  CAPTCHA_CONFIG_KEY,
  DEFAULT_CAPTCHA_CONFIG,
  loadCaptchaConfig,
  fetchCaptchaConfig,
  loadHCaptchaScript,
  type CaptchaConfig,
} from "@/lib/captcha-config";

type Props = {
  open: boolean;
  onClose: () => void;
};

const services = [
  "Full Reelio Package",
  "Content Creation",
  "Photo & Video Shoot",
  "Editing & Design",
  "Meta Ads / Digital Marketing",
  "Outreach & Growth",
  "Models & Creators",
] as const;

const budgets = ["< ₹25k", "₹25k – ₹50k", "₹50k – ₹1L", "₹1L+"] as const;

const COOLDOWN_MS = 60_000;
const MIN_FILL_MS = 2_500;
const LAST_KEY = "reelio_last_booking_at";

// Basic spam heuristics
const URL_RE = /(https?:\/\/|www\.)/gi;
const REPEAT_RE = /(.)\1{9,}/; // 10+ same char in a row
const containsUrls = (s: string) => (s.match(URL_RE)?.length ?? 0) >= 2;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name")
    .max(80, "Name is too long")
    .regex(/^[\p{L}\p{M}'.\- ]+$/u, "Use letters only"),
  brand: z.string().trim().max(120, "Brand name is too long").optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone")
    .max(20, "Phone is too long")
    .regex(/^[+\d][\d\s\-()]{6,19}$/, "Digits, spaces, +, -, () only"),
  service: z.enum(services, { errorMap: () => ({ message: "Pick a service" }) }),
  budget: z.enum(budgets, { errorMap: () => ({ message: "Pick a budget" }) }),
  niche: z.string().trim().max(80, "Niche is too long").optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .max(1500, "Keep it under 1500 characters")
    .refine((v) => !REPEAT_RE.test(v), "Looks like spam")
    .refine((v) => !containsUrls(v), "Please avoid multiple links")
    .optional()
    .or(z.literal("")),
});

type FormShape = {
  name: string;
  brand: string;
  email: string;
  phone: string;
  service: (typeof services)[number];
  budget: (typeof budgets)[number];
  niche: string;
  message: string;
};

const emptyForm: FormShape = {
  name: "",
  brand: "",
  email: "",
  phone: "",
  service: services[0],
  budget: budgets[1],
  niche: "",
  message: "",
};

export function BookingModal({ open, onClose }: Props) {
  const [step, setStep] = useState<"form" | "sent">("form");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormShape, string>>>({});
  const [form, setForm] = useState<FormShape>(emptyForm);
  const [honeypot, setHoneypot] = useState(""); // hidden field — bots fill it
  const [user, setUser] = useState<User | null>(null);
  const [captchaCfg, setCaptchaCfg] = useState<CaptchaConfig>(() => loadCaptchaConfig());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetIdRef = useRef<string | null>(null);
  const openedAtRef = useRef<number>(0);

  const captchaActive = captchaCfg.enabled && !!captchaCfg.siteKey;

  // Keep captcha config in sync with backend + admin settings (this tab + other tabs).
  useEffect(() => {
    let cancelled = false;
    // Hydrate from backend (source of truth) on mount and whenever the modal opens.
    fetchCaptchaConfig().then((cfg) => { if (!cancelled) setCaptchaCfg(cfg); }).catch(() => { /* keep cache */ });
    const refresh = () => setCaptchaCfg(loadCaptchaConfig());
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAPTCHA_CONFIG_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("reelio:captcha-config", refresh as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("reelio:captcha-config", refresh as EventListener);
    };
  }, [open]);

  // Render / re-render hCaptcha widget while modal is open and captcha is enabled.
  useEffect(() => {
    if (!open || step !== "form") return;
    if (!captchaActive) {
      setCaptchaToken(null);
      captchaWidgetIdRef.current = null;
      return;
    }
    let cancelled = false;
    loadHCaptchaScript()
      .then((hc: any) => {
        if (cancelled || !captchaContainerRef.current) return;
        // Reset any previous render (site key changed, re-opened, etc.)
        captchaContainerRef.current.innerHTML = "";
        captchaWidgetIdRef.current = hc.render(captchaContainerRef.current, {
          sitekey: captchaCfg.siteKey,
          theme: "dark",
          callback: (token: string) => { setCaptchaToken(token); setCaptchaError(null); },
          "expired-callback": () => { setCaptchaToken(null); setCaptchaError("Captcha expired — please tick the box again."); },
          "error-callback": () => { setCaptchaToken(null); setCaptchaError("Captcha widget error — please retry."); },
        });
      })
      .catch(() => {
        setErrorMsg("Couldn't load captcha — please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, captchaActive, captchaCfg.siteKey]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (session) setUser(session.user);
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => (fe[k] ? { ...fe, [k]: undefined } : fe));
  };

  const charCount = form.message.length;
  const remainingCooldown = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    return Math.max(0, COOLDOWN_MS - (Date.now() - last));
  }, [open, submitting]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Honeypot — silent success to avoid tipping off bots
    if (honeypot.trim() !== "") {
      // Fire-and-forget log; don't await so bots see the same latency as normal success
      try {
        void fetch("/api/public/spam-attempts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: "honeypot",
            email: form.email || undefined,
            form: "booking",
            referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
            page_url: typeof window !== "undefined" ? window.location.href : undefined,
          }),
          keepalive: true,
        });
      } catch {
        // ignore
      }
      setStep("sent");
      return;
    }


    // 2. Minimum time on form
    if (Date.now() - openedAtRef.current < MIN_FILL_MS) {
      setErrorMsg("Please take a moment to review your details.");
      return;
    }

    // 3. Cooldown between submissions on this device
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) {
      const s = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
      setErrorMsg(`You've just submitted a request. Try again in ${s}s.`);
      return;
    }

    // 4. Schema validation
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormShape, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormShape | undefined;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      setErrorMsg("Please fix the highlighted fields.");
      return;
    }

    // 5. hCaptcha (only when admin enabled it with a site key)
    if (captchaActive && !captchaToken) {
      const msg = "Please complete the captcha to continue.";
      setCaptchaError(msg);
      setErrorMsg(msg);
      return;
    }
    setCaptchaError(null);



    setSubmitting(true);
    const v = parsed.data;
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          form: {
            name: v.name,
            brand: v.brand || "",
            email: v.email,
            phone: v.phone,
            service: v.service,
            budget: v.budget,
            niche: v.niche || "",
            message: v.message || "",
            userId: user?.id,
          },
          captchaToken: captchaActive ? captchaToken : null,
        }),
      });
      setSubmitting(false);
      if (!res.ok) {
        let msg = "Couldn't send — please try again.";
        let field: string | undefined;
        if (res.status === 400 || res.status === 403) {
          try {
            const j = (await res.json()) as { error?: string; field?: string };
            if (j?.error) msg = j.error;
            field = j?.field;
          } catch { /* ignore */ }
        }
        setErrorMsg(msg);
        if (field === "captcha" || res.status === 403) {
          setCaptchaError(msg);
        }
        if (captchaActive && typeof window !== "undefined") {
          const hc = (window as any).hcaptcha;
          if (hc && captchaWidgetIdRef.current) {
            try { hc.reset(captchaWidgetIdRef.current); } catch { /* ignore */ }
          }
          setCaptchaToken(null);
        }
        return;
      }
    } catch {
      setSubmitting(false);
      setErrorMsg("Network error — please try again.");
      return;
    }
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setStep("sent");
  };

  const reset = () => {
    setStep("form");
    setForm(emptyForm);
    setFieldErrors({});
    setErrorMsg(null);
    setCaptchaError(null);
    setHoneypot("");
    setCaptchaToken(null);
    if (captchaActive && typeof window !== "undefined") {
      const hc = (window as any).hcaptcha;
      if (hc && captchaWidgetIdRef.current) {
        try { hc.reset(captchaWidgetIdRef.current); } catch { /* ignore */ }
      }
    }
    openedAtRef.current = Date.now();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center p-4 md:p-8"
        >
          {/* Backdrop */}
          <motion.button
            aria-label="Close booking form"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 140, damping: 20 }}
            className="glass conic-border relative w-full max-w-2xl rounded-[2rem] p-6 md:p-10 max-h-[92vh] overflow-y-auto"
          >
            {/* Floating gradient orbs inside modal */}
            <motion.div
              animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full blur-3xl opacity-60"
              style={{ background: "radial-gradient(circle, oklch(0.75 0.22 30), transparent 70%)" }}
            />

            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 h-9 w-9 rounded-full glass-chip grid place-items-center text-lg z-10"
            >
              ×
            </button>

            {step === "form" ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.4em] opacity-80">📅 Book a call</p>
                <h3 className="mt-3 text-4xl md:text-5xl leading-[0.95]">
                  Let's build your <span className="text-shimmer">reel</span>.
                </h3>
                <p className="mt-3 opacity-90 text-sm md:text-base">
                  Tell us about your brand — we'll get back within 24 hours.
                </p>

                {user && (
                  <div className="mt-4 inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-white/80">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Booking as {user.email}
                  </div>
                )}

                <form onSubmit={submit} className="mt-8 grid gap-4" noValidate>
                  {/* Honeypot: hidden from users, visible to naive bots */}
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
                  >
                    <label>
                      Website
                      <input
                        tabIndex={-1}
                        autoComplete="off"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Your name" required error={fieldErrors.name}>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        maxLength={80}
                        autoComplete="name"
                        className="input-glass"
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Brand / Company" error={fieldErrors.brand}>
                      <input
                        value={form.brand}
                        onChange={(e) => set("brand", e.target.value)}
                        maxLength={120}
                        autoComplete="organization"
                        className="input-glass"
                        placeholder="Your brand"
                      />
                    </Field>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Email" required error={fieldErrors.email}>
                      <input
                        required
                        type="email"
                        inputMode="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        maxLength={160}
                        autoComplete="email"
                        className="input-glass"
                        placeholder="you@brand.com"
                      />
                    </Field>
                    <Field label="Phone / WhatsApp" required error={fieldErrors.phone}>
                      <input
                        required
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        maxLength={20}
                        autoComplete="tel"
                        className="input-glass"
                        placeholder="+91 90000 00000"
                      />
                    </Field>
                  </div>

                  <Field label="Service you're interested in" error={fieldErrors.service}>
                    <div className="flex flex-wrap gap-2">
                      {services.map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => set("service", s)}
                          className={`glass-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                            form.service === s ? "bg-white text-[color:var(--reelio-black)]" : ""
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Monthly budget" error={fieldErrors.budget}>
                    <div className="flex flex-wrap gap-2">
                      {budgets.map((b) => (
                        <button
                          type="button"
                          key={b}
                          onClick={() => set("budget", b)}
                          className={`glass-chip rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                            form.budget === b ? "bg-white text-[color:var(--reelio-black)]" : ""
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Niche / Industry" error={fieldErrors.niche}>
                    <input
                      value={form.niche}
                      onChange={(e) => set("niche", e.target.value)}
                      maxLength={80}
                      className="input-glass"
                      placeholder="e.g. Fashion, Café, Fitness…"
                    />
                  </Field>

                  <Field
                    label={`Anything we should know? (${charCount}/1500)`}
                    error={fieldErrors.message}
                  >
                    <textarea
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      rows={4}
                      maxLength={1500}
                      className="input-glass resize-none"
                      placeholder="Goals, timelines, references…"
                    />
                  </Field>

                  {captchaActive && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-[0.25em] opacity-80 mb-2">
                        Verify you're human
                      </span>
                      <div
                        ref={captchaContainerRef}
                        className={`min-h-[78px] rounded-lg ${captchaError ? "ring-1 ring-red-400/70 p-1" : ""}`}
                        aria-invalid={!!captchaError}
                        aria-describedby={captchaError ? "captcha-error" : undefined}
                      />
                      {captchaError && (
                        <p
                          id="captcha-error"
                          role="alert"
                          className="mt-2 text-xs text-red-300 flex items-start gap-1.5"
                        >
                          <span aria-hidden>⚠</span>
                          <span>{captchaError}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {errorMsg && <p className="text-sm text-red-300" role="alert">{errorMsg}</p>}
                  {remainingCooldown > 0 && !errorMsg && (
                    <p className="text-[11px] opacity-60">
                      Cooldown active — you can submit again shortly.
                    </p>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={submitting}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[color:var(--reelio-black)] px-7 py-4 uppercase tracking-[0.2em] text-xs liquid-shine shadow-2xl disabled:opacity-60"
                  >
                    {submitting ? "Sending…" : "Send booking request →"}
                  </motion.button>

                  <p className="text-[10px] opacity-50 text-center">
                    Protected by spam detection. We never share your details.
                  </p>
                </form>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 160, damping: 12 }}
                  className="mx-auto h-20 w-20 rounded-full glass-chip grid place-items-center text-4xl"
                >
                  ✓
                </motion.div>
                <h3 className="mt-6 text-4xl md:text-5xl">You're on the list.</h3>
                <p className="mt-4 opacity-90 max-w-md mx-auto">
                  Thanks {form.name || "there"} — we've got your details. Our team will reach out to{" "}
                  <span className="underline">{form.email}</span> within 24 hours.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={reset}
                    className="glass rounded-full px-6 py-3 uppercase tracking-[0.2em] text-xs"
                  >
                    Send another
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-full bg-white text-[color:var(--reelio-black)] px-6 py-3 uppercase tracking-[0.2em] text-xs"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.25em] opacity-80 mb-2">
        {label} {required && <span className="opacity-60">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-300">{error}</span>}
    </label>
  );
}
