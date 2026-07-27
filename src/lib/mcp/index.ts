import { defineMcp } from "@lovable.dev/mcp-js";
import listBookings from "./tools/list-bookings";
import getBooking from "./tools/get-booking";
import updateBookingStatus from "./tools/update-booking-status";
import addBookingNote from "./tools/add-booking-note";
import listSecurityEvents from "./tools/list-security-events";
import bookingStats from "./tools/booking-stats";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "reelio-mcp",
  title: "Reelio Social Consortium",
  version: "0.1.0",
  instructions:
    "Reelio agency ops. Read and manage bookings, review honeypot/captcha/rate-limit security events, and pull pipeline stats. All calls run as the signed-in user with RLS applied — admin role is required for booking and security data.",
  auth: {
    type: "oauth",
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  } as never,
  tools: [
    listBookings,
    getBooking,
    updateBookingStatus,
    addBookingNote,
    listSecurityEvents,
    bookingStats,
  ],
});
