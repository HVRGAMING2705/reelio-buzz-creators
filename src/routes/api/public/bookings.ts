import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
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
// Defaults: IP → 5/10min & 20/hour; Email → 3/hour & 10/day.
type Bucket = { windowMs: number; max: number; label: string };
const IP_BUCKETS: Bucket[] = [
  { windowMs: 10 * 60_000, max: 5, label: "10 minutes" },
  { windowMs: 60 * 60_000, max: 20, label: "hour" },
];
const EMAIL_BUCKETS: Bucket[] = [
  { windowMs: 60 * 60_000, max: 3, label: "hour" },
  { windowMs: 24 * 60 * 60_000, max: 10, label: "day" },
];
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

        // Server-side hCaptcha enforcement.
        // If HCAPTCHA_SECRET is configured, a valid token is required.
        const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
        if (hcaptchaSecret) {
          if (!captchaToken) {
            return new Response(
              JSON.stringify({ error: "Please complete the captcha to continue.", field: "captcha", code: "captcha_missing" }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          }
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            undefined;
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
