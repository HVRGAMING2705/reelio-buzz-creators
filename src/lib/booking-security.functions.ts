import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const hashSalt = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ?? "reelio-block-log";
const shortHash = (v: string) =>
  createHash("sha256").update(`${hashSalt()}:${v}`).digest("hex").slice(0, 16);

export const getBlocksForEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(160) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is admin (RLS also enforces, but fail fast)
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .limit(1);
    if (!roles || roles.length === 0) {
      throw new Response("Forbidden", { status: 403 });
    }

    const email_hash = shortHash(data.email);
    const { data: rows, error } = await context.supabase
      .from("blocked_submissions")
      .select("id, reason, window_label, max_allowed, retry_after_sec, user_agent, email_domain, ip_hash, created_at")
      .eq("email_hash", email_hash)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });
