import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "list_security_events",
  title: "List security events",
  description:
    "Recent spam/security events for Reelio: honeypot trips, captcha events, or blocked rate-limited submissions (admins only).",
  inputSchema: {
    kind: z
      .enum(["spam_attempts", "captcha_events", "blocked_submissions"])
      .describe("Which security log to read."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Sign in required." }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from(kind)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
