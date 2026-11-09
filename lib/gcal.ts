import ICAL from "ical.js";
import { pool, q } from "./db";
import { addDays, todayStr } from "./date";

/**
 * One-way sync from Google Calendar into tasks, through each calendar's secret iCal address.
 * Every feed is an env var `GCAL_ICS_<spaceId>=<secret address>`; its events become tasks in that space.
 * Google owns title, date and time. Status, priority and space stay with the app.
 */

const TZ = "Asia/Jerusalem";
const SOURCE = "מסונכרן מיומן Google";
const THROTTLE_MINUTES = 5;
const YEARS_AHEAD = 3;
const RECURRING_DAYS_AHEAD = 90; // a daily event would otherwise become 1,000+ tasks
const MAX_STEPS = 20000;

// Used when a feed says TZID=Asia/Jerusalem without a VTIMEZONE block. Without it ical.js treats
// those times as floating, and on a UTC server they land 2-3 hours late.
const ISRAEL_VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Asia/Jerusalem",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:IDT", "DTSTART:19700327T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:IST", "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

export interface Occurrence {
  externalId: string;
  title: string;
  due: string; // first day, Israel time
  lastDay: string; // last day, inclusive
  when: string; // "08:00–09:00", "כל היום", "20.7 08:00 – 22.7 09:00"
  endsAt: string; // ISO
}

