import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "add_booking_note",
  title: "Add booking note",
  description: "Overwrite the internal notes field on a Reelio booking (admins only).",
  inputSchema: {
    id: z.string().uuid().describe("Booking UUID."),
    notes: z.string().trim().min(1).max(4000).describe("Note text to save."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ id, notes }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Sign in required." }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("bookings")
      .update({ notes })
      .eq("id", id)
      .select("id,notes,updated_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Booking not found or forbidden." }], isError: true };
    return {
      content: [{ type: "text", text: `Note saved on booking ${data.id}.` }],
      structuredContent: { booking: data },
    };
  },
});
