const KEY = "reelio.admin.notifHistory";
const CAP = 200;

export type NotifHistoryReason = "quiet" | "disabled" | "category" | "type";

export type NotifHistoryEntry = {
  id: string;
  ts: number;
  kind: "new" | "status" | "note" | "summary" | "test";
  category: "bookings" | "system";
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
  const full: NotifHistoryEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    read: entry.read ?? false,
    ...entry,
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

export function markReadByBookingId(bookingId: string) {
  const list = getHistory();
  if (!list.some((e) => e.bookingId === bookingId && !e.read)) return;
  write(list.map((e) => (e.bookingId === bookingId ? { ...e, read: true } : e)));
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
