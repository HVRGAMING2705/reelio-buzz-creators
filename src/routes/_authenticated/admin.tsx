import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const LAST_SEEN_KEY = "reelio.admin.lastSeenBookingAt";
const SETTINGS_KEY = "reelio.admin.notifSettings";

type NotifSettings = {
  realtimeEnabled: boolean;
  quietEnabled: boolean;
  quietStart: string; // "HH:MM"
  quietEnd: string;   // "HH:MM"
  captchaEnabled: boolean;
  hcaptchaSiteKey: string;
};

const DEFAULT_SETTINGS: NotifSettings = {
  realtimeEnabled: true,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  captchaEnabled: false,
  hcaptchaSiteKey: "",
};

function loadSettings(): NotifSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isQuietNow(s: NotifSettings, d = new Date()) {
  if (!s.quietEnabled) return false;
  const now = d.getHours() * 60 + d.getMinutes();
  const start = toMinutes(s.quietStart);
  const end = toMinutes(s.quietEnd);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

type Booking = Tables<"bookings">;

const STATUSES = ["new", "confirmed", "canceled"] as const;
type Status = (typeof STATUSES)[number];

const CSV_COLUMNS = [
  "created_at", "name", "brand", "email", "phone",
  "service", "budget", "niche", "status", "message", "notes",
] as const;

function exportBookingsCsv(rows: Booking[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((r) =>
    CSV_COLUMNS.map((k) => esc((r as Record<string, unknown>)[k])).join(","),
  ).join("\n");
  const csv = "\ufeff" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reelio-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NotificationsBell({
  bookings, lastSeen, unreadCount, onMarkAllSeen, onOpen,
}: {
  bookings: Booking[];
  lastSeen: number;
  unreadCount: number;
  onMarkAllSeen: (ts?: number) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [notifStatus, setNotifStatus] = useState<"all" | Status>("all");
  const [notifUnreadOnly, setNotifUnreadOnly] = useState(false);
  const [notifSort, setNotifSort] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Auto-mark as read shortly after opening the dropdown
  useEffect(() => {
    if (!open || unreadCount === 0) return;
    const t = setTimeout(onMarkAllSeen, 600);
    return () => clearTimeout(t);
  }, [open, unreadCount, onMarkAllSeen]);

  const recent = useMemo(() => {
    let list = [...bookings];
    if (notifStatus !== "all") {
      list = list.filter((b) => b.status === notifStatus);
    }
    if (notifUnreadOnly) {
      list = list.filter((b) => new Date(b.created_at).getTime() > lastSeen);
    }
    list.sort((a, b) => {
      const diff = +new Date(b.created_at) - +new Date(a.created_at);
      return notifSort === "newest" ? diff : -diff;
    });
    return list.slice(0, 8);
  }, [bookings, lastSeen, notifStatus, notifUnreadOnly, notifSort]);

  const activeNotifFilters = notifStatus !== "all" || notifUnreadOnly || notifSort !== "newest";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full glass px-3 py-2 text-sm hover:bg-white/10"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} new)` : ""}`}
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_12px_rgba(239,68,68,0.8)] animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl z-30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] opacity-60">Notifications</p>
              <p className="text-sm">
                {unreadCount > 0 ? `${unreadCount} new booking${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllSeen}
                className="text-[10px] uppercase tracking-[0.2em] opacity-70 hover:opacity-100"
              >
                Mark read
              </button>
            )}
          </div>
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-red-500"
                  checked={notifUnreadOnly}
                  onChange={(e) => setNotifUnreadOnly(e.target.checked)}
                />
                Unread
              </label>
              <select
                value={notifStatus}
                onChange={(e) => setNotifStatus(e.target.value as "all" | Status)}
                className="text-xs rounded-full bg-white/5 border border-white/10 px-2 py-1"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={notifSort}
                onChange={(e) => setNotifSort(e.target.value as "newest" | "oldest")}
                className="text-xs rounded-full bg-white/5 border border-white/10 px-2 py-1"
                aria-label="Sort order"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
              {activeNotifFilters && (
                <button
                  onClick={() => {
                    setNotifStatus("all");
                    setNotifUnreadOnly(false);
                    setNotifSort("newest");
                  }}
                  className="text-[10px] uppercase tracking-[0.15em] opacity-70 hover:opacity-100 ml-auto"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm opacity-60">No bookings yet</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.map((b) => {
                const unread = new Date(b.created_at).getTime() > lastSeen;
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => { setOpen(false); onOpen(b.id); }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 flex gap-3 items-start"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                          unread ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" : "bg-white/20"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm truncate">
                            {b.name}
                            {b.brand ? <span className="opacity-60"> · {b.brand}</span> : null}
                          </p>
                          <span className="text-[10px] opacity-60 shrink-0">{timeAgo(b.created_at)}</span>
                        </div>
                        <p className="text-xs opacity-70 truncate">
                          {b.service || "New submission"}
                          {b.budget ? ` · ${b.budget}` : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}



export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Bookings Dashboard — Reelio Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [serviceQ, setServiceQ] = useState("all");
  const [nicheQ, setNicheQ] = useState("all");
  const [budgetQ, setBudgetQ] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now();
    const v = window.localStorage.getItem(LAST_SEEN_KEY);
    return v ? Number(v) : Date.now();
  });
  const notifiedIds = useRef<Set<string>>(new Set());
  const [settings, setSettings] = useState<NotifSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const saveSettings = (next: NotifSettings) => {
    setSettings(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
  };


  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Booking[];
    },
  });

  const { data: role } = useQuery({
    queryKey: ["role"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("role", "admin").maybeSingle();
      return data?.role ?? null;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("bookings").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-bookings-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const b = payload.new as Booking;
          if (notifiedIds.current.has(b.id)) return;
          notifiedIds.current.add(b.id);
          // Always keep data fresh so the bell/list stay in sync
          qc.invalidateQueries({ queryKey: ["bookings"] });
          const s = settingsRef.current;
          if (!s.realtimeEnabled || isQuietNow(s)) return;
          toast.success("New booking submission", {
            description: `${b.name}${b.brand ? ` · ${b.brand}` : ""} — ${b.service ?? "—"}`,
            duration: 10000,
            action: {
              label: "View details",
              onClick: () => {
                markAllSeenRef.current?.();
                navigate({ to: "/bookings/$id", params: { id: b.id } });
              },
            },

          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, navigate]);

  const unreadCount = useMemo(
    () => (bookings ?? []).filter((b) => new Date(b.created_at).getTime() > lastSeen).length,
    [bookings, lastSeen],
  );

  const markAllSeen = () => {
    const now = Date.now();
    setLastSeen(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SEEN_KEY, String(now));
    }
  };

  const markAllSeenRef = useRef(markAllSeen);
  useEffect(() => {
    markAllSeenRef.current = markAllSeen;
  });


  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };


  const uniq = (vals: (string | null)[]) =>
    Array.from(new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))).sort();
  const services = useMemo(() => uniq((bookings ?? []).map((b) => b.service)), [bookings]);
  const niches = useMemo(() => uniq((bookings ?? []).map((b) => b.niche)), [bookings]);
  const budgets = useMemo(() => uniq((bookings ?? []).map((b) => b.budget)), [bookings]);

  const filtered = useMemo(() => {
    if (!bookings) return [];
    const q = search.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86_400_000 : null;
    return bookings.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (serviceQ !== "all" && (b.service ?? "") !== serviceQ) return false;
      if (nicheQ !== "all" && (b.niche ?? "") !== nicheQ) return false;
      if (budgetQ !== "all" && (b.budget ?? "") !== budgetQ) return false;
      const t = new Date(b.created_at).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t >= to) return false;
      if (name && !(b.name ?? "").toLowerCase().includes(name)) return false;
      if (!q) return true;
      return [b.name, b.email, b.brand, b.phone, b.niche, b.service, b.message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [bookings, filter, search, nameQ, serviceQ, nicheQ, budgetQ, dateFrom, dateTo]);

  const selected = filtered.find((b) => b.id === selectedId) ?? bookings?.find((b) => b.id === selectedId);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings?.length ?? 0 };
    for (const s of STATUSES) c[s] = bookings?.filter((b) => b.status === s).length ?? 0;
    return c;
  }, [bookings]);

  return (
    <div className="min-h-screen bg-[color:var(--reelio-black,#0b0b0d)] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-70">Reelio</p>
            <h1 className="text-xl md:text-2xl">Bookings dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {role !== "admin" && (
              <span className="text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-200">
                No admin role
              </span>
            )}
            <NotificationsBell
              bookings={bookings ?? []}
              lastSeen={lastSeen}
              unreadCount={unreadCount}
              onMarkAllSeen={markAllSeen}
              onOpen={(id) => {
                markAllSeen();
                navigate({ to: "/bookings/$id", params: { id } });
              }}

            />
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-full glass px-3 py-2 text-sm hover:bg-white/10"
              aria-label="Notification settings"
              title="Notification settings"
            >
              <span aria-hidden>⚙️</span>
            </button>
            <button
              onClick={signOut}
              className="rounded-full glass px-4 py-2 uppercase tracking-[0.2em] text-[10px]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-[1fr_400px] gap-6">
        <section>
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", ...STATUSES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                  filter === s
                    ? "bg-white text-[color:var(--reelio-black,#0b0b0d)]"
                    : "glass"
                }`}
              >
                {s} <span className="opacity-60 ml-1">{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, brand, niche…"
            className="input-glass mb-3"
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
            <input
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              placeholder="Filter by name"
              className="input-glass"
            />
            <select value={serviceQ} onChange={(e) => setServiceQ(e.target.value)} className="input-glass">
              <option value="all">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={nicheQ} onChange={(e) => setNicheQ(e.target.value)} className="input-glass">
              <option value="all">All niches</option>
              {niches.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={budgetQ} onChange={(e) => setBudgetQ(e.target.value)} className="input-glass">
              <option value="all">All budgets</option>
              {budgets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-glass"
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-glass"
              aria-label="To date"
            />
          </div>

          <div className="flex items-center justify-between mb-4 text-xs opacity-70 gap-3 flex-wrap">
            <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => exportBookingsCsv(filtered)}
                disabled={filtered.length === 0}
                className="uppercase tracking-[0.2em] rounded-full glass px-4 py-2 text-[10px] hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ↓ Export CSV
              </button>
              {(nameQ || serviceQ !== "all" || nicheQ !== "all" || budgetQ !== "all" || dateFrom || dateTo || search) && (
                <button
                  onClick={() => {
                    setNameQ(""); setServiceQ("all"); setNicheQ("all");
                    setBudgetQ("all"); setDateFrom(""); setDateTo(""); setSearch("");
                  }}
                  className="uppercase tracking-[0.2em] hover:text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>


          {isLoading && <p className="opacity-70">Loading…</p>}
          {error && (
            <p className="text-red-300 text-sm">
              {(error as Error).message}. If this says "row-level security", you may not have the
              admin role yet.
            </p>
          )}

          <div className="grid gap-3">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`text-left glass rounded-2xl p-4 transition hover:bg-white/10 ${
                  selectedId === b.id ? "ring-2 ring-white/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg truncate">{b.name}</h3>
                      <StatusPill status={b.status as Status} />
                    </div>
                    <p className="text-xs opacity-70 mt-1 truncate">
                      {b.brand ? `${b.brand} · ` : ""}{b.email} · {b.phone}
                    </p>
                    <p className="text-xs opacity-60 mt-1 truncate">
                      {b.service ?? "—"} · {b.budget ?? "—"} · {b.niche ?? "—"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] opacity-60 whitespace-nowrap">
                    {new Date(b.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="glass rounded-2xl p-8 text-center opacity-70">
                No bookings found.
              </div>
            )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 self-start">
          {selected ? (
            <div className="glass rounded-2xl p-6 conic-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl">{selected.name}</h2>
                  <p className="text-xs opacity-60 mt-1">
                    {new Date(selected.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/bookings/$id"
                    params={{ id: selected.id }}
                    className="rounded-full glass px-3 py-1 uppercase tracking-[0.2em] text-[10px] hover:bg-white/10"
                  >
                    Open ↗
                  </Link>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="opacity-60 hover:opacity-100 text-xl"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm">
                <Row label="Email" value={<a className="underline" href={`mailto:${selected.email}`}>{selected.email}</a>} />
                <Row label="Phone" value={<a className="underline" href={`tel:${selected.phone}`}>{selected.phone}</a>} />
                <Row label="Brand" value={selected.brand || "—"} />
                <Row label="Service" value={selected.service || "—"} />
                <Row label="Budget" value={selected.budget || "—"} />
                <Row label="Niche" value={selected.niche || "—"} />
                <Row label="Message" value={<span className="whitespace-pre-wrap">{selected.message || "—"}</span>} />
              </div>

              <div className="mt-5">
                <p className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus.mutate({ id: selected.id, status: s })}
                      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] transition ${
                        selected.status === s
                          ? "bg-white text-[color:var(--reelio-black,#0b0b0d)]"
                          : "glass"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-[10px] uppercase tracking-[0.25em] opacity-70 mb-2">Notes</p>
                <textarea
                  key={selected.id}
                  defaultValue={selected.notes ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (selected.notes ?? "")) {
                      updateNotes.mutate({ id: selected.id, notes: e.target.value });
                    }
                  }}
                  rows={4}
                  className="input-glass resize-none"
                  placeholder="Internal notes… (saved on blur)"
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    if (confirm("Delete this booking? This cannot be undone.")) {
                      del.mutate(selected.id);
                    }
                  }}
                  className="text-xs uppercase tracking-[0.2em] text-red-300 hover:text-red-200"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="glass rounded-2xl p-6 opacity-70 text-sm">
              Select a booking to view details.
            </div>
          )}
        </aside>
      </main>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={saveSettings}
      />
    </div>
  );
}

function SettingsModal({
  open, onClose, settings, onSave,
}: {
  open: boolean;
  onClose: () => void;
  settings: NotifSettings;
  onSave: (s: NotifSettings) => void;
}) {
  const [draft, setDraft] = useState<NotifSettings>(settings);
  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  if (!open) return null;
  const quietActive = isQuietNow(draft);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-60">Admin</p>
            <h2 className="text-xl">Settings</h2>
          </div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Close">✕</button>
        </div>

        <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mt-2 mb-1">Notifications</p>

        <label className="flex items-start justify-between gap-4 py-3 border-b border-white/10 cursor-pointer">
          <div className="min-w-0">
            <p className="text-sm">Realtime in-app notifications</p>
            <p className="text-xs opacity-60 mt-1">Toast alerts when a new booking is submitted.</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-red-500 mt-1"
            checked={draft.realtimeEnabled}
            onChange={(e) => setDraft({ ...draft, realtimeEnabled: e.target.checked })}
          />
        </label>

        <label className="flex items-start justify-between gap-4 py-3 border-b border-white/10 cursor-pointer">
          <div className="min-w-0">
            <p className="text-sm">Quiet hours</p>
            <p className="text-xs opacity-60 mt-1">Suppress toast alerts during a time window. The unread badge still updates.</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-red-500 mt-1"
            checked={draft.quietEnabled}
            onChange={(e) => setDraft({ ...draft, quietEnabled: e.target.checked })}
          />
        </label>

        <div className={`grid grid-cols-2 gap-3 mt-4 ${draft.quietEnabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">From</label>
            <input
              type="time"
              value={draft.quietStart}
              onChange={(e) => setDraft({ ...draft, quietStart: e.target.value })}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">To</label>
            <input
              type="time"
              value={draft.quietEnd}
              onChange={(e) => setDraft({ ...draft, quietEnd: e.target.value })}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {draft.quietEnabled && (
          <p className="text-xs opacity-60 mt-2">
            {quietActive ? "Quiet hours are active right now." : "Quiet hours are inactive right now."}
            {" "}Spans past midnight are supported.
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-1">Spam protection</p>
          <label className="flex items-start justify-between gap-4 py-3 border-b border-white/10 cursor-pointer">
            <div className="min-w-0">
              <p className="text-sm">Enable hCaptcha on booking form</p>
              <p className="text-xs opacity-60 mt-1">Requires a valid hCaptcha site key below.</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 accent-red-500 mt-1"
              checked={draft.captchaEnabled}
              onChange={(e) => setDraft({ ...draft, captchaEnabled: e.target.checked })}
            />
          </label>
          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">hCaptcha site key</label>
            <input
              type="text"
              value={draft.hcaptchaSiteKey}
              onChange={(e) => setDraft({ ...draft, hcaptchaSiteKey: e.target.value.trim() })}
              placeholder="10000000-ffff-ffff-ffff-000000000001"
              spellCheck={false}
              autoComplete="off"
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs opacity-60 mt-2">
              Get your site key at hcaptcha.com. The secret key is stored server-side separately.
            </p>
            {draft.captchaEnabled && !draft.hcaptchaSiteKey && (
              <p className="text-xs text-red-300 mt-2">Add a site key to activate captcha.</p>
            )}
          </div>
        </div>



        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="rounded-full glass px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); toast.success("Settings saved"); }}
            className="rounded-full bg-red-500 hover:bg-red-600 px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


function StatusPill({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    new: "bg-blue-500/20 text-blue-200",
    confirmed: "bg-green-500/20 text-green-200",
    canceled: "bg-red-500/20 text-red-200",
  };
  return (
    <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${colors[status] ?? colors.new}`}>
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 items-start">
      <span className="text-[10px] uppercase tracking-[0.25em] opacity-60 pt-1">{label}</span>
      <span>{value}</span>
    </div>
  );
}
