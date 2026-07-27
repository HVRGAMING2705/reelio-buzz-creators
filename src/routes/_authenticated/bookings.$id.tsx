import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { markReadByBookingId } from "@/lib/notification-history";
import type { Tables } from "@/integrations/supabase/types";

type Booking = Tables<"bookings"> & { assigned_to: string | null };
type BookingEvent = Tables<"booking_events">;
type Profile = Tables<"profiles">;

const STATUSES = ["new", "confirmed", "canceled"] as const;
type Status = (typeof STATUSES)[number];

type AdminOption = { user_id: string; display_name: string | null; avatar_url: string | null };

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  head: () => ({
    meta: [
      { title: "Booking Details — Reelio Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => markReadByBookingId(id), 600);
    return () => window.clearTimeout(t);
  }, [id]);

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Booking | null;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["booking-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_events")
        .select("*")
        .eq("booking_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BookingEvent[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["booking-creator", booking?.user_id],
    queryFn: async () => {
      if (!booking?.user_id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", booking.user_id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!booking?.user_id,
  });

  // List of admin users (for assign dropdown)
  const { data: admins } = useQuery({
    queryKey: ["admins-list"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (rolesErr) throw rolesErr;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as AdminOption[];
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      if (profErr) throw profErr;
      const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
      return ids.map((id) => ({
        user_id: id,
        display_name: map.get(id)?.display_name ?? null,
        avatar_url: map.get(id)?.avatar_url ?? null,
      })) as AdminOption[];
    },
  });

  const { data: assigneeProfile } = useQuery({
    queryKey: ["booking-assignee", booking?.assigned_to],
    queryFn: async () => {
      if (!booking?.assigned_to) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", booking.assigned_to)
        .maybeSingle();
      return data as Profile | null;
    },
    enabled: !!booking?.assigned_to,
  });

  const assign = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase
        .from("bookings")
        .update({ assigned_to: userId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, userId) => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      qc.invalidateQueries({ queryKey: ["booking-events", id] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(userId ? "Assigned" : "Unassigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: Status) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      qc.invalidateQueries({ queryKey: ["booking-events", id] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const updateNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("bookings").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      qc.invalidateQueries({ queryKey: ["booking-events", id] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      navigate({ to: "/admin", replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-[color:var(--reelio-black,#0b0b0d)] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Reelio · Admin</p>
            <h1 className="text-xl md:text-2xl">Submission details</h1>
          </div>
          <Link
            to="/admin"
            className="rounded-full glass px-4 py-2 uppercase tracking-[0.2em] text-[10px]"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 grid gap-6">
        {isLoading && <p className="opacity-70">Loading…</p>}
        {error && <p className="text-red-300 text-sm">{(error as Error).message}</p>}
        {!isLoading && !booking && (
          <div className="glass rounded-2xl p-8 text-center opacity-70">
            Booking not found.
          </div>
        )}

        {booking && (
          <>
            <section className="glass rounded-2xl p-6 conic-border">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-3xl">{booking.name}</h2>
                  <p className="text-xs opacity-60 mt-1">
                    Submitted {new Date(booking.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusPill status={booking.status as Status} />
              </div>

              {booking.user_id && (
                <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <Avatar profile={profile ?? null} name={booking.name} size={28} />
                  <div className="text-xs">
                    <span className="opacity-60">Booked by</span>{" "}
                    <span className="font-medium">{profile?.display_name || booking.name}</span>
                    {profile?.display_name && profile.display_name !== booking.name && (
                      <span className="opacity-60"> · {booking.name}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
                <Row label="Email" value={<a className="underline break-all" href={`mailto:${booking.email}`}>{booking.email}</a>} />
                <Row label="Phone" value={<a className="underline" href={`tel:${booking.phone}`}>{booking.phone}</a>} />
                <Row label="Brand" value={booking.brand || "—"} />
                <Row label="Service" value={booking.service || "—"} />
                <Row label="Budget" value={booking.budget || "—"} />
                <Row label="Niche" value={booking.niche || "—"} />
                <Row label="Booking ID" value={<span className="font-mono text-[11px] opacity-70">{booking.id}</span>} />
                <Row label="Last updated" value={new Date(booking.updated_at).toLocaleString()} />
              </div>

              <div className="mt-6">
                <p className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-2">Message</p>
                <div className="glass rounded-xl p-4 whitespace-pre-wrap text-sm">
                  {booking.message || "—"}
                </div>
              </div>
            </section>

            <QuickActions
              booking={booking}
              admins={admins ?? []}
              assigneeProfile={assigneeProfile ?? null}
              onAssign={(uid) => assign.mutate(uid)}
              assigning={assign.isPending}
            />

            <section className="glass rounded-2xl p-6">
              <p className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-3">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus.mutate(s)}
                    disabled={updateStatus.isPending}
                    className={`rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.15em] transition ${
                      booking.status === s
                        ? "bg-white text-[color:var(--reelio-black,#0b0b0d)]"
                        : "glass hover:bg-white/10"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass rounded-2xl p-6">
              <p className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-2">Internal notes</p>
              <textarea
                key={booking.id + (booking.notes ?? "")}
                defaultValue={booking.notes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (booking.notes ?? "")) {
                    updateNotes.mutate(e.target.value);
                  }
                }}
                rows={5}
                className="input-glass resize-none"
                placeholder="Internal notes… (saved on blur)"
              />
            </section>

            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.25em] opacity-70">
                  Activity & confirmation history
                </p>
                <span className="text-[10px] opacity-50">{events?.length ?? 0} events</span>
              </div>
              {!events || events.length === 0 ? (
                <p className="text-sm opacity-60">No events recorded yet.</p>
              ) : (
                <ol className="relative border-l border-white/15 ml-2 space-y-4">
                  {events.map((ev) => (
                    <li key={ev.id} className="pl-4 relative">
                      <span className="absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm">{eventLabel(ev)}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      {(ev.from_value || ev.to_value) && ev.event_type !== "note_updated" && (
                        <p className="text-xs opacity-70 mt-1">
                          {ev.from_value ? <><span className="opacity-60">from</span> {ev.from_value} </> : null}
                          {ev.to_value ? <><span className="opacity-60">→</span> {ev.to_value}</> : null}
                        </p>
                      )}
                      {ev.event_type === "note_updated" && ev.to_value && (
                        <p className="text-xs opacity-70 mt-1 whitespace-pre-wrap">"{ev.to_value}"</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-4 text-[10px] opacity-40">
                Email confirmations will appear here once a sender domain is configured.
              </p>
            </section>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (confirm("Delete this booking? This cannot be undone.")) {
                    del.mutate();
                  }
                }}
                className="text-xs uppercase tracking-[0.2em] text-red-300 hover:text-red-200"
              >
                Delete submission
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function eventLabel(ev: BookingEvent) {
  switch (ev.event_type) {
    case "created": return "Submission received";
    case "status_changed": return "Status changed";
    case "note_updated": return "Notes updated";
    case "assigned": return "Assignment updated";
    case "email_sent": return "Confirmation email sent";
    case "email_confirmed": return "Client confirmed via email";
    default: return ev.event_type;
  }
}

function QuickActions({
  booking,
  admins,
  assigneeProfile,
  onAssign,
  assigning,
}: {
  booking: Booking;
  admins: AdminOption[];
  assigneeProfile: Profile | null;
  onAssign: (userId: string | null) => void;
  assigning: boolean;
}) {
  const [assignOpen, setAssignOpen] = useState(false);

  const handleMarkRead = () => {
    markReadByBookingId(booking.id);
    toast.success("Marked as read");
  };

  const respondSubject = encodeURIComponent(
    `Re: your Reelio booking (${booking.service || "inquiry"})`,
  );
  const respondBody = encodeURIComponent(
    `Hi ${booking.name.split(" ")[0] || ""},\n\nThanks for reaching out to Reelio about ${booking.brand || "your brand"}. `,
  );

  return (
    <section className="glass rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-[0.25em] opacity-70">Quick actions</p>
        {booking.assigned_to && (
          <div className="inline-flex items-center gap-2 text-xs">
            <span className="opacity-60">Assigned to</span>
            <Avatar profile={assigneeProfile} name={assigneeProfile?.display_name || "?"} size={22} />
            <span className="font-medium">{assigneeProfile?.display_name || "Admin"}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={handleMarkRead} className="glass hover:bg-white/10 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.15em]">
          ✓ Mark read
        </button>
        <a
          href={`mailto:${booking.email}?subject=${respondSubject}&body=${respondBody}`}
          className="glass hover:bg-white/10 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.15em]"
        >
          ✉ Respond
        </a>
        <a
          href={`tel:${booking.phone}`}
          className="glass hover:bg-white/10 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.15em]"
        >
          ☎ Call
        </a>

        <div className="relative">
          <button
            onClick={() => setAssignOpen((v) => !v)}
            disabled={assigning}
            className="glass hover:bg-white/10 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.15em]"
          >
            ⇢ {booking.assigned_to ? "Reassign" : "Assign"}
          </button>
          {assignOpen && (
            <div className="absolute right-0 mt-2 z-30 min-w-[220px] rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl shadow-2xl overflow-hidden">
              <ul className="max-h-64 overflow-auto py-1 text-sm">
                {admins.length === 0 && (
                  <li className="px-3 py-2 opacity-60 text-xs">No admins found</li>
                )}
                {admins.map((a) => {
                  const active = a.user_id === booking.assigned_to;
                  return (
                    <li key={a.user_id}>
                      <button
                        onClick={() => {
                          onAssign(a.user_id);
                          setAssignOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/10 ${active ? "bg-white/5" : ""}`}
                      >
                        <Avatar profile={{ avatar_url: a.avatar_url, display_name: a.display_name } as Profile} name={a.display_name || "A"} size={22} />
                        <span className="truncate">{a.display_name || a.user_id.slice(0, 8)}</span>
                        {active && <span className="ml-auto text-[10px] opacity-60">current</span>}
                      </button>
                    </li>
                  );
                })}
                {booking.assigned_to && (
                  <li className="border-t border-white/10 mt-1">
                    <button
                      onClick={() => {
                        onAssign(null);
                        setAssignOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.15em] text-red-300 hover:bg-white/10"
                    >
                      Unassign
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


function StatusPill({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    new: "bg-blue-500/20 text-blue-200",
    confirmed: "bg-green-500/20 text-green-200",
    canceled: "bg-red-500/20 text-red-200",
  };
  return (
    <span className={`text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full ${colors[status] ?? colors.new}`}>
      {status}
    </span>
  );
}

function Avatar({
  profile,
  name,
  size = 32,
}: {
  profile: Profile | null;
  name: string;
  size?: number;
}) {
  const src = profile?.avatar_url;
  const label = profile?.display_name || name;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-white/10 text-white/90 font-semibold shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: Math.max(10, size / 2.5) }}
      title={label}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        name
          .split(/\s+/)
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
      <span className="text-[10px] uppercase tracking-[0.25em] opacity-60 pt-1">{label}</span>
      <span>{value}</span>
    </div>
  );
}
