const KEY = "reelio.admin.notifHistory";
const READ_BOOKINGS_KEY = "reelio.admin.notifReadBookings";
const READ_BOOKINGS_CAP = 500;
const CAP = 200;

function getReadBookings(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READ_BOOKINGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function getReadBookingIds(): Set<string> {
  return new Set(getReadBookings());
}

function addReadBooking(bookingId: string) {
  if (typeof window === "undefined") return;
  const current = getReadBookings().filter((id) => id !== bookingId);
  const next = [bookingId, ...current].slice(0, READ_BOOKINGS_CAP);
  window.localStorage.setItem(READ_BOOKINGS_KEY, JSON.stringify(next));
}

export function isBookingRead(bookingId: string): boolean {
  return getReadBookings().includes(bookingId);
}

export type NotifHistoryReason = "quiet" | "disabled" | "category" | "type";

export type NotifHistoryEntry = {
  id: string;
  ts: number;
  kind: "new" | "status" | "note" | "summary" | "test";
  category: "bookings" | "outreach" | "invoices" | "system";
  title: string;
  subtitle?: string;
  bookingId?: string;
  status: "delivered" | "suppressed";
  reason?: NotifHistoryReason;
  read: boolean;
};

function safeParse(raw: string | null): NotifHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getHistory(): NotifHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(KEY));
}

function write(entries: NotifHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, CAP)));
  window.dispatchEvent(new CustomEvent("reelio:notif-history-updated"));
}

export function logNotification(
  entry: Omit<NotifHistoryEntry, "id" | "ts" | "read"> & { read?: boolean },
) {
  const preRead =
    entry.read ?? (entry.bookingId ? isBookingRead(entry.bookingId) : false);
  const full: NotifHistoryEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    ...entry,
    read: preRead,
  };
  const next = [full, ...getHistory()];
  write(next);
  return full;
}

export function markRead(id: string) {
  write(getHistory().map((e) => (e.id === id ? { ...e, read: true } : e)));
}

export function markAllRead() {
  write(getHistory().map((e) => ({ ...e, read: true })));
}

export function markFilteredRead(ids: string[]) {
  const idSet = new Set(ids);
  write(getHistory().map((e) => (idSet.has(e.id) ? { ...e, read: true } : e)));
}

export function markReadByBookingId(bookingId: string) {
  addReadBooking(bookingId);
  const list = getHistory();
  if (!list.some((e) => e.bookingId === bookingId && !e.read)) {
    window.dispatchEvent(new CustomEvent("reelio:notif-history-updated"));
    return;
  }
  write(list.map((e) => (e.bookingId === bookingId ? { ...e, read: true } : e)));
}

export function markUnreadByBookingId(bookingId: string) {
  if (typeof window === "undefined") return;
  const current = getReadBookings().filter((id) => id !== bookingId);
  window.localStorage.setItem(READ_BOOKINGS_KEY, JSON.stringify(current));
  const list = getHistory();
  if (!list.some((e) => e.bookingId === bookingId && e.read)) {
    window.dispatchEvent(new CustomEvent("reelio:notif-history-updated"));
    return;
  }
  write(list.map((e) => (e.bookingId === bookingId ? { ...e, read: false } : e)));
}

export function markAllBookingsRead(bookingIds: string[]) {
  if (typeof window === "undefined" || bookingIds.length === 0) return;
  const current = getReadBookings();
  const next = Array.from(new Set([...bookingIds, ...current])).slice(0, READ_BOOKINGS_CAP);
  window.localStorage.setItem(READ_BOOKINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("reelio:notif-history-updated"));
}

export function markAllBookingsUnread(bookingIds: string[]) {
  if (typeof window === "undefined" || bookingIds.length === 0) return;
  const ids = new Set(bookingIds);
  const next = getReadBookings().filter((id) => !ids.has(id));
  window.localStorage.setItem(READ_BOOKINGS_KEY, JSON.stringify(next));
  const list = getHistory();
  if (!list.some((e) => e.bookingId && ids.has(e.bookingId) && e.read)) {
    window.dispatchEvent(new CustomEvent("reelio:notif-history-updated"));
    return;
  }
  write(list.map((e) => (e.bookingId && ids.has(e.bookingId) ? { ...e, read: false } : e)));
}

export function markUnread(id: string) {
  write(getHistory().map((e) => (e.id === id ? { ...e, read: false } : e)));
}

export function clearHistory() {
  write([]);
}

export function subscribeHistory(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("reelio:notif-history-updated", handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener("reelio:notif-history-updated", handler);
    window.removeEventListener("storage", storageHandler);
  };
}
