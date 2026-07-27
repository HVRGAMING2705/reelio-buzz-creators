import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/spam")({
  head: () => ({
    meta: [
      { title: "Spam attempts — Reelio" },
      { name: "description", content: "Honeypot trips and rate-limit rejections with timestamps and reasons." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SpamPage,
});

type Range = "24h" | "7d" | "30d" | "all";
type Source = "all" | "honeypot" | "rate_limit";

type Item = {
  id: string;
  source: "honeypot" | "rate_limit";
  reason: string;
  created_at: string;
  ip_hash: string | null;
  email_hash: string | null;
  email_domain: string | null;
  attempted_email?: string | null;
  form?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  page_url?: string | null;
  window_label?: string | null;
  max_allowed?: number | null;
  retry_after_sec?: number | null;
};

const REASON_LABEL: Record<string, string> = {
  honeypot: "Honeypot",
  ip_rate_limit: "IP rate limit",
  email_rate_limit: "Email rate limit",
  captcha_missing: "Captcha missing",
  captcha_failed: "Captcha failed",
};

const REASON_TONE: Record<string, string> = {
  honeypot: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/30",
  ip_rate_limit: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  email_rate_limit: "bg-orange-500/20 text-orange-200 border-orange-400/30",
  captcha_missing: "bg-sky-500/20 text-sky-200 border-sky-400/30",
  captcha_failed: "bg-red-500/25 text-red-100 border-red-400/40",
};

function sinceIso(range: Range): string | null {
  if (range === "all") return null;
  const ms = range === "24h" ? 24 * 3600_000 : range === "7d" ? 7 * 24 * 3600_000 : 30 * 24 * 3600_000;
  return new Date(Date.now() - ms).toISOString();
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SpamPage() {
  const [range, setRange] = useState<Range>("7d");
  const [source, setSource] = useState<Source>("all");
  const [q, setQ] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["spam_attempts_combined", range],
    queryFn: async (): Promise<Item[]> => {
      const since = sinceIso(range);
      const honeyQ = supabase
        .from("spam_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      const blockQ = supabase
        .from("blocked_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (since) {
        honeyQ.gte("created_at", since);
        blockQ.gte("created_at", since);
      }
      const [h, b] = await Promise.all([honeyQ, blockQ]);
      if (h.error) throw h.error;
      if (b.error) throw b.error;
      const honey: Item[] = (h.data ?? []).map((r) => ({
        id: `h_${r.id}`,
        source: "honeypot",
        reason: r.reason ?? "honeypot",
        created_at: r.created_at,
        ip_hash: r.ip_hash,
        email_hash: r.email_hash,
        email_domain: r.email_domain,
        attempted_email: r.attempted_email,
        form: r.form,
        user_agent: r.user_agent,
        referrer: (r as { referrer?: string | null }).referrer ?? null,
        page_url: (r as { page_url?: string | null }).page_url ?? null,
      }));
      const blocks: Item[] = (b.data ?? []).map((r) => ({
        id: `b_${r.id}`,
        source: "rate_limit",
        reason: r.reason,
        created_at: r.created_at,
        ip_hash: r.ip_hash,
        email_hash: r.email_hash,
        email_domain: r.email_domain,
        user_agent: r.user_agent,
        window_label: r.window_label,
        max_allowed: r.max_allowed,
        retry_after_sec: r.retry_after_sec,
      }));
      return [...honey, ...blocks].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });

  const filtered = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      if (!needle) return true;
      return (
        (r.ip_hash ?? "").toLowerCase().includes(needle) ||
        (r.email_hash ?? "").toLowerCase().includes(needle) ||
        (r.email_domain ?? "").toLowerCase().includes(needle) ||
        (r.attempted_email ?? "").toLowerCase().includes(needle) ||
        (r.user_agent ?? "").toLowerCase().includes(needle) ||
        (r.referrer ?? "").toLowerCase().includes(needle) ||
        (r.page_url ?? "").toLowerCase().includes(needle) ||
        r.reason.toLowerCase().includes(needle)
      );
    });
  }, [data, source, q]);

  const stats = useMemo(() => {
    const rows = data ?? [];
    let honeypot = 0, ipRL = 0, emailRL = 0, captcha = 0;
    for (const r of rows) {
      if (r.source === "honeypot") honeypot++;
      else if (r.reason === "ip_rate_limit") ipRL++;
      else if (r.reason === "email_rate_limit") emailRL++;
      else if (r.reason.startsWith("captcha")) captcha++;
    }
    return { total: rows.length, honeypot, ipRL, emailRL, captcha };
  }, [data]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.25),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,0.15),transparent_50%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Reelio · Security</div>
            <h1 className="text-3xl font-semibold">Spam attempts</h1>
            <p className="mt-1 text-sm text-white/60">
              Honeypot trips and rate-limit rejections from the public booking form. Identifiers are one-way hashed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin" className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10">← Admin</Link>
            <Link to="/blocked" className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10">Blocked</Link>
            <Link to="/security" className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10">Captcha</Link>
            <button onClick={() => refetch()} className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10">
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <Stat label="Total" value={stats.total} />
          <Stat label="Honeypot" value={stats.honeypot} tone="fuchsia" />
          <Stat label="IP rate limit" value={stats.ipRL} tone="amber" />
          <Stat label="Email rate limit" value={stats.emailRL} tone="orange" />
          <Stat label="Captcha" value={stats.captcha} tone="red" />
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterGroup
            label="Source"
            value={source}
            onChange={(v) => setSource(v as Source)}
            options={[
              { value: "all", label: "All" },
              { value: "honeypot", label: "Honeypot" },
              { value: "rate_limit", label: "Rate limit / Captcha" },
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
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reason, email, domain, hash…"
            className="min-w-[220px] flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs placeholder:text-white/40 focus:border-white/30 focus:outline-none"
          />
          <span className="text-xs text-white/50">{filtered.length} row{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">IP hash</th>
                  <th className="px-4 py-3 text-left">Email / domain</th>
                  <th className="px-4 py-3 text-left">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No spam attempts in this range.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/60 uppercase text-[10px] tracking-wider">
                      {r.source === "honeypot" ? "Honeypot" : "Rate limit"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${REASON_TONE[r.reason] ?? "bg-white/10 border-white/20"}`}>
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.ip_hash ?? "—"}</td>
                    <td className="px-4 py-3 text-white/70">
                      {r.attempted_email ? (
                        <div className="text-xs">{r.attempted_email}</div>
                      ) : r.email_hash ? (
                        <code className="font-mono text-xs">{r.email_hash.slice(0, 16)}…</code>
                      ) : "—"}
                      {r.email_domain && <div className="text-[10px] text-white/40">@{r.email_domain}</div>}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {r.source === "rate_limit"
                        ? r.reason.endsWith("rate_limit")
                          ? `${r.max_allowed ?? "?"} / ${r.window_label ?? "?"} · retry ${r.retry_after_sec ?? "?"}s`
                          : r.window_label ?? "—"
                        : r.form
                          ? <span>form: <code className="font-mono">{r.form}</code></span>
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "fuchsia" | "amber" | "orange" | "red" }) {
  const cls =
    tone === "fuchsia" ? "text-fuchsia-300" :
    tone === "amber" ? "text-amber-300" :
    tone === "orange" ? "text-orange-300" :
    tone === "red" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function FilterGroup({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs">
      <span className="px-2 text-[10px] uppercase tracking-[0.2em] text-white/50">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 transition ${value === o.value ? "bg-white text-black" : "text-white/70 hover:bg-white/10"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
