import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security — Reelio" },
      { name: "description", content: "Global security log of captcha verification failures with timestamps, hashed IPs, email domains, and user agents." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityPage,
});

type Row = Tables<"blocked_submissions">;
type Range = "24h" | "7d" | "30d" | "all";

function sinceMs(r: Range) {
  if (r === "all") return null;
  if (r === "24h") return 24 * 3600_000;
  if (r === "7d") return 7 * 24 * 3600_000;
  return 30 * 24 * 3600_000;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

// Turn raw hCaptcha error-code strings into readable reasons.
function humaniseReason(raw: string | null, reason: string): string {
  if (reason === "captcha_missing") return "No captcha token submitted";
  if (!raw) return "Verification failed";
  const codes = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const map: Record<string, string> = {
    "missing-input-secret": "Server misconfigured (missing secret)",
    "invalid-input-secret": "Server misconfigured (invalid secret)",
    "missing-input-response": "Response token missing",
    "invalid-input-response": "Response token invalid",
    "bad-request": "Malformed request",
    "invalid-or-already-seen-response": "Token already used",
    "not-using-dummy-passcode": "Dummy passcode misuse",
    "sitekey-secret-mismatch": "Sitekey / secret mismatch",
    "timeout-or-duplicate": "Expired or duplicate token",
    "expired-input-response": "Token expired",
  };
  return codes.map((c) => map[c] ?? c).join(" · ");
}

// Compact user-agent summariser (browser + OS) with full string on hover.
function uaSummary(ua: string | null): string {
  if (!ua) return "—";
  const browser =
    /Edg\/([\d.]+)/.exec(ua)?.[0] ??
    /OPR\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /Version\/([\d.]+).+Safari/.exec(ua)?.[0] ??
    "Unknown";
  const os =
    /Windows NT [\d.]+/.exec(ua)?.[0] ??
    /Mac OS X [\d_.]+/.exec(ua)?.[0]?.replace(/_/g, ".") ??
    /Android [\d.]+/.exec(ua)?.[0] ??
    /iPhone OS [\d_]+/.exec(ua)?.[0]?.replace(/_/g, ".") ??
    /Linux/.exec(ua)?.[0] ??
    "Unknown OS";
  return `${browser} · ${os}`;
}

function SecurityPage() {
  const [range, setRange] = useState<Range>("7d");
  const [onlyFailed, setOnlyFailed] = useState(true);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["security_captcha", range, onlyFailed],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("blocked_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      q = onlyFailed
        ? q.eq("reason", "captcha_failed")
        : q.in("reason", ["captcha_failed", "captcha_missing"]);
      const s = sinceMs(range);
      if (s != null) q = q.gte("created_at", new Date(Date.now() - s).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const rows = data ?? [];

  const stats = useMemo(() => {
    const byIp = new Map<string, number>();
    const byDomain = new Map<string, number>();
    const reasons = new Map<string, number>();
    for (const r of rows) {
      if (r.ip_hash) byIp.set(r.ip_hash, (byIp.get(r.ip_hash) ?? 0) + 1);
      if (r.email_domain) byDomain.set(r.email_domain, (byDomain.get(r.email_domain) ?? 0) + 1);
      const key = humaniseReason(r.window_label, r.reason);
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    return {
      total: rows.length,
      uniqueIps: byIp.size,
      uniqueDomains: byDomain.size,
      topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(239,68,68,0.25),transparent_55%),radial-gradient(circle_at_90%_90%,rgba(56,189,248,0.18),transparent_55%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Reelio · Global Security</div>
            <h1 className="text-3xl font-semibold">Captcha verification failures</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Every rejected captcha attempt on the public booking form. IPs and emails are stored as one-way SHA-256 hashes; the email domain is kept in the clear so patterns are readable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              ← Admin
            </Link>
            <Link
              to="/blocked"
              className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              All blocks
            </Link>
            <button
              onClick={() => refetch()}
              className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <Card label="Failures in range" value={stats.total} tone="red" />
          <Card label="Unique IPs (hashed)" value={stats.uniqueIps} tone="amber" />
          <Card label="Unique email domains" value={stats.uniqueDomains} tone="sky" />
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-white/50">Top failure reasons</div>
          {stats.topReasons.length === 0 ? (
            <div className="text-sm text-white/50">No captcha failures in this range.</div>
          ) : (
            <ul className="space-y-2">
              {stats.topReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-sm">{reason}</span>
                  <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2">
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
          <label className="ml-1 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
            <input
              type="checkbox"
              checked={onlyFailed}
              onChange={(e) => setOnlyFailed(e.target.checked)}
              className="accent-red-500"
            />
            <span className="text-white/70">Only verification failures (hide missing tokens)</span>
          </label>
          <span className="ml-auto text-xs text-white/50">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">IP hash</th>
                  <th className="px-4 py-3 text-left">Email (hashed)</th>
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-left">User agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">No captcha failures in this range.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                          r.reason === "captcha_failed"
                            ? "bg-red-500/25 text-red-100 border-red-400/40"
                            : "bg-sky-500/20 text-sky-200 border-sky-400/30"
                        }`}>
                          {r.reason === "captcha_failed" ? "Failed" : "Missing"}
                        </span>
                        <span className="text-xs text-white/60">{humaniseReason(r.window_label, r.reason)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.ip_hash ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.email_hash ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60">{r.email_domain ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-white/60" title={r.user_agent ?? ""}>
                      {uaSummary(r.user_agent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-white/40">
          Note: submitted emails are stored as SHA-256 hashes for privacy. The domain portion is preserved to help you spot patterns (e.g. bursts from a single throwaway domain). Hover a user agent to see the full string.
        </p>
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "sky" }) {
  const cls = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-sky-300";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${cls}`}>{value}</div>
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
