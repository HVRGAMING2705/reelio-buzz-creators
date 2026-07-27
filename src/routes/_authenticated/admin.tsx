import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  logNotification,
  markReadByBookingId,
  markUnreadByBookingId,
  markAllBookingsRead,
  markAllBookingsUnread,
  getReadBookingIds,
  subscribeHistory,
  getHistory,
  clearHistory,
  type NotifHistoryEntry,
} from "@/lib/notification-history";
import { SpamTrendChart } from "@/components/spam-trend-chart";
import { saveCaptchaConfig, fetchCaptchaConfig } from "@/lib/captcha-config";
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  fetchRateLimitConfig,
  saveRateLimitConfig,
  type RateLimitConfig,
} from "@/lib/rate-limit-config";

const LAST_SEEN_KEY = "reelio.admin.lastSeenBookingAt";
const SETTINGS_KEY_BASE = "reelio.admin.notifSettings";
const settingsKeyFor = (userId: string | null) =>
  userId ? `${SETTINGS_KEY_BASE}:${userId}` : SETTINGS_KEY_BASE;
const NOTIF_FILTERS_KEY_BASE = "reelio.admin.notifFilters";
const notifFiltersKeyFor = (userId: string | null) =>
  userId ? `${NOTIF_FILTERS_KEY_BASE}:${userId}` : NOTIF_FILTERS_KEY_BASE;

type NotifFilters = {
  unreadOnly: boolean;
  todayOnly: boolean;
  service: "all" | string;
  sort: "newest" | "oldest";
  status: "all" | Status;
};
const DEFAULT_NOTIF_FILTERS: NotifFilters = { unreadOnly: false, todayOnly: false, service: "all", sort: "newest", status: "all" };

function loadNotifFilters(userId: string | null): NotifFilters {
  if (typeof window === "undefined") return DEFAULT_NOTIF_FILTERS;
  try {
    const raw = window.localStorage.getItem(notifFiltersKeyFor(userId));
    if (!raw) return DEFAULT_NOTIF_FILTERS;
    return { ...DEFAULT_NOTIF_FILTERS, ...JSON.parse(raw) };
  } catch { return DEFAULT_NOTIF_FILTERS; }
}

function saveNotifFilters(userId: string | null, filters: NotifFilters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(notifFiltersKeyFor(userId), JSON.stringify(filters));
  } catch { /* ignore */ }
}

type NotifFrequency = "instant" | "1m" | "5m";

// Day-of-week: 0 = Sunday .. 6 = Saturday, matching Date.getDay().
export type QuietSchedule = {
  id: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  days: number[]; // subset of 0..6; empty means "no days" (inactive row)
};

