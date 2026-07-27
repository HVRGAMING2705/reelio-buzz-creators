import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

type Range = 7 | 30;

type Bucket = { date: string; label: string; honeypot: number; blocked: number };

function buildBuckets(days: number): Bucket[] {
  const out: Bucket[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      date: iso,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      honeypot: 0,
      blocked: 0,
    });
  }
  return out;
}

export function SpamTrendChart() {
  const [range, setRange] = useState<Range>(7);

  const { data, isLoading } = useQuery({
    queryKey: ["spam_trend", range],
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (range - 1));
      const sinceIso = since.toISOString();
      const [honey, block] = await Promise.all([
        supabase.from("spam_attempts").select("created_at").gte("created_at", sinceIso).limit(5000),
        supabase.from("blocked_submissions").select("created_at").gte("created_at", sinceIso).limit(5000),
      ]);
      if (honey.error) throw honey.error;
      if (block.error) throw block.error;
      return { honey: honey.data ?? [], block: block.data ?? [] };
    },
    refetchInterval: 60_000,
  });

  const buckets = useMemo(() => {
    const b = buildBuckets(range);
    const idx = new Map(b.map((x, i) => [x.date, i]));
    for (const r of data?.honey ?? []) {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      const i = idx.get(k);
      if (i != null) b[i].honeypot++;
    }
    for (const r of data?.block ?? []) {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      const i = idx.get(k);
      if (i != null) b[i].blocked++;
    }
    return b;
  }, [data, range]);

  const totals = useMemo(() => {
    let honeypot = 0, blocked = 0, peak = 0, peakDay = "";
    for (const b of buckets) {
      honeypot += b.honeypot;
      blocked += b.blocked;
      const t = b.honeypot + b.blocked;
      if (t > peak) { peak = t; peakDay = b.label; }
    }
    return { honeypot, blocked, peak, peakDay };
  }, [buckets]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Spam trend</div>
          <div className="text-lg font-semibold">Honeypot & blocked attempts</div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d as Range)}
              className={`rounded-full px-3 py-1 transition ${range === d ? "bg-white text-black" : "text-white/70 hover:bg-white/10"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <MiniStat label="Honeypot" value={totals.honeypot} tone="text-fuchsia-300" />
        <MiniStat label="Blocked" value={totals.blocked} tone="text-amber-300" />
        <MiniStat label={`Peak${totals.peakDay ? ` · ${totals.peakDay}` : ""}`} value={totals.peak} tone="text-red-300" />
      </div>

      <div className="h-56 w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-white/50">Loading chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gHoney" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e879f9" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#e879f9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gBlock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.4)"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={range === 30 ? 4 : 0}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
              />
              <Area type="monotone" dataKey="honeypot" name="Honeypot" stroke="#e879f9" strokeWidth={2} fill="url(#gHoney)" />
              <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#fbbf24" strokeWidth={2} fill="url(#gBlock)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
