import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "booking_stats",
  title: "Booking stats",
  description:
    "Aggregate counts for Reelio bookings: totals by status, today, and last 7 days (admins only).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Sign in required." }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("bookings")
      .select("status,created_at")
      .limit(2000);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const stats = {
      total: rows.length,
      today: rows.filter((r) => now - new Date(r.created_at).getTime() < dayMs).length,
      last_7d: rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * dayMs).length,
      by_status: rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.status ?? "unknown";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      structuredContent: { stats },
    };
  },
});
