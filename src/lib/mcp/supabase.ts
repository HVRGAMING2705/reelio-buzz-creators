import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Build a Supabase client that forwards the MCP caller's OAuth bearer token
 * so every read/write runs under that user's RLS.
 */
export function supabaseForCaller(ctx: ToolContext): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) throw new Error("Supabase env not configured");
  const token = ctx.getToken();
  return createClient<Database>(url, anon, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
