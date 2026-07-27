import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";


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

const REPEAT_RE = /(.)\1{9,}/;
const URL_RE = /(https?:\/\/|www\.)/gi;
const containsUrls = (s: string) => (s.match(URL_RE)?.length ?? 0) >= 2;

const bodySchema = z.object({
  form: z.object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{M}'.\- ]+$/u),
    brand: z.string().trim().max(120).optional().or(z.literal("")),
    email: z.string().trim().toLowerCase().email().max(160),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .regex(/^[+\d][\d\s\-()]{6,19}$/),
    service: z.enum(services),
    budget: z.enum(budgets),
    niche: z.string().trim().max(80).optional().or(z.literal("")),
    message: z
      .string()
      .trim()
      .max(1500)
      .refine((v) => !REPEAT_RE.test(v))
      .refine((v) => !containsUrls(v))
      .optional()
      .or(z.literal("")),
    userId: z.string().uuid().optional(),
  }),
  captchaToken: z.string().max(4000).optional().nullable(),
});

async function verifyHCaptcha(secret: string, token: string, ip?: string) {
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (ip) params.set("remoteip", ip);
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return { success: false, reason: `verify_http_${res.status}` };
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return { success: !!json.success, reason: json["error-codes"]?.join(",") };
  } catch {
    return { success: false, reason: "verify_network_error" };
  }
}

const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

// ---- Ad-hoc in-memory rate limiting (per-instance) ----
// Thresholds are configurable in the admin Settings modal and persisted in
// app_settings (key = 'rate_limits'). Defaults: IP 5/10min & 20/hour; Email
// 3/hour & 10/day.
type Bucket = { windowMs: number; max: number; label: string };
type RateBucketRow = { max?: unknown; windowMinutes?: unknown };
type RateLimitRow = {
  ip?: { short?: RateBucketRow; long?: RateBucketRow };
  email?: { short?: RateBucketRow; long?: RateBucketRow };
};

const DEFAULT_LIMITS = {
  ip: {
    short: { max: 5, windowMinutes: 10 },
    long: { max: 20, windowMinutes: 60 },
  },
  email: {
    short: { max: 3, windowMinutes: 60 },
    long: { max: 10, windowMinutes: 60 * 24 },
  },
} as const;

function humanWindow(min: number) {
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  if (min < 60 * 24) {
    const h = Math.round((min / 60) * 10) / 10;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round((min / (60 * 24)) * 10) / 10;
  return `${d} day${d === 1 ? "" : "s"}`;
}

function normBucket(v: RateBucketRow | undefined, fallback: { max: number; windowMinutes: number }): Bucket {
  const max = typeof v?.max === "number" && Number.isFinite(v.max) ? Math.max(1, Math.floor(v.max)) : fallback.max;
  const windowMinutes =
    typeof v?.windowMinutes === "number" && Number.isFinite(v.windowMinutes)
      ? Math.max(1, Math.floor(v.windowMinutes))
      : fallback.windowMinutes;
  return { max, windowMs: windowMinutes * 60_000, label: humanWindow(windowMinutes) };
}

function bucketsFromRow(row: RateLimitRow | null | undefined): { ip: Bucket[]; email: Bucket[] } {
  return {
    ip: [
      normBucket(row?.ip?.short, DEFAULT_LIMITS.ip.short),
      normBucket(row?.ip?.long, DEFAULT_LIMITS.ip.long),
    ],
    email: [
      normBucket(row?.email?.short, DEFAULT_LIMITS.email.short),
      normBucket(row?.email?.long, DEFAULT_LIMITS.email.long),
    ],
  };
}

const hits = new Map<string, number[]>();
function rateCheck(
  key: string,
  buckets: Bucket[],
): { ok: true } | { ok: false; retryAfterSec: number; label: string; max: number } {
  const now = Date.now();
  const maxWindow = Math.max(...buckets.map((b) => b.windowMs));
  const arr = (hits.get(key) ?? []).filter((t) => now - t < maxWindow);
  for (const b of buckets) {
    const inWindow = arr.filter((t) => now - t < b.windowMs);
    if (inWindow.length >= b.max) {
      const oldest = inWindow[0];
      const retryAfterSec = Math.max(1, Math.ceil((b.windowMs - (now - oldest)) / 1000));
      hits.set(key, arr);
      return { ok: false, retryAfterSec, label: b.label, max: b.max };
    }
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const kept = v.filter((t) => now - t < maxWindow);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }
  return { ok: true };
}
const tooMany = (retryAfterSec: number, message: string) =>
  new Response(JSON.stringify({ error: message, code: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSec),
    },
  });

// ---- Hashing helpers for blocked-submission logs ----
const hashSalt = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ?? "reelio-block-log";
const shortHash = (v: string) =>
  createHash("sha256").update(`${hashSalt()}:${v}`).digest("hex").slice(0, 16);
const emailDomainOf = (e: string) => {
  const i = e.lastIndexOf("@");
  return i >= 0 ? e.slice(i + 1).toLowerCase() : null;
};

type BlockLog = {
  reason: "ip_rate_limit" | "email_rate_limit" | "captcha_missing" | "captcha_failed";
  ip?: string;
  email?: string;
  windowLabel?: string;
  maxAllowed?: number;
  retryAfterSec?: number;
  userAgent?: string | null;
};
async function logBlocked(entry: BlockLog) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("blocked_submissions").insert({
      reason: entry.reason,
      ip_hash: entry.ip ? shortHash(entry.ip) : null,
      email_hash: entry.email ? shortHash(entry.email) : null,
      email_domain: entry.email ? emailDomainOf(entry.email) : null,
      window_label: entry.windowLabel ?? null,
      max_allowed: entry.maxAllowed ?? null,
      retry_after_sec: entry.retryAfterSec ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch {
    // Best-effort; never fail the request because of logging.
  }
}


// Tiny in-process cache so we don't hit the DB on every submission.
let cachedLimits: { buckets: { ip: Bucket[]; email: Bucket[] }; at: number } | null = null;
const LIMITS_TTL_MS = 30_000;
async function loadLimits(url: string, key: string): Promise<{ ip: Bucket[]; email: Bucket[] }> {
  const now = Date.now();
  if (cachedLimits && now - cachedLimits.at < LIMITS_TTL_MS) return cachedLimits.buckets;
  try {
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "rate_limits")
      .maybeSingle();
    const buckets = bucketsFromRow((data?.value ?? null) as RateLimitRow | null);
    cachedLimits = { buckets, at: now };
    return buckets;
  } catch {
    const buckets = bucketsFromRow(null);
    cachedLimits = { buckets, at: now };
    return buckets;
  }
}

export const Route = createFileRoute("/api/public/bookings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonError(400, "Invalid JSON");
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return jsonError(400, "Invalid submission");

        const { form, captchaToken } = parsed.data;

        // Rate limiting — per IP and per email. Thresholds come from
        // app_settings (key = 'rate_limits'), cached briefly in memory.
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const rlUrl = process.env.SUPABASE_URL;
        const rlKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const limits = rlUrl && rlKey
          ? await loadLimits(rlUrl, rlKey)
          : bucketsFromRow(null);
        const ua = request.headers.get("user-agent");
        const ipCheck = rateCheck(`ip:${ip}`, limits.ip);
        if (!ipCheck.ok) {
          await logBlocked({
            reason: "ip_rate_limit",
            ip,
            email: form.email,
            windowLabel: ipCheck.label,
            maxAllowed: ipCheck.max,
            retryAfterSec: ipCheck.retryAfterSec,
            userAgent: ua,
          });
          return tooMany(
            ipCheck.retryAfterSec,
            `Too many submissions from your network. Please try again in ~${Math.ceil(ipCheck.retryAfterSec / 60)} min.`,
          );
        }
        const emailCheck = rateCheck(`email:${form.email}`, limits.email);
        if (!emailCheck.ok) {
          await logBlocked({
            reason: "email_rate_limit",
            ip,
            email: form.email,
            windowLabel: emailCheck.label,
            maxAllowed: emailCheck.max,
            retryAfterSec: emailCheck.retryAfterSec,
            userAgent: ua,
          });
          return tooMany(
            emailCheck.retryAfterSec,
            `This email has submitted too many bookings recently. Please try again in ~${Math.ceil(emailCheck.retryAfterSec / 60)} min.`,
          );
        }


        // If HCAPTCHA_SECRET is configured, a valid token is required.
        const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
        if (hcaptchaSecret) {
          if (!captchaToken) {
            await logBlocked({ reason: "captcha_missing", ip, email: form.email, userAgent: ua });
            return new Response(
              JSON.stringify({ error: "Please complete the captcha to continue.", field: "captcha", code: "captcha_missing" }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          }
          const verify = await verifyHCaptcha(hcaptchaSecret, captchaToken, ip);

          if (!verify.success) {
            const reason = verify.reason || "";
            let msg = "Captcha verification failed — please try again.";
            if (reason.includes("expired") || reason.includes("timeout")) {
              msg = "Captcha expired — please tick the box again.";
            } else if (reason.includes("already-seen") || reason.includes("already")) {
              msg = "Captcha already used — please solve it again.";
            } else if (reason.includes("invalid-input-response") || reason.includes("missing-input-response")) {
              msg = "Captcha response was invalid — please retry.";
            } else if (reason.includes("network")) {
              msg = "Couldn't reach captcha service — check your connection and retry.";
            }
            await logBlocked({
              reason: "captcha_failed",
              ip,
              email: form.email,
              windowLabel: reason || undefined,
              userAgent: ua,
            });

            return new Response(
              JSON.stringify({ error: msg, field: "captcha", code: "captcha_failed", reason }),
              { status: 403, headers: { "content-type": "application/json" } },
            );
          }
        }


        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return jsonError(500, "Server misconfigured");

        const supabase = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                h.delete("Authorization");
              }
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { error } = await supabase.from("bookings").insert({
          name: form.name,
          brand: form.brand || null,
          email: form.email,
          phone: form.phone,
          service: form.service,
          budget: form.budget,
          niche: form.niche || null,
          message: form.message || null,
          user_id: form.userId ?? null,
        });

        if (error) return jsonError(500, "Couldn't save booking");
        return Response.json({ ok: true });
      },
    },
  },
});
