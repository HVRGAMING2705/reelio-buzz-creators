import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const bodySchema = z.object({
  reason: z.string().trim().max(64).optional(),
  email: z.string().trim().max(200).optional(),
  form: z.string().trim().max(64).optional(),
  referrer: z.string().trim().max(2048).optional(),
  page_url: z.string().trim().max(2048).optional(),
});

function shortHash(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function emailDomainOf(email?: string) {
  if (!email) return null;
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

function clientIp(request: Request) {
  const h = request.headers;
  const fwd = h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for");
  if (!fwd) return "unknown";
  return fwd.split(",")[0].trim();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export const Route = createFileRoute("/api/public/spam-attempts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let payload: z.infer<typeof bodySchema> = {};
        try {
          const raw = await request.json();
          payload = bodySchema.parse(raw);
        } catch {
          // still log — the trip itself is signal
        }

        const ip = clientIp(request);
        const email = payload.email?.trim().toLowerCase() || undefined;
        const userAgent = request.headers.get("user-agent");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("spam_attempts").insert({
            reason: payload.reason || "honeypot",
            ip_hash: ip !== "unknown" ? shortHash(ip) : null,
            email_hash: email ? shortHash(email) : null,
            email_domain: emailDomainOf(email),
            attempted_email: email ?? null,
            user_agent: userAgent,
            form: payload.form ?? "booking",
          });
        } catch {
          // best-effort
        }

        // Always 200 — do not tip off bots
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
