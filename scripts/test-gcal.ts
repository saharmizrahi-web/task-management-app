// Checks lib/gcal.ts parsing on a synthetic feed.   npm run test:gcal
import assert from "node:assert/strict";
import { parseIcs } from "../lib/gcal";

const feed = (events: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", events.trim(), "END:VCALENDAR"].join("\r\n").replace(/\r?\n/g, "\r\n");

const ICS = feed(`
BEGIN:VEVENT
UID:tz-no-vtimezone@test
DTSTART;TZID=Asia/Jerusalem:20270329T160000
DTEND;TZID=Asia/Jerusalem:20270329T170000
SUMMARY:Appointment
END:VEVENT
BEGIN:VEVENT
UID:utc@test
DTSTART:20261110T060000Z
DTEND:20261110T070000Z
SUMMARY:UTC morning
END:VEVENT
BEGIN:VEVENT
UID:allday@test
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261102
SUMMARY:All day
END:VEVENT
BEGIN:VEVENT
UID:alldays@test
DTSTART;VALUE=DATE:20270720
DTEND;VALUE=DATE:20270723
SUMMARY:Trip days
END:VEVENT
BEGIN:VEVENT
UID:multi@test
DTSTART:20270720T050000Z
DTEND:20270722T060000Z
SUMMARY:Trip
END:VEVENT
BEGIN:VEVENT
UID:midnight@test
DTSTART;TZID=Asia/Jerusalem:20261203T220000
DTEND;TZID=Asia/Jerusalem:20261204T000000
SUMMARY:Late
END:VEVENT
BEGIN:VEVENT
UID:cancelled@test
DTSTART:20261201T060000Z
DTEND:20261201T070000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:old@test
DTSTART:20250101T060000Z
DTEND:20250101T070000Z
SUMMARY:Too old
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
DTSTART;TZID=Asia/Jerusalem:20261102T080000
DTEND;TZID=Asia/Jerusalem:20261102T090000
RRULE:FREQ=WEEKLY;COUNT=20
EXDATE;TZID=Asia/Jerusalem:20261109T080000
SUMMARY:Weekly
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
RECURRENCE-ID;TZID=Asia/Jerusalem:20261116T080000
DTSTART;TZID=Asia/Jerusalem:20261116T100000
DTEND;TZID=Asia/Jerusalem:20261116T110000
SUMMARY:Weekly moved
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
RECURRENCE-ID;TZID=Asia/Jerusalem:20261123T080000
DTSTART;TZID=Asia/Jerusalem:20261123T080000
DTEND;TZID=Asia/Jerusalem:20261123T090000
STATUS:CANCELLED
SUMMARY:Weekly
END:VEVENT
`);

const { occurrences, eventCount } = parseIcs(ICS, { from: "2026-10-01", to: "2029-11-09", recurringTo: "2026-12-01" }, "gcal:4:");
const by = (title: string) => occurrences.filter((o) => o.title === title);
const one = (title: string) => {
  const list = by(title);
  assert.equal(list.length, 1, `${title}: expected 1, got ${list.length}`);
  return list[0];
};

assert.equal(eventCount, 11);
assert.deepEqual(
  { due: one("Appointment").due, when: one("Appointment").when },
  { due: "2027-03-29", when: "16:00–17:00" },
  "TZID without VTIMEZONE must stay Israel time",
);
assert.equal(one("UTC morning").when, "08:00–09:00");
assert.deepEqual([one("All day").due, one("All day").lastDay, one("All day").when], ["2026-11-01", "2026-11-01", "כל היום"]);
assert.deepEqual([one("Trip days").due, one("Trip days").lastDay, one("Trip days").when], ["2027-07-20", "2027-07-22", "20.7 – 22.7"]);
assert.deepEqual([one("Trip").due, one("Trip").when], ["2027-07-20", "20.7 08:00 – 22.7 09:00"]);
assert.deepEqual([one("Late").due, one("Late").lastDay, one("Late").when], ["2026-12-03", "2026-12-03", "22:00–00:00"]);
assert.equal(by("Cancelled").length, 0, "cancelled events are skipped");
assert.equal(by("Too old").length, 0, "events before the window are skipped");

// Weekly: 2.11, 9.11 excluded, 16.11 moved to 10:00, 23.11 cancelled, 30.11, then past recurringTo
assert.deepEqual(by("Weekly").map((o) => o.due), ["2026-11-02", "2026-11-30"]);
assert.deepEqual([one("Weekly moved").due, one("Weekly moved").when], ["2026-11-16", "10:00–11:00"]);
const ids = occurrences.map((o) => o.externalId);
assert.equal(new Set(ids).size, ids.length, "external ids are unique");
assert.ok(ids.every((id) => id.startsWith("gcal:4:")));
assert.equal(one("UTC morning").externalId, "gcal:4:utc@test");

console.log(`ok: ${occurrences.length} occurrences (TZ=${process.env.TZ ?? "system"})`);