const ALL_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function makeScheduleId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `qs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type NotifChannel = "inApp" | "email" | "push";

type NotifSettings = {
  realtimeEnabled: boolean;
  quietEnabled: boolean;
  quietStart: string; // legacy single window, kept for back-compat
  quietEnd: string;   // legacy single window, kept for back-compat
  quietSchedules: QuietSchedule[]; // preferred: per-day time ranges
  channelInApp: boolean; // toast + notification bell
  channelEmail: boolean; // send admin email on qualifying events
  channelPush: boolean;  // browser push (Notification API)
  captchaEnabled: boolean;
  hcaptchaSiteKey: string;
  categoryBookings: boolean;
  categoryOutreach: boolean;
  categoryInvoices: boolean;
  notifyNewBooking: boolean;
  notifyStatusChange: boolean;
  notifyNoteUpdate: boolean;
  frequency: NotifFrequency;
  rateLimits: RateLimitConfig;
};

const DEFAULT_SETTINGS: NotifSettings = {
  realtimeEnabled: true,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  quietSchedules: [],
  channelInApp: true,
  channelEmail: false,
  channelPush: false,
  captchaEnabled: false,
  hcaptchaSiteKey: "",
  categoryBookings: true,
  categoryOutreach: true,
  categoryInvoices: true,
  notifyNewBooking: true,
  notifyStatusChange: true,
  notifyNoteUpdate: false,
  frequency: "instant",
  rateLimits: DEFAULT_RATE_LIMIT_CONFIG,
};

const FREQUENCY_MS: Record<NotifFrequency, number> = {
  instant: 0,
  "1m": 60_000,
  "5m": 300_000,
};

function migrateSettings(s: NotifSettings): NotifSettings {
  let next = s;
  if (!Array.isArray(next.quietSchedules) || next.quietSchedules.length === 0) {
    next = {
      ...next,
      quietSchedules: [
        { id: makeScheduleId(), start: next.quietStart, end: next.quietEnd, days: [...ALL_DAYS] },
      ],
    };
  }
  // Keep the legacy `realtimeEnabled` flag and the new `channelInApp` toggle
  // in sync so older stored settings still control the in-app toast channel.
  if ((s as Partial<NotifSettings>).channelInApp === undefined) {
    next = { ...next, channelInApp: next.realtimeEnabled };
  } else {
    next = { ...next, realtimeEnabled: next.channelInApp };
  }
  return next;
}

function loadSettings(userId: string | null): NotifSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw =
      window.localStorage.getItem(settingsKeyFor(userId)) ??
      (userId ? window.localStorage.getItem(SETTINGS_KEY_BASE) : null);
    if (!raw) return migrateSettings(DEFAULT_SETTINGS);
    return migrateSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch { return migrateSettings(DEFAULT_SETTINGS); }
}

function pushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function ensurePushPermission(): Promise<NotificationPermission | "unsupported"> {
  const current = pushPermission();
  if (current !== "default") return current;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function firePushNotification(title: string, body?: string, tag?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/favicon.ico" });
  } catch { /* ignore */ }
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function scheduleCoversMoment(sch: QuietSchedule, d: Date): boolean {
  if (!sch.days || sch.days.length === 0) return false;
  const start = toMinutes(sch.start);
  const end = toMinutes(sch.end);
  if (start === end) return false;
  const day = d.getDay();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  if (start < end) {
    return sch.days.includes(day) && nowMin >= start && nowMin < end;
  }
  // Wraps past midnight: active on `day` from start until 24:00, and on the
  // *next* day from 00:00 until end. So we're covered if either:
  //   - today is a scheduled day AND now >= start
  //   - yesterday was a scheduled day AND now < end
  const prevDay = (day + 6) % 7;
  return (
    (sch.days.includes(day) && nowMin >= start) ||
    (sch.days.includes(prevDay) && nowMin < end)
  );
}

function isQuietNow(s: NotifSettings, d = new Date()) {
  if (!s.quietEnabled) return false;
  const schedules = s.quietSchedules?.length
    ? s.quietSchedules
    : [{ id: "legacy", start: s.quietStart, end: s.quietEnd, days: ALL_DAYS }];
  return schedules.some((sch) => scheduleCoversMoment(sch, d));
}

function formatNextTransition(s: NotifSettings, d: Date, quietActive: boolean): string | null {
  if (!s.quietEnabled) return null;
  // Scan forward minute-by-minute (capped at 8 days) to find the next flip.
  // Cheap enough for a settings modal and correctly handles multiple ranges,
  // day-of-week gaps, and wrap-past-midnight windows.
  const cursor = new Date(d);
  cursor.setSeconds(0, 0);
  const stepMin = 5;
  const maxMinutes = 8 * 24 * 60;
  for (let i = stepMin; i <= maxMinutes; i += stepMin) {
    const t = new Date(cursor.getTime() + i * 60_000);
    if (isQuietNow(s, t) !== quietActive) {
      return t.toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return null;
}




type Booking = Tables<"bookings">;
type Profile = Tables<"profiles">;

type BookingWithProfile = Booking & { profiles?: Profile | null };

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({
  profile,
  name,
  size = 32,
}: {
  profile?: Profile | null;
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
        initials(name || "?")
      )}
    </span>
  );
}

function NotificationsBell({
  bookings, lastSeen, unreadCount, userId, onMarkAllRead, onMarkAllUnread, onMarkRead, onMarkUnread, onOpen, onUpdateStatus,
}: {
  bookings: BookingWithProfile[];
  lastSeen: number;
  unreadCount: number;
  userId: string | null;
  onMarkAllRead: (ids: string[]) => void;
  onMarkAllUnread: (ids: string[]) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onOpen: (id: string) => void;
  onUpdateStatus: (id: string, status: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLLIElement | null>(null);
  const [notifStatus, setNotifStatus] = useState<"all" | Status>(() => loadNotifFilters(userId).status);
  const [notifUnreadOnly, setNotifUnreadOnly] = useState(() => loadNotifFilters(userId).unreadOnly);
  const [notifTodayOnly, setNotifTodayOnly] = useState(() => loadNotifFilters(userId).todayOnly);
  const [notifService, setNotifService] = useState<"all" | string>(() => loadNotifFilters(userId).service);
  const [notifSort, setNotifSort] = useState<"newest" | "oldest">(() => loadNotifFilters(userId).sort);
  const [notifSearch, setNotifSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notifLimit, setNotifLimit] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMoreNotifications = useCallback(() => {
    if (loadingMore) return;
    setLoadMoreError(null);
    setLoadingMore(true);
    if (loadMoreTimer.current) clearTimeout(loadMoreTimer.current);
    loadMoreTimer.current = setTimeout(() => {
      try {
        setNotifLimit((n) => n + 8);
        setLoadingMore(false);
      } catch (err) {
        setLoadingMore(false);
        setLoadMoreError(err instanceof Error ? err.message : "Failed to load older notifications");
      }
    }, 350);
  }, [loadingMore]);

  useEffect(() => {
    return () => {
      if (loadMoreTimer.current) clearTimeout(loadMoreTimer.current);
    };
  }, []);

  // Persist the filter choices per user so they survive reloads and re-openings.
  useEffect(() => {
    saveNotifFilters(userId, { unreadOnly: notifUnreadOnly, todayOnly: notifTodayOnly, service: notifService, sort: notifSort, status: notifStatus });
  }, [userId, notifUnreadOnly, notifTodayOnly, notifService, notifSort, notifStatus]);

  // Sync filters if userId becomes known after initial render (e.g. on first mount).
  useEffect(() => {
    if (!userId) return;
    const stored = loadNotifFilters(userId);
    setNotifUnreadOnly(stored.unreadOnly);
    setNotifTodayOnly(stored.todayOnly);
    setNotifService(stored.service);
    setNotifSort(stored.sort);
    setNotifStatus(stored.status);
  }, [userId]);

  const [readIds, setReadIds] = useState<Set<string>>(() => getReadBookingIds());
  useEffect(() => {
    return subscribeHistory(() => setReadIds(getReadBookingIds()));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keyboard shortcut: press "U" to toggle Unread only while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isTyping) return;
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        setNotifUnreadOnly((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Clear selection and reset pagination when dropdown closes or filters change
  useEffect(() => {
    if (!open) setSelectedIds(new Set());
    setNotifLimit(8);
  }, [open, notifStatus, notifUnreadOnly, notifTodayOnly, notifService, notifSort, notifSearch]);

  const filteredNotifications = useMemo(() => {
    // Deduplicate by booking id first so realtime inserts / refetches can't
    // reintroduce the same notification as older pages are loaded.
    const seen = new Set<string>();
    let list: BookingWithProfile[] = [];
    for (const b of bookings) {
      if (!b?.id || seen.has(b.id)) continue;
      seen.add(b.id);
      list.push(b);
    }
    if (notifStatus !== "all") {
      list = list.filter((b) => b.status === notifStatus);
    }
    if (notifUnreadOnly) {
      list = list.filter((b) => new Date(b.created_at).getTime() > lastSeen && !readIds.has(b.id));
    }
    if (notifTodayOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      list = list.filter((b) => new Date(b.created_at) >= today);
    }
    if (notifService !== "all") {
      list = list.filter((b) => b.service === notifService);
    }
    if (notifSearch.trim()) {
      const q = notifSearch.trim().toLowerCase();
      list = list.filter((b) =>
        [b.name, b.email, b.brand, b.phone, b.niche, b.service, b.message]
          .filter((v): v is string => Boolean(v))
          .some((v) => v.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const diff = +new Date(b.created_at) - +new Date(a.created_at);
      return notifSort === "newest" ? diff : -diff;
    });
    return list;
  }, [bookings, lastSeen, readIds, notifStatus, notifUnreadOnly, notifTodayOnly, notifService, notifSort, notifSearch]);

  const recent = useMemo(() => {
    // Extra safety: dedupe again after slicing so any upstream duplication
    // (e.g. two rapid realtime events) never renders the same row twice.
    const out: BookingWithProfile[] = [];
    const seenIds = new Set<string>();
    for (const b of filteredNotifications) {
      if (seenIds.has(b.id)) continue;
      seenIds.add(b.id);
      out.push(b);
      if (out.length >= notifLimit) break;
    }
    return out;
  }, [filteredNotifications, notifLimit]);

  const hasMoreNotifications = recent.length < filteredNotifications.length;

  const availableNotifServices = useMemo(
    () =>
      Array.from(new Set(bookings.map((b) => b.service).filter((s): s is string => Boolean(s)))),
    [bookings]
  );

  // Infinite scroll: load more notifications when the sentinel enters view
  useEffect(() => {
    if (!open || !sentinelRef.current || !hasMoreNotifications || loadingMore || loadMoreError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreNotifications();
        }
      },
      { root: scrollRef.current, threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [open, hasMoreNotifications, notifLimit, loadingMore, loadMoreError, loadMoreNotifications]);

  const activeNotifFilters =
    notifStatus !== "all" ||
    notifUnreadOnly ||
    notifTodayOnly ||
    notifService !== "all" ||
    notifSort !== "newest" ||
    notifSearch.trim() !== "";

  const firstUnreadBooking = useMemo(
    () =>
      recent.find(
        (b) =>
          b?.id &&
          new Date(b.created_at).getTime() > lastSeen &&
          !readIds.has(b.id),
      ),
    [recent, lastSeen, readIds],
  );

  const jumpToFirstUnread = useCallback(() => {
    if (firstUnreadRef.current) {
      firstUnreadRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (unreadCount > 0) {
      toast.info("Unread notifications are hidden by current filters. Try resetting filters or enabling Unread only.");
    }
  }, [unreadCount]);

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
        <div ref={scrollRef} className="absolute right-0 mt-2 w-[340px] max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl z-30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] opacity-60">Notifications</p>
              <p className="text-sm">
                {unreadCount > 0 ? `${unreadCount} new booking${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={jumpToFirstUnread}
                  className="text-[10px] uppercase tracking-[0.2em] text-red-400 hover:text-red-300 transition-opacity font-semibold"
                  aria-label="Jump to first unread notification"
                >
                  Jump to unread
                </button>
              )}
              <button
                onClick={() => onMarkAllRead(filteredNotifications.map((b) => b.id))}
                className={`text-[10px] uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity ${
                  unreadCount > 0 ? "" : "opacity-40 hover:opacity-60"
                }`}
                aria-label="Mark all filtered notifications as read"
              >
                Mark filtered as read
              </button>
            </div>
          </div>
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50" aria-hidden>🔎</span>
                <input
                  type="text"
                  value={notifSearch}
                  onChange={(e) => setNotifSearch(e.target.value)}
                  placeholder="Search by name, email, brand, message..."
                  className="w-full text-xs rounded-full bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                  aria-label="Search notifications"
                />
                {notifSearch && (
                  <button
                    onClick={() => setNotifSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-60 hover:opacity-100"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <label
                className={`flex items-center gap-1.5 text-xs cursor-pointer select-none rounded-full px-2.5 py-1 border transition-colors ${
                  notifUnreadOnly
                    ? "bg-red-500/20 border-red-500/50 text-white"
                    : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                }`}
                title="Show only unread notifications (press U)"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-red-500"
                  checked={notifUnreadOnly}
                  onChange={(e) => setNotifUnreadOnly(e.target.checked)}
                  aria-label="Unread only notifications"
                />
                Unread only
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-red-500"
                  checked={notifTodayOnly}
                  onChange={(e) => setNotifTodayOnly(e.target.checked)}
                />
                Today
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
                value={notifService}
                onChange={(e) => setNotifService(e.target.value)}
                className="text-xs rounded-full bg-white/5 border border-white/10 px-2 py-1"
                aria-label="Filter by service"
              >
                <option value="all">All services</option>
                {availableNotifServices.map((svc) => (
                  <option key={svc} value={svc}>{svc}</option>
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
                    setNotifTodayOnly(false);
                    setNotifService("all");
                    setNotifSort("newest");
                    setNotifSearch("");
                    saveNotifFilters(userId, DEFAULT_NOTIF_FILTERS);
                  }}
                  className="text-[10px] uppercase tracking-[0.15em] opacity-70 hover:opacity-100 ml-auto"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          {recent.length > 0 && (
            <div className="px-4 py-2 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-red-500"
                  checked={recent.every((b) => selectedIds.has(b.id))}
                  ref={(el) => {
                    if (el) {
                      const some = recent.some((b) => selectedIds.has(b.id));
                      el.indeterminate = some && !recent.every((b) => selectedIds.has(b.id));
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        for (const b of recent) next.add(b.id);
                        return next;
                      });
                    } else {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        for (const b of recent) next.delete(b.id);
                        return next;
                      });
                    }
                  }}
                  aria-label="Select all visible notifications"
                />
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
              </label>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[10px] uppercase tracking-[0.15em] opacity-70 hover:opacity-100"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => {
                      onMarkAllUnread(Array.from(selectedIds));
                      setSelectedIds(new Set());
                    }}
                    className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/70 hover:text-white"
                  >
                    Mark selected unread
                  </button>
                  <button
                    onClick={() => {
                      onMarkAllRead(Array.from(selectedIds));
                      setSelectedIds(new Set());
                    }}
                    className="text-[10px] uppercase tracking-[0.15em] font-semibold text-red-400 hover:text-red-300"
                  >
                    Mark selected as read
                  </button>
                </div>
              )}
            </div>
          )}
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm opacity-60">
              {bookings.length > 0 ? "No matching notifications" : "No bookings yet"}
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.map((b) => {
                const unread = new Date(b.created_at).getTime() > lastSeen && !readIds.has(b.id);
                const checked = selectedIds.has(b.id);
                return (
                  <li
                    key={b.id}
                    ref={b.id === firstUnreadBooking?.id ? firstUnreadRef : undefined}
                    className="group flex items-center gap-1 px-4 py-3 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-red-500 shrink-0"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(b.id);
                          else next.delete(b.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${b.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => { setOpen(false); onOpen(b.id); }}
                        className="w-full text-left flex gap-3 items-start min-w-0"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                            unread ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" : "bg-white/20"
                          }`}
                          aria-hidden
                        />
                        <Avatar profile={b.profiles} name={b.name} size={34} />
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
                      <div className="flex items-center gap-1.5 mt-2 pl-5 flex-wrap">
                        {b.status === "new" && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); onUpdateStatus(b.id, "confirmed"); }}
                              className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onUpdateStatus(b.id, "canceled"); }}
                              className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                            >
                              ✕ Reject
                            </button>
                          </>
                        )}
                        {b.status === "confirmed" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onUpdateStatus(b.id, "canceled"); }}
                            className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                          >
                            ✕ Cancel
                          </button>
                        )}
                        {b.status === "canceled" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onUpdateStatus(b.id, "new"); }}
                            className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-white/10 text-white border border-white/20 hover:bg-white/20"
                          >
                            ↺ Reopen
                          </button>
                        )}
                        {unread ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onMarkRead(b.id); }}
                            className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                            title="Mark as read"
                          >
                            Mark read
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); onMarkUnread(b.id); }}
                            className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                            title="Mark as unread for later review"
                          >
                            Mark unread
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpen(false); onOpen(b.id); }}
                          className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 ml-auto"
                        >
                          Open →
                        </button>
                      </div>
                    </div>

                  </li>
                );
              })}
              {hasMoreNotifications && (
                <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02] space-y-2">
                  {loadingMore && (
                    <ul className="space-y-2" aria-live="polite" aria-busy="true">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 animate-pulse"
                        >
                          <div className="h-8 w-8 rounded-full bg-white/10" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-2/3 rounded bg-white/10" />
                            <div className="h-2.5 w-1/2 rounded bg-white/[0.07]" />
                          </div>
                        </li>
                      ))}
                      <li className="sr-only">Loading older notifications…</li>
                    </ul>
                  )}
                  {loadMoreError && !loadingMore && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 flex items-center justify-between gap-3"
                    >
                      <span className="truncate">Couldn’t load older notifications. {loadMoreError}</span>
                      <button
                        onClick={loadMoreNotifications}
                        className="shrink-0 text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {!loadingMore && !loadMoreError && (
                    <button
                      onClick={loadMoreNotifications}
                      disabled={loadingMore}
                      className="w-full text-center text-xs uppercase tracking-[0.15em] py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label="Load older notifications"
                    >
                      Load more ({filteredNotifications.length - recent.length} remaining)
                    </button>
                  )}
                  <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
                </div>
              )}
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
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotifSettings>(() => loadSettings(null));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    let active = true;
    const hydrateGlobals = async (base: NotifSettings) => {
      try {
        const [cfg, rl] = await Promise.all([fetchCaptchaConfig(), fetchRateLimitConfig()]);
        if (!active) return;
        setSettings({
          ...base,
          captchaEnabled: cfg.enabled,
          hcaptchaSiteKey: cfg.siteKey,
          rateLimits: rl,
        });
      } catch { /* keep local */ }
    };
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      const base = loadSettings(uid);
      setSettings(base);
      hydrateGlobals(base);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      const base = loadSettings(uid);
      setSettings(base);
      hydrateGlobals(base);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const saveSettings = (next: NotifSettings) => {
    setSettings(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(settingsKeyFor(userId), JSON.stringify(next));
    }
    // Captcha + rate-limit config are global — persist to backend so they
    // stay consistent across devices and admin sessions.
    void saveCaptchaConfig({ enabled: next.captchaEnabled, siteKey: next.hcaptchaSiteKey })
      .then((res) => {
        if (!res.ok) {
          toast.error("Couldn't save captcha settings", { description: res.error });
        }
      });
    void saveRateLimitConfig(next.rateLimits).then((res) => {
      if (!res.ok) toast.error("Couldn't save rate limits", { description: res.error });
    });
  };



  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of profiles ?? []) map.set(p.user_id, p);
    return map;
  }, [profiles]);

  const bookingsWithProfiles = useMemo<BookingWithProfile[]>(
    () => (bookings ?? []).map((b) => ({ ...b, profiles: b.user_id ? profileMap.get(b.user_id) ?? null : null })),
    [bookings, profileMap],
  );

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

  type PendingEvent =
    | { kind: "new"; booking: Booking }
    | { kind: "status"; booking: Booking; from: string; to: string }
    | { kind: "note"; booking: Booking };
  const pendingRef = useRef<PendingEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBookings = useRef<Map<string, Booking>>(new Map());
  useEffect(() => {
    for (const b of bookings ?? []) prevBookings.current.set(b.id, b);
  }, [bookings]);

  const flushQueue = () => {
    flushTimerRef.current = null;
    const events = pendingRef.current;
    pendingRef.current = [];
    if (events.length === 0) return;
    const s = settingsRef.current;
    const quiet = isQuietNow(s);
    // Per-channel gating: quiet hours mute the noisy channels (toast + OS push)
    // but leave email intact so the admin's inbox still gets the record.
    const inAppOn = s.channelInApp && !quiet;
    const pushOn = s.channelPush && !quiet;
    const emailOn = s.channelEmail;
    const anyChannelOn = inAppOn || pushOn || emailOn;
    if (!anyChannelOn) {
      const reason: "disabled" | "quiet" = !s.channelInApp && !s.channelEmail && !s.channelPush
        ? "disabled"
        : "quiet";
      for (const ev of events) {
        const b = ev.booking;
        logNotification({
          kind: ev.kind,
          category: "bookings",
          title:
            ev.kind === "new" ? `New booking · ${b.name}`
            : ev.kind === "status" ? `${b.name} · ${ev.from} → ${ev.to}`
            : `Note updated · ${b.name}`,
          subtitle: b.brand ?? b.service ?? undefined,
          bookingId: b.id,
          status: "suppressed",
          reason,
        });
      }
      return;
    }

    const channelSubtitle = (base?: string) => {
      const tags: string[] = [];
      if (inAppOn) tags.push("in-app");
      if (emailOn) tags.push("email");
      if (pushOn) tags.push("push");
      const suffix = tags.length ? ` · ${tags.join(" + ")}` : "";
      return base ? `${base}${suffix}` : suffix.slice(3);
    };

    if (events.length === 1) {
      const ev = events[0];
      const b = ev.booking;
      const profile = b.user_id ? profileMap.get(b.user_id) ?? null : null;
      const title =
        ev.kind === "new" ? `New booking · ${b.name}`
        : ev.kind === "status" ? `${b.name} · ${ev.from} → ${ev.to}`
        : `Note updated · ${b.name}`;
      logNotification({
        kind: ev.kind,
        category: "bookings",
        title,
        subtitle: channelSubtitle(b.brand ?? b.service ?? undefined),
        bookingId: b.id,
        status: "delivered",
      });
      if (pushOn) {
        firePushNotification(
          title,
          [b.brand, b.service, b.budget].filter(Boolean).join(" · ") || undefined,
          `booking-${b.id}`,
        );
      }
      if (!inAppOn) return;
      toast.custom(
        (t) => (
          <div className="w-full rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl overflow-hidden">
            <button
              onClick={() => {
                toast.dismiss(t);
                markAllSeenRef.current?.();
                navigate({ to: "/bookings/$id", params: { id: b.id } });
              }}
              className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar profile={profile} name={b.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{title}</p>
                    <span className="text-[10px] uppercase tracking-wider text-red-400 shrink-0">View →</span>
                  </div>
                  <p className="text-xs text-white/70 mt-0.5 truncate">
                    {b.brand ? `${b.brand} · ` : ""}
                    {b.service ?? "Submission"}
                    {b.budget ? ` · ${b.budget}` : ""}
                  </p>
                </div>
              </div>
            </button>
            <div className="border-t border-white/10 px-4 py-2 bg-white/[0.03] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {ev.kind === "new" && (
                  <>
                    <button
                      onClick={() => {
                        updateStatus.mutate({ id: b.id, status: "confirmed" });
                        toast.dismiss(t);
                        markAllSeenRef.current?.();
                      }}
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => {
                        updateStatus.mutate({ id: b.id, status: "canceled" });
                        toast.dismiss(t);
                        markAllSeenRef.current?.();
                      }}
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold px-2 py-1 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => { toast.dismiss(t); markAllSeenRef.current?.(); }}
                className="text-[10px] uppercase tracking-[0.2em] opacity-70 hover:opacity-100"
              >
                Mark all as read
              </button>
            </div>
          </div>
        ),
        { duration: 10000 },
      );
    } else {
      const counts = { new: 0, status: 0, note: 0 };
      for (const e of events) counts[e.kind]++;
      const parts = [
        counts.new && `${counts.new} new`,
        counts.status && `${counts.status} status change${counts.status > 1 ? "s" : ""}`,
        counts.note && `${counts.note} note${counts.note > 1 ? "s" : ""}`,
      ].filter(Boolean).join(" · ");
      logNotification({
        kind: "summary",
        category: "bookings",
        title: `${events.length} booking updates`,
        subtitle: channelSubtitle(parts),
        status: "delivered",
      });
      if (pushOn) {
        firePushNotification(`${events.length} booking updates`, parts, "booking-summary");
      }
      if (!inAppOn) return;
      toast.custom(
        (t) => (
          <div className="w-full rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl overflow-hidden">
            <button
              onClick={() => { toast.dismiss(t); markAllSeenRef.current?.(); }}
              className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-medium text-white">{events.length} booking updates</p>
              <p className="text-xs text-white/70 mt-0.5 truncate">{parts}</p>
            </button>
          </div>
        ),
        { duration: 10000 },
      );
    }
  };


  const enqueueEvent = (ev: PendingEvent) => {
    pendingRef.current.push(ev);
    const ms = FREQUENCY_MS[settingsRef.current.frequency];
    if (ms === 0) { flushQueue(); return; }
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flushQueue, ms);
  };

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
          prevBookings.current.set(b.id, b);
          qc.invalidateQueries({ queryKey: ["bookings"] });
          if (!settingsRef.current.categoryBookings) {
            logNotification({
              kind: "new", category: "bookings",
              title: `New booking · ${b.name}`,
              subtitle: b.brand ?? b.service ?? undefined,
              bookingId: b.id, status: "suppressed", reason: "category",
            });
            return;
          }
          if (!settingsRef.current.notifyNewBooking) {
            logNotification({
              kind: "new", category: "bookings",
              title: `New booking · ${b.name}`,
              subtitle: b.brand ?? b.service ?? undefined,
              bookingId: b.id, status: "suppressed", reason: "type",
            });
            return;
          }
          enqueueEvent({ kind: "new", booking: b });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload) => {
          const next = payload.new as Booking;
          const prev = prevBookings.current.get(next.id);
          prevBookings.current.set(next.id, next);
          qc.invalidateQueries({ queryKey: ["bookings"] });
          if (!prev) return;
          const statusChanged = prev.status !== next.status;
          const noteChanged = (prev.notes ?? "") !== (next.notes ?? "");
          if (!settingsRef.current.categoryBookings) {
            if (statusChanged) logNotification({
              kind: "status", category: "bookings",
              title: `${next.name} · ${prev.status} → ${next.status}`,
              bookingId: next.id, status: "suppressed", reason: "category",
            });
            if (noteChanged) logNotification({
              kind: "note", category: "bookings",
              title: `Note updated · ${next.name}`,
              bookingId: next.id, status: "suppressed", reason: "category",
            });
            return;
          }
          if (statusChanged) {
            if (settingsRef.current.notifyStatusChange) {
              enqueueEvent({ kind: "status", booking: next, from: prev.status, to: next.status });
            } else {
              logNotification({
                kind: "status", category: "bookings",
                title: `${next.name} · ${prev.status} → ${next.status}`,
                bookingId: next.id, status: "suppressed", reason: "type",
              });
            }
          }
          if (noteChanged) {
            if (settingsRef.current.notifyNoteUpdate) {
              enqueueEvent({ kind: "note", booking: next });
            } else {
              logNotification({
                kind: "note", category: "bookings",
                title: `Note updated · ${next.name}`,
                bookingId: next.id, status: "suppressed", reason: "type",
              });
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, navigate, profileMap]);

  const [readBookingIds, setReadBookingIds] = useState<Set<string>>(() => getReadBookingIds());
  useEffect(() => subscribeHistory(() => setReadBookingIds(getReadBookingIds())), []);

  const unreadCount = useMemo(
    () =>
      (bookings ?? []).filter(
        (b) => new Date(b.created_at).getTime() > lastSeen && !readBookingIds.has(b.id),
      ).length,
    [bookings, lastSeen, readBookingIds],
  );

  const markAllSeen = (ts?: number) => {
    const now = ts ?? Date.now();
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
              bookings={bookingsWithProfiles}
              lastSeen={lastSeen}
              unreadCount={unreadCount}
              userId={userId}
              onMarkAllRead={(ids) => {
                markAllBookingsRead(ids);
                // Only advance the "seen" watermark if every currently unread
                // booking is included; otherwise a partial "Mark filtered as
                // read" would silently clear the badge for items outside the
                // filter and desync the count.
                const idSet = new Set(ids);
                const stillUnread = (bookings ?? []).some(
                  (b) =>
                    !idSet.has(b.id) &&
                    !readBookingIds.has(b.id) &&
                    new Date(b.created_at).getTime() > lastSeen,
                );
                if (!stillUnread) markAllSeen();
              }}
              onMarkAllUnread={(ids) => {
                markAllBookingsUnread(ids);
                // If any of the re-flagged items are older than the current
                // watermark, back-date it so the badge count reflects them
                // again after paginating to older alerts.
                const idSet = new Set(ids);
                let oldest = Infinity;
                for (const b of bookings ?? []) {
                  if (!idSet.has(b.id)) continue;
                  const t = new Date(b.created_at).getTime();
                  if (t < oldest) oldest = t;
                }
                if (Number.isFinite(oldest) && oldest <= lastSeen) {
                  markAllSeen(oldest - 1);
                }
              }}
              onMarkRead={(id) => markReadByBookingId(id)}
              onMarkUnread={(id) => {
                markUnreadByBookingId(id);
                const b = (bookings ?? []).find((x) => x.id === id);
                if (b) {
                  const t = new Date(b.created_at).getTime();
                  if (t <= lastSeen) markAllSeen(t - 1);
                }
              }}
              onOpen={(id) => {
                markReadByBookingId(id);
                navigate({ to: "/bookings/$id", params: { id } });
              }}
              onUpdateStatus={(id, status) => updateStatus.mutate({ id, status })}
            />
            <Link
              to="/notifications"
              className="rounded-full glass px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
              title="Notification history"
            >
              History
            </Link>
            <Link
              to="/blocked"
              className="rounded-full glass px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
              title="Blocked booking submissions"
            >
              Blocked
            </Link>
            <Link
              to="/security"
              className="rounded-full glass px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
              title="Captcha verification failures"
            >
              Security
            </Link>
            <Link
              to="/spam"
              className="rounded-full glass px-3 py-2 text-[10px] uppercase tracking-[0.2em] hover:bg-white/10"
              title="Honeypot and rate-limit rejections"
            >
              Spam
            </Link>


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
          <div className="mb-6">
            <SpamTrendChart />
          </div>
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
  const [now, setNow] = useState(() => new Date());
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">(() => pushPermission());
  useEffect(() => {
    if (!open) return;
    setPushPerm(pushPermission());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, [open]);
  if (!open) return null;
  const quietActive = isQuietNow(draft, now);
  const anyChannel = draft.channelInApp || draft.channelEmail || draft.channelPush;
  const activeChannels: string[] = [];
  if (draft.channelInApp && !quietActive) activeChannels.push("in-app");
  if (draft.channelEmail) activeChannels.push("email");
  if (draft.channelPush && !quietActive && pushPerm === "granted") activeChannels.push("push");
  const willDeliver = anyChannel && activeChannels.length > 0;
  const nextTransition = draft.quietEnabled
    ? formatNextTransition(draft, now, quietActive)
    : null;
  const statusReason = !anyChannel
    ? "All delivery channels are turned off."
    : quietActive && activeChannels.length === 0
      ? `Quiet hours active${nextTransition ? ` — resumes at ${nextTransition}` : ""}.`
      : quietActive
        ? `Quiet hours active — only ${activeChannels.join(" + ")} will deliver.`
        : activeChannels.length === 0
          ? draft.channelPush && pushPerm !== "granted"
            ? "Push is enabled but browser permission hasn't been granted."
            : "No channels are active right now."
          : `Delivering via ${activeChannels.join(" + ")}${
              draft.quietEnabled && nextTransition ? ` — quiet hours begin at ${nextTransition}` : ""
            }.`;
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

        <div
          className={`rounded-xl border px-4 py-3 mb-4 flex items-start gap-3 transition-colors ${
            willDeliver
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
          aria-live="polite"
        >
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
              willDeliver
                ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse"
                : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {willDeliver ? "Notifications will be sent right now" : "Notifications are paused right now"}
              </p>
              <span className="text-[10px] uppercase tracking-[0.2em] opacity-60 shrink-0">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-xs opacity-75 mt-0.5">{statusReason}</p>
          </div>
        </div>

        <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mt-2 mb-1">Delivery channels</p>
        <p className="text-xs opacity-60 mb-2">Pick which channels receive booking alerts. Turn one off to mute it without losing the entry in the notifications bell.</p>

        <label className="flex items-start justify-between gap-4 py-3 border-b border-white/10 cursor-pointer">
          <div className="min-w-0">
            <p className="text-sm">In-app <span className="opacity-50">· toast + bell</span></p>
            <p className="text-xs opacity-60 mt-1">Realtime toast in the dashboard and unread badge on the bell.</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-red-500 mt-1"
            checked={draft.channelInApp}
            onChange={(e) =>
              setDraft({ ...draft, channelInApp: e.target.checked, realtimeEnabled: e.target.checked })
            }
          />
        </label>

        <label className="flex items-start justify-between gap-4 py-3 border-b border-white/10 cursor-pointer">
          <div className="min-w-0">
            <p className="text-sm">Email <span className="opacity-50">· admin inbox</span></p>
            <p className="text-xs opacity-60 mt-1">Send a summary email for qualifying booking events. Requires a verified sender domain in Cloud → Emails.</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-red-500 mt-1"
            checked={draft.channelEmail}
            onChange={(e) => setDraft({ ...draft, channelEmail: e.target.checked })}
          />
        </label>

        <div className="flex items-start justify-between gap-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <p className="text-sm">Push <span className="opacity-50">· browser notifications</span></p>
            <p className="text-xs opacity-60 mt-1">
              {pushPerm === "unsupported"
                ? "This browser doesn't support notifications."
                : pushPerm === "denied"
                  ? "Notifications are blocked in browser settings — allow them for this site to use push."
                  : pushPerm === "granted"
                    ? "System notifications will fire even when this tab is in the background."
                    : "We'll ask for permission when you enable this."}
            </p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-red-500 mt-1 disabled:opacity-40"
            disabled={pushPerm === "unsupported"}
            checked={draft.channelPush && pushPerm !== "denied"}
            onChange={async (e) => {
              const want = e.target.checked;
              if (!want) {
                setDraft({ ...draft, channelPush: false });
                return;
              }
              const perm = await ensurePushPermission();
              setPushPerm(perm);
              if (perm === "granted") {
                setDraft({ ...draft, channelPush: true });
                toast.success("Push notifications enabled");
              } else {
                setDraft({ ...draft, channelPush: false });
                toast.error(
                  perm === "unsupported"
                    ? "Push notifications aren't supported in this browser."
                    : "Push permission was blocked — update browser settings to allow them.",
                );
              }
            }}
          />
        </div>

        <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mt-6 mb-1">Notifications</p>



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

        <div className={`mt-4 space-y-3 ${draft.quietEnabled ? "" : "opacity-50 pointer-events-none"}`}>
          {(draft.quietSchedules ?? []).map((sch, idx) => {
            const invalid = sch.start === sch.end || sch.days.length === 0;
            const updateSchedule = (patch: Partial<QuietSchedule>) => {
              const next = [...(draft.quietSchedules ?? [])];
              next[idx] = { ...sch, ...patch };
              setDraft({ ...draft, quietSchedules: next });
            };
            const toggleDay = (d: number) => {
              const has = sch.days.includes(d);
              updateSchedule({
                days: has ? sch.days.filter((x) => x !== d) : [...sch.days, d].sort(),
              });
            };
            return (
              <div
                key={sch.id}
                className={`rounded-xl border ${invalid ? "border-amber-500/40 bg-amber-500/5" : "border-white/10 bg-white/[0.03]"} p-3`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] opacity-60">
                    Schedule {idx + 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSchedule({ days: [...ALL_DAYS] })}
                      className="text-[10px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
                    >
                      Every day
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSchedule({ days: [1, 2, 3, 4, 5] })}
                      className="text-[10px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSchedule({ days: [0, 6] })}
                      className="text-[10px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
                    >
                      Weekend
                    </button>
                    {(draft.quietSchedules ?? []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = (draft.quietSchedules ?? []).filter((_, i) => i !== idx);
                          setDraft({ ...draft, quietSchedules: next });
                        }}
                        className="text-[10px] uppercase tracking-[0.15em] text-red-400 hover:text-red-300"
                        aria-label={`Remove schedule ${idx + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Days of week">
                  {DAY_LABELS.map((label, dayIdx) => {
                    const active = sch.days.includes(dayIdx);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(dayIdx)}
                        aria-pressed={active}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                          active
                            ? "bg-red-500/25 border-red-500/60 text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">From</label>
                    <input
                      type="time"
                      value={sch.start}
                      onChange={(e) => updateSchedule({ start: e.target.value })}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">To</label>
                    <input
                      type="time"
                      value={sch.end}
                      onChange={(e) => updateSchedule({ end: e.target.value })}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {invalid && (
                  <p className="text-[11px] text-amber-300/90 mt-2">
                    {sch.days.length === 0
                      ? "Pick at least one day for this schedule to apply."
                      : "Start and end must differ."}
                  </p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                quietSchedules: [
                  ...(draft.quietSchedules ?? []),
                  { id: makeScheduleId(), start: "22:00", end: "08:00", days: [...ALL_DAYS] },
                ],
              })
            }
            className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs uppercase tracking-[0.2em] opacity-70 hover:opacity-100 hover:bg-white/5"
          >
            + Add schedule
          </button>
        </div>
        {draft.quietEnabled && (
          <p className="text-xs opacity-60 mt-2">
            {quietActive ? "Quiet hours are active right now." : "Quiet hours are inactive right now."}
            {" "}Spans past midnight are supported per schedule.
          </p>
        )}


        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-1">Notification categories</p>
          <p className="text-xs opacity-60 mb-2">Master switches for each channel of admin alerts.</p>
          {([
            ["categoryBookings", "Bookings", "New submissions, status changes, notes"],
            ["categoryOutreach", "Outreach", "Cold outreach replies & follow-ups"],
            ["categoryInvoices", "Invoices", "Payments, overdue reminders, receipts"],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex items-center justify-between gap-4 py-2 cursor-pointer">
              <span>
                <span className="block text-sm">{label}</span>
                <span className="block text-[11px] opacity-50">{hint}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-red-500"
                checked={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>

        <div className={`mt-6 pt-4 border-t border-white/10 transition ${draft.categoryBookings ? "" : "opacity-40 pointer-events-none"}`}>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-1">Booking alert types</p>
          <p className="text-xs opacity-60 mb-2">Fine-tune which booking events trigger alerts.</p>
          {([
            ["notifyNewBooking", "New booking submissions"],
            ["notifyStatusChange", "Booking status changes"],
            ["notifyNoteUpdate", "Internal notes updated"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 py-2 cursor-pointer">
              <span className="text-sm">{label}</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-red-500"
                checked={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
              />
            </label>
          ))}

          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-[0.25em] opacity-60">Alert frequency</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                ["instant", "Instant"],
                ["1m", "Every 1 min"],
                ["5m", "Every 5 min"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDraft({ ...draft, frequency: val })}
                  className={`rounded-lg border px-3 py-2 text-xs uppercase tracking-[0.15em] transition ${
                    draft.frequency === val
                      ? "bg-red-500 border-red-500 text-white"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs opacity-60 mt-2">
              Batched frequencies group multiple events into a single summary toast.
            </p>
          </div>
        </div>

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

        <RateLimitsSection draft={draft} setDraft={setDraft} />


        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-2">Delivery test</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs opacity-70 flex-1">
              Fires a sample toast using your current draft settings — no booking is created.
            </p>
            <button
              type="button"
              onClick={() => {
                const quietNow = isQuietNow(draft);
                const inAppOn = draft.channelInApp && !quietNow;
                const pushOn = draft.channelPush && !quietNow && pushPerm === "granted";
                const emailOn = draft.channelEmail;
                if (!draft.channelInApp && !draft.channelEmail && !draft.channelPush) {
                  logNotification({
                    kind: "test", category: "system",
                    title: "Test notification · Reelio Admin",
                    subtitle: "All channels disabled",
                    status: "suppressed", reason: "disabled",
                  });
                  toast.error("All delivery channels are off — nothing to deliver.");
                  return;
                }
                if (!inAppOn && !pushOn && !emailOn) {
                  logNotification({
                    kind: "test", category: "system",
                    title: "Test notification · Reelio Admin",
                    subtitle: "Quiet hours active",
                    status: "suppressed", reason: "quiet",
                  });
                  toast.error(
                    `Quiet hours are active${
                      nextTransition ? ` until ${nextTransition}` : ""
                    } — nothing to deliver.`,
                  );
                  return;
                }
                const tags: string[] = [];
                if (inAppOn) tags.push("in-app");
                if (emailOn) tags.push("email");
                if (pushOn) tags.push("push");
                logNotification({
                  kind: "test", category: "system",
                  title: "Test notification · Reelio Admin",
                  subtitle: `Delivered via ${tags.join(" + ")}`,
                  status: "delivered",
                });
                if (pushOn) {
                  firePushNotification(
                    "Test notification · Reelio Admin",
                    "Push delivery is working.",
                    "reelio-test",
                  );
                }
                if (!inAppOn) {
                  toast.success(`Test recorded — ${tags.join(" + ")}`);
                  return;
                }
                toast.custom(
                  (t) => (
                    <div className="w-full rounded-xl border border-red-500/40 bg-black/90 backdrop-blur-xl shadow-2xl overflow-hidden">
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-white">
                            Test notification · Reelio Admin
                          </p>
                          <span className="text-[10px] uppercase tracking-wider text-red-400 shrink-0">
                            Test
                          </span>
                        </div>
                        <p className="text-xs text-white/70 mt-0.5">
                          Realtime delivery is working. This is a preview of a new-booking toast.
                        </p>
                      </div>
                      <div className="border-t border-white/10 px-4 py-2 bg-white/[0.03] flex justify-end">
                        <button
                          onClick={() => toast.dismiss(t)}
                          className="text-[10px] uppercase tracking-[0.2em] opacity-70 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ),
                  { duration: 8000 },
                );
              }}
              className="rounded-full glass px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-white/10 shrink-0"
            >
              Send test
            </button>
          </div>
        </div>

        <NotificationLogPanel />



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

function RateLimitsSection({
  draft,
  setDraft,
}: {
  draft: NotifSettings;
  setDraft: (s: NotifSettings) => void;
}) {
  const rl = draft.rateLimits;
  const update = (path: "ip" | "email", bucket: "short" | "long", field: "max" | "windowMinutes", value: number) => {
    const n = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
    setDraft({
      ...draft,
      rateLimits: {
        ...rl,
        [path]: {
          ...rl[path],
          [bucket]: { ...rl[path][bucket], [field]: n },
        },
      },
    });
  };
  const resetDefaults = () => setDraft({ ...draft, rateLimits: DEFAULT_RATE_LIMIT_CONFIG });

  const BucketRow = ({
    label,
    scope,
    bucket,
  }: {
    label: string;
    scope: "ip" | "email";
    bucket: "short" | "long";
  }) => {
    const b = rl[scope][bucket];
    return (
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-1.5">
        <span className="text-xs opacity-80">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={b.max}
            onChange={(e) => update(scope, bucket, "max", Number(e.target.value))}
            className="w-16 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-right"
          />
          <span className="text-[10px] opacity-60">requests</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] opacity-60">per</span>
          <input
            type="number"
            min={1}
            value={b.windowMinutes}
            onChange={(e) => update(scope, bucket, "windowMinutes", Number(e.target.value))}
            className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-right"
          />
          <span className="text-[10px] opacity-60">min</span>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.3em] opacity-50">Booking rate limits</p>
        <button
          type="button"
          onClick={resetDefaults}
          className="text-[10px] uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
        >
          Reset defaults
        </button>
      </div>
      <p className="text-xs opacity-60 mb-3">
        Blocks repeated booking submissions from the same visitor or email. Two windows each — a
        short burst limit and a longer sustained limit.
      </p>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[11px] uppercase tracking-[0.2em] opacity-70 mb-1">Per IP address</p>
        <BucketRow label="Burst window" scope="ip" bucket="short" />
        <BucketRow label="Sustained window" scope="ip" bucket="long" />
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[11px] uppercase tracking-[0.2em] opacity-70 mb-1">Per email address</p>
        <BucketRow label="Short window" scope="email" bucket="short" />
        <BucketRow label="Long window" scope="email" bucket="long" />
      </div>

      <p className="text-[11px] opacity-50 mt-2">
        Excess requests receive HTTP 429 with a Retry-After header. Changes apply within ~30 seconds.
      </p>
    </div>
  );
}
