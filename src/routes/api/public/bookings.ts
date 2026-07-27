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
          if (!captchaToken) return jsonError(400, "Captcha required");
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            undefined;
          const verify = await verifyHCaptcha(hcaptchaSecret, captchaToken, ip);
          if (!verify.success) return jsonError(403, "Captcha verification failed");
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
