import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const LAST_SEEN_KEY = "reelio.admin.lastSeenBookingAt";

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
          toast.success("New booking submission", {
            description: `${b.name}${b.brand ? ` · ${b.brand}` : ""} — ${b.service ?? "—"}`,
            action: {
              label: "Open",
              onClick: () => setSelectedId(b.id),
            },
          });
          qc.invalidateQueries({ queryKey: ["bookings"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

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
