import type { HolidayKind, Priority, Status, ViewType } from "./types";

export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
export const STATUSES: Status[] = ["new", "in_progress", "paused", "done"];

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; rank: number }> = {
  low: { label: "נמוכה", color: "#64748b", bg: "#f1f5f9", rank: 3 },
  medium: { label: "בינונית", color: "#2563eb", bg: "#eff6ff", rank: 2 },
  high: { label: "גבוהה", color: "#d97706", bg: "#fffbeb", rank: 1 },
  urgent: { label: "דחוף", color: "#dc2626", bg: "#fef2f2", rank: 0 },
};

export const STATUS_META: Record<Status, { label: string; columnLabel: string; color: string; bg: string }> = {
  new: { label: "חדשה", columnLabel: "משימות חדשות", color: "#7c3aed", bg: "#f5f3ff" },
  in_progress: { label: "בעבודה", columnLabel: "בעבודה", color: "#0891b2", bg: "#ecfeff" },
  paused: { label: "בהשהייה", columnLabel: "בהשהייה", color: "#78716c", bg: "#f5f5f4" },
  done: { label: "הושלמה", columnLabel: "הושלמו", color: "#16a34a", bg: "#f0fdf4" },
};

export const VIEW_META: Record<ViewType, { label: string; description: string }> = {
  kanban: { label: "קנבן", description: "עמודות לפי סטטוס, גרירה בין עמודות" },
  todo: { label: "רשימת TODO", description: "רשימה עם וי, ממוינת לפי עדיפות" },
  calendar: { label: "לוח שנה", description: "חודש שלם לפי תאריך יעד" },
};

/** Label color per holiday kind. `dayOff` days get the vacation background in the calendar. */
export const HOLIDAY_META: Record<HolidayKind, { color: string; rank: number; dayOff: boolean }> = {
  chag: { color: "#c2410c", rank: 0, dayOff: true },
  cholhamoed: { color: "#c2410c", rank: 1, dayOff: true },
  erev: { color: "#b45309", rank: 2, dayOff: false },
  fast: { color: "#b91c1c", rank: 3, dayOff: false },
  hanukkah: { color: "#ea580c", rank: 4, dayOff: false },
  other: { color: "#4f46e5", rank: 5, dayOff: false },
  roshchodesh: { color: "#15803d", rank: 6, dayOff: false },
};

export const SPACE_COLORS = [
  "#4f46e5", "#0ea5e9", "#10b981", "#84cc16",
  "#f59e0b", "#f97316", "#ec4899", "#8b5cf6",
];

export const DEFAULT_PRIORITY: Priority = "medium";
export const DEFAULT_STATUS: Status = "new";
