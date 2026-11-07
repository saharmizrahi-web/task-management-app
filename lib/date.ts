const TZ = "Asia/Jerusalem";

/** Today's date (YYYY-MM-DD) in Israel time. */
export function todayStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

/** Start (Sunday) of the week containing the date. */
export function weekStart(s: string): string {
  const d = parseDate(s);
  return addDays(s, -d.getUTCDay());
}

export const WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const WEEKDAYS_LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function weekdayLong(s: string): string {
  return WEEKDAYS_LONG[parseDate(s).getUTCDay()];
}

/** Relative label for a due date: היום, מחר, אתמול, לפני 3 ימים, 12 באוקטובר. */
export function dueLabel(due: string, today: string): string {
  const diff = Math.round((parseDate(due).getTime() - parseDate(today).getTime()) / 86400000);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  if (diff < 0 && diff >= -14) return `לפני ${-diff} ימים`;
  const d = parseDate(due);
  const month = MONTHS[d.getUTCMonth()];
  const sameYear = d.getUTCFullYear() === parseDate(today).getUTCFullYear();
  return `${d.getUTCDate()} ב${month}${sameYear ? "" : " " + d.getUTCFullYear()}`;
}
