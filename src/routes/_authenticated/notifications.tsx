import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  getHistory,
  markAllRead,
  markRead,
  markUnread,
  clearHistory,
  subscribeHistory,
  type NotifHistoryEntry,
} from "@/lib/notification-history";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notification History · Reelio Admin" },
      { name: "description", content: "Review delivered and suppressed admin notifications." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationHistoryPage,
});

type StatusFilter = "all" | "unread" | "delivered" | "suppressed";
type CategoryFilter = "all" | "bookings" | "system";

function relative(ts: number, now: number) {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function reasonLabel(r?: NotifHistoryEntry["reason"]) {
  switch (r) {
    case "quiet": return "Quiet hours";
    case "disabled": return "Realtime off";
    case "category": return "Category off";
    case "type": return "Type off";
    default: return "Suppressed";
  }
}

function NotificationHistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<NotifHistoryEntry[]>(() => getHistory());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsub = subscribeHistory(() => setEntries(getHistory()));
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (status === "unread" && e.read) return false;
      if (status === "delivered" && e.status !== "delivered") return false;
      if (status === "suppressed" && e.status !== "suppressed") return false;
      return true;
    });
  }, [entries, status, category]);

  const unread = entries.filter((e) => !e.read).length;
  const suppressed = entries.filter((e) => e.status === "suppressed").length;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] opacity-50">Reelio Admin</p>
            <h1 className="text-3xl md:text-4xl mt-1">Notification history</h1>
            <p className="text-sm opacity-70 mt-2">
              {entries.length} total · {unread} unread · {suppressed} suppressed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="rounded-full glass px-4 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              ← Admin
            </Link>
            <button
              onClick={() => markAllRead()}
              disabled={unread === 0}
              className="rounded-full glass px-4 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10 disabled:opacity-40"
            >
              Mark all read
            </button>
            <button
              onClick={() => {
                if (confirm("Clear all notification history on this device?")) clearHistory();
              }}
              disabled={entries.length === 0}
              className="rounded-full glass px-4 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10 disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <FilterGroup
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              ["all", "All"],
              ["unread", "Unread"],
              ["delivered", "Delivered"],
              ["suppressed", "Suppressed"],
            ]}
          />
          <FilterGroup
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as CategoryFilter)}
            options={[
              ["all", "All"],
              ["bookings", "Bookings"],
              ["system", "System"],
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center opacity-70">
            <p className="text-sm">No notifications match these filters.</p>
            <p className="text-xs mt-2 opacity-60">
              History is stored locally per device.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => (
              <li
                key={e.id}
                className={`glass rounded-xl border border-white/10 px-4 py-3 flex items-start gap-3 ${
                  !e.read ? "ring-1 ring-red-500/40" : ""
                }`}
              >
                <span
                  className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                    e.status === "suppressed"
                      ? "bg-amber-400"
                      : !e.read
                        ? "bg-red-500 animate-pulse"
                        : "bg-emerald-500/70"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${!e.read ? "font-medium" : "opacity-90"}`}>
                      {e.title}
                    </p>
                    <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-white/10 opacity-70">
                      {e.category}
                    </span>
                    {e.status === "suppressed" && (
                      <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30">
                        {reasonLabel(e.reason)}
                      </span>
                    )}
                    {!e.read && (
                      <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-200 border border-red-500/30">
                        Unread
                      </span>
                    )}
                  </div>
                  {e.subtitle && (
                    <p className="text-xs opacity-70 mt-0.5 truncate">{e.subtitle}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 mt-1">
                    {relative(e.ts, now)} · {new Date(e.ts).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {e.bookingId && (
                    <button
                      onClick={() => {
                        markRead(e.id);
                        navigate({ to: "/bookings/$id", params: { id: e.bookingId! } });
                      }}
                      className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10"
                    >
                      Open →
                    </button>
                  )}
                  {e.read ? (
                    <button
                      onClick={() => markUnread(e.id)}
                      className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10"
                      title="Mark as unread for later review"
                    >
                      Mark unread
                    </button>
                  ) : (
                    <button
                      onClick={() => markRead(e.id)}
                      className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.25em] opacity-50 mr-1">{label}</span>
      {options.map(([val, lbl]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full border transition ${
            value === val
              ? "bg-red-500/20 border-red-500/50 text-red-100"
              : "bg-white/5 border-white/10 opacity-70 hover:opacity-100"
          }`}
        >
          {lbl}
        </button>
      ))}
    </div>
  );
}
