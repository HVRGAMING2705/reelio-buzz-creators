import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/blocked")({
  head: () => ({
    meta: [
      { title: "Blocked submissions — Reelio" },
      { name: "description", content: "Audit log of rejected booking attempts with hashed IPs, emails, timestamps, and counts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlockedPage,
});

type Row = Tables<"blocked_submissions">;
type Reason = "all" | "ip_rate_limit" | "email_rate_limit" | "captcha_missing" | "captcha_failed";
type Range = "24h" | "7d" | "30d" | "all";

const REASON_LABEL: Record<Exclude<Reason, "all">, string> = {
  ip_rate_limit: "IP rate limit",
  email_rate_limit: "Email rate limit",
  captcha_missing: "Captcha missing",
  captcha_failed: "Captcha failed",
};

const REASON_TONE: Record<Exclude<Reason, "all">, string> = {
  ip_rate_limit: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  email_rate_limit: "bg-orange-500/20 text-orange-200 border-orange-400/30",
  captcha_missing: "bg-sky-500/20 text-sky-200 border-sky-400/30",
  captcha_failed: "bg-red-500/25 text-red-100 border-red-400/40",
};

function sinceMs(range: Range): number | null {
  if (range === "all") return null;
  if (range === "24h") return 24 * 3600_000;
  if (range === "7d") return 7 * 24 * 3600_000;
  return 30 * 24 * 3600_000;
}

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function BlockedPage() {
  const [reason, setReason] = useState<Reason>("all");
  const [range, setRange] = useState<Range>("7d");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["blocked_submissions", reason, range],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("blocked_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (reason !== "all") q = q.eq("reason", reason);
      const since = sinceMs(range);
      if (since != null) q = q.gte("created_at", new Date(Date.now() - since).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = data ?? [];

  const summary = useMemo(() => {
    const byReason = new Map<string, number>();
    const byIp = new Map<string, number>();
    const byEmail = new Map<string, { count: number; domain: string | null }>();
    for (const r of rows) {
      byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
      if (r.ip_hash) byIp.set(r.ip_hash, (byIp.get(r.ip_hash) ?? 0) + 1);
      if (r.email_hash) {
        const e = byEmail.get(r.email_hash);
        byEmail.set(r.email_hash, { count: (e?.count ?? 0) + 1, domain: r.email_domain });
      }
    }
    const topIps = [...byIp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEmails = [...byEmail.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    return { total: rows.length, byReason, topIps, topEmails };
  }, [rows]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.25),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.15),transparent_50%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Reelio · Security</div>
            <h1 className="text-3xl font-semibold">Blocked submissions</h1>
            <p className="mt-1 text-sm text-white/60">
              Booking attempts rejected by rate limits or captcha. IPs and emails are stored as one-way hashes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              ← Admin
            </Link>
            <button
              onClick={() => refetch()}
              className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        {/* Summary cards */}
        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total blocks" value={summary.total} />
          <SummaryCard label="IP rate limit" value={summary.byReason.get("ip_rate_limit") ?? 0} tone="amber" />
          <SummaryCard label="Email rate limit" value={summary.byReason.get("email_rate_limit") ?? 0} tone="orange" />
          <SummaryCard
            label="Captcha"
            value={(summary.byReason.get("captcha_missing") ?? 0) + (summary.byReason.get("captcha_failed") ?? 0)}
            tone="red"
          />
        </section>

        {/* Top offenders */}
        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <TopList
            title="Top IPs (hashed)"
            empty="No blocked IPs in this range."
            items={summary.topIps.map(([hash, count]) => ({
              key: hash,
              primary: <code className="font-mono text-xs">{hash}</code>,
              secondary: null,
              count,
            }))}
          />
          <TopList
            title="Top emails (hashed)"
            empty="No blocked emails in this range."
            items={summary.topEmails.map(([hash, v]) => ({
              key: hash,
              primary: <code className="font-mono text-xs">{hash}</code>,
              secondary: v.domain ? <span className="text-white/50">@{v.domain}</span> : null,
              count: v.count,
            }))}
          />
        </section>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterGroup
            label="Reason"
            value={reason}
            onChange={(v) => setReason(v as Reason)}
            options={[
              { value: "all", label: "All" },
              { value: "ip_rate_limit", label: "IP" },
              { value: "email_rate_limit", label: "Email" },
              { value: "captcha_missing", label: "Captcha missing" },
              { value: "captcha_failed", label: "Captcha failed" },
            ]}
          />
          <FilterGroup
            label="Range"
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "all", label: "All" },
            ]}
          />
          <span className="ml-auto text-xs text-white/50">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">IP hash</th>
                  <th className="px-4 py-3 text-left">Email hash</th>
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-left">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No blocked submissions in this range.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${REASON_TONE[r.reason as Exclude<Reason, "all">] ?? "bg-white/10 border-white/20"}`}>
                        {REASON_LABEL[r.reason as Exclude<Reason, "all">] ?? r.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.ip_hash ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.email_hash ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60">{r.email_domain ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60">
                      {r.reason.endsWith("rate_limit")
                        ? `${r.max_allowed ?? "?"} / ${r.window_label ?? "?"} · retry ${r.retry_after_sec ?? "?"}s`
                        : r.window_label
                          ? <code className="font-mono text-xs">{r.window_label}</code>
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "amber" | "orange" | "red" }) {
  const toneClass =
    tone === "amber" ? "text-amber-300" :
    tone === "orange" ? "text-orange-300" :
    tone === "red" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function TopList({
  title,
  items,
  empty,
}: {
  title: string;
  empty: string;
  items: { key: string; primary: React.ReactNode; secondary: React.ReactNode; count: number }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-white/50">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-white/50">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {it.primary}
                {it.secondary}
              </div>
              <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs font-semibold">{it.count}</span>
            </li>
          ))}
        </ul>
      )}
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
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs">
      <span className="px-2 text-[10px] uppercase tracking-[0.2em] text-white/50">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 transition ${
            value === o.value ? "bg-white text-black" : "text-white/70 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