export interface SyncWindow {
  from: string; // older events are left alone
  to: string;
  recurringTo: string;
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
const dm = (s: string) => `${Number(s.slice(8, 10))}.${Number(s.slice(5, 7))}`;

function israelZone(): ICAL.Timezone {
  let zone = ICAL.TimezoneService.get(TZ);
  if (!zone) {
    ICAL.TimezoneService.register(new ICAL.Component(ICAL.parse(ISRAEL_VTIMEZONE)));
    zone = ICAL.TimezoneService.get(TZ)!;
  }
  return zone;
}

/** Floating times (no zone) are read as Israel wall-clock time. */
function instant(t: ICAL.Time): Date {
  if (t.zone?.tzid === "floating") {
    t = ICAL.Time.fromData({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second }, israelZone());
  }
  return t.toJSDate();
}

function toOccurrence(externalId: string, summary: string, start: ICAL.Time, end: ICAL.Time | null): Occurrence {
  const title = (summary || "").trim().slice(0, 200) || "(ללא כותרת)";
  if (start.isDate) {
    const due = dateOnly(start);
    const endExclusive = end?.isDate ? dateOnly(end) : addDays(due, 1);
    const lastDay = endExclusive > due ? addDays(endExclusive, -1) : due;
    const when = lastDay === due ? "כל היום" : `${dm(due)} – ${dm(lastDay)}`;
    return { externalId, title, due, lastDay, when, endsAt: `${addDays(lastDay, 1)}T00:00:00.000Z` };
  }
  const s = instant(start);
  const e = end ? instant(end) : s;
  const due = dayFmt.format(s);
  // An event that ends exactly at midnight belongs to the day before
  const lastDay = e > s && hmFmt.format(e) === "00:00" ? dayFmt.format(new Date(e.getTime() - 1)) : dayFmt.format(e);
  const when = due === lastDay ? `${hmFmt.format(s)}–${hmFmt.format(e)}` : `${dm(due)} ${hmFmt.format(s)} – ${dm(lastDay)} ${hmFmt.format(e)}`;
  return { externalId, title, due, lastDay, when, endsAt: e.toISOString() };
}

const cancelled = (ev: ICAL.Event) => String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

/** Expands an iCal feed into dated occurrences inside the window. */
export function parseIcs(text: string, win: SyncWindow, idPrefix = ""): { occurrences: Occurrence[]; eventCount: number } {
  israelZone();
  const cal = new ICAL.Component(ICAL.parse(text));
  for (const tz of cal.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const vevents = cal.getAllSubcomponents("vevent");
  const events = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else events.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = events.get(ex.uid);
    if (master) master.relateException(ex);
    else events.set(`${ex.uid}/${ex.recurrenceId.toString()}`, ex); // moved instance whose series isn't in the feed
  }

  const out: Occurrence[] = [];
  const inWindow = (o: Occurrence) => o.lastDay >= win.from && o.due <= win.to;
  for (const [key, ev] of events) {
    if (cancelled(ev)) continue;
    if (!ev.isRecurring()) {
      const o = toOccurrence(`${idPrefix}${key}`, ev.summary, ev.startDate, ev.endDate);
      if (inWindow(o)) out.push(o);
      continue;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    for (let i = 0; i < MAX_STEPS && (next = it.next()); i++) {
      if (dateOnly(next) > win.recurringTo) break;
      const d = ev.getOccurrenceDetails(next);
      if (cancelled(d.item)) continue;
      const o = toOccurrence(`${idPrefix}${ev.uid}/${d.recurrenceId.toString()}`, d.item.summary, d.startDate, d.endDate);
      if (o.lastDay >= win.from && o.due <= win.to) out.push(o);
    }
  }
  out.sort((a, b) => a.due.localeCompare(b.due) || a.externalId.localeCompare(b.externalId));
  return { occurrences: out, eventCount: vevents.length };
}

export function syncWindow(today = todayStr()): SyncWindow {
  const thisMonth = today.slice(0, 8) + "01";
  return {
    from: addDays(thisMonth, -1).slice(0, 8) + "01", // the 1st of last month
    to: addDays(today, 365 * YEARS_AHEAD),
    recurringTo: addDays(today, RECURRING_DAYS_AHEAD),
  };
}

/* ---------------- sync ---------------- */

export interface Feed {
  spaceId: number;
  url?: string;
  text?: string; // instead of url, for scripts and tests
}

export function configuredFeeds(): Feed[] {
  return Object.entries(process.env).flatMap(([k, v]) => {
    const m = k.match(/^GCAL_ICS_(\d+)$/);
    return m && v ? [{ spaceId: Number(m[1]), url: v.trim() }] : [];
  });
}

export type SyncResult =
  | { status: "disabled" | "skipped" }
  | { status: "ok"; added: number; updated: number; removed: number; errors: string[]; preview?: string[] };

type Row = { id: number; title: string; due_date: string | null; description: string; external_id: string | null };

/** At most one sync per THROTTLE_MINUTES across all server instances. */
async function claimSlot(): Promise<boolean> {
  const rows = await q(
    `INSERT INTO ms_settings (key, value) VALUES ('gcal_sync', jsonb_build_object('at', now()))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     WHERE (ms_settings.value->>'at')::timestamptz < now() - make_interval(mins => $1)
     RETURNING key`,
    [THROTTLE_MINUTES],
  );
  return rows.length > 0;
}

async function download(url: string): Promise<string> {
  // The address is a secret: errors never include it
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google Calendar answered ${res.status}`);
  const text = (await res.text()).replace(/^﻿/, "");
  if (!text.startsWith("BEGIN:VCALENDAR")) throw new Error("the response is not an iCal feed");
  return text;
}

async function syncFeed(spaceId: number, text: string, dryRun: boolean) {
  const [space] = await q(`SELECT id FROM ms_spaces WHERE id = $1`, [spaceId]);
  if (!space) throw new Error("space not found");

  const today = todayStr();
  const win = syncWindow(today);
  const prefix = `gcal:${spaceId}:`;
  const { occurrences, eventCount } = parseIcs(text, win, prefix);
  const existing = await q<Row>(
    `SELECT id, title, due_date, description, external_id FROM ms_tasks
     WHERE starts_with(external_id, $1) OR (space_id = $2 AND external_id IS NULL)`,
    [prefix, spaceId],
  );

  const linked = new Map(existing.filter((t) => t.external_id).map((t) => [t.external_id!, t]));
  const unlinked = existing.filter((t) => !t.external_id);
  const inserts: Occurrence[] = [];
  const updates: { id: number; o: Occurrence; link: boolean }[] = [];
  const seen = new Set<string>();

  for (const o of occurrences) {
    if (seen.has(o.externalId)) continue;
    seen.add(o.externalId);
    const description = `${o.when}\n${SOURCE}`;
    const cur = linked.get(o.externalId);
    if (cur) {
      if (cur.title !== o.title || cur.due_date !== o.due || cur.description !== description) updates.push({ id: cur.id, o, link: false });
      continue;
    }
    // A task imported by hand before the sync existed: same title and date in this space
    const i = unlinked.findIndex((t) => t.title === o.title && t.due_date === o.due);
    if (i >= 0) {
      updates.push({ id: unlinked[i].id, o, link: true });
      unlinked.splice(i, 1);
      continue;
    }
    inserts.push(o);
  }
  // Deleted in Google. Older tasks are outside the window and stay. An empty feed is more likely an error than an empty calendar.
  const removals = eventCount === 0 ? [] : [...linked.values()].filter((t) => !seen.has(t.external_id!) && t.due_date !== null && t.due_date >= win.from);

  const preview = [
    ...inserts.map((o) => `+ ${o.due} ${o.title} (${o.when})`),
    ...updates.map(({ o, link }) => `${link ? "~ link" : "~"} ${o.due} ${o.title} (${o.when})`),
    ...removals.map((t) => `- ${t.due_date} ${t.title}`),
  ];
  const counts = { added: inserts.length, updated: updates.length, removed: removals.length, preview };
  if (dryRun || (!inserts.length && !updates.length && !removals.length)) return counts;

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    for (const { id, o } of updates) {
      await client.query(
        `UPDATE ms_tasks SET title = $2, due_date = $3, description = $4, external_id = $5, updated_at = now() WHERE id = $1`,
        [id, o.title, o.due, `${o.when}\n${SOURCE}`, o.externalId],
      );
    }
    for (const o of inserts) {
      const done = o.lastDay < today; // already over: done, not overdue
      await client.query(
        `INSERT INTO ms_tasks (space_id, title, description, status, due_date, completed_at, external_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE((SELECT MAX(position) FROM ms_tasks WHERE space_id = $1), 0) + 1000)`,
        [spaceId, o.title, `${o.when}\n${SOURCE}`, done ? "done" : "new", o.due, done ? o.endsAt : null, o.externalId],
      );
    }
    if (removals.length) await client.query(`DELETE FROM ms_tasks WHERE id = ANY($1::int[])`, [removals.map((t) => t.id)]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return counts;
}

export async function syncGoogleCalendar(opts: { force?: boolean; dryRun?: boolean; feeds?: Feed[] } = {}): Promise<SyncResult> {
  const feeds = opts.feeds ?? configuredFeeds();
  if (!feeds.length) return { status: "disabled" };
  if (!opts.force && !opts.dryRun && !(await claimSlot())) return { status: "skipped" };

  const result = { status: "ok" as const, added: 0, updated: 0, removed: 0, errors: [] as string[], preview: [] as string[] };
  for (const f of feeds) {
    try {
      const text = f.text ?? (await download(f.url!));
      const r = await syncFeed(f.spaceId, text, !!opts.dryRun);
      result.added += r.added;
      result.updated += r.updated;
      result.removed += r.removed;
      if (opts.dryRun) result.preview.push(...r.preview.map((l) => `[${f.spaceId}] ${l}`));
    } catch (e) {
      result.errors.push(`space ${f.spaceId}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  if (!opts.dryRun) delete (result as { preview?: string[] }).preview;
  return result;
}
