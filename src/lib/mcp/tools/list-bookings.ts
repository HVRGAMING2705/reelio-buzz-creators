import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "list_bookings",
  title: "List bookings",
  description:
    "List Reelio bookings (admins only). Returns id, name, email, service, status, and created_at, newest first.",
  inputSchema: {
    status: z
      .enum(["new", "contacted", "qualified", "won", "lost"])
      .optional()
      .describe("Filter by booking status."),
    limit: z.number().int().min(1).max(100).default(25).describe("How many rows to return."),
    search: z.string().trim().min(1).optional().describe("Case-insensitive match on name, email, or brand."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Sign in required." }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    let q = supabase
      .from("bookings")
      .select("id,name,brand,email,service,status,budget,niche,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`name.ilike.${s},email.ilike.${s},brand.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { bookings: data ?? [] },
    };
  },
});
