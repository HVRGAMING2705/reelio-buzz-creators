import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "update_booking_status",
  title: "Update booking status",
  description:
    "Update the pipeline status of a Reelio booking (admins only). Emits a booking_event automatically.",
  inputSchema: {
    id: z.string().uuid().describe("Booking UUID."),
    status: z
      .enum(["new", "contacted", "qualified", "won", "lost"])
      .describe("New status value."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Sign in required." }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", id)
      .select("id,status,updated_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Booking not found or forbidden." }], isError: true };
    return {
      content: [{ type: "text", text: `Booking ${data.id} status set to ${data.status}.` }],
      structuredContent: { booking: data },
    };
  },
});
