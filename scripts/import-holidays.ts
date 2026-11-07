import { loadEnv } from "./env";
loadEnv();

/**
 * Imports Israeli holidays into ms_holidays from Hebcal (https://www.hebcal.com, CC BY 4.0).
 * Keeps the set calendar.2net.co.il shows: chagim, erev chag, chol hamoed, fasts, Chanukah,
 * Rosh Chodesh and the main state days. Re-running replaces everything in the range.
 *
 *   npm run db:holidays                 # from the 1st of this month, 3 years ahead
 *   npm run db:holidays -- --years 5
 *   npm run db:holidays -- --dry-run    # print, don't write
 */

import type { HolidayKind } from "../lib/types";

type HebcalItem = { title: string; date: string; hebrew: string };
type Row = { date: string; title: string; kind: HolidayKind };

// [Hebcal English title, kind, Hebrew label (default: Hebcal's own Hebrew)]. Anything not listed is skipped.
const RULES: [RegExp, HolidayKind, string?][] = [
  [/^Erev Rosh Hashana$/, "erev"],
  [/^Rosh Hashana \d+$/, "chag", "ראש השנה"],
  [/^Rosh Hashana II$/, "chag"],
  [/^Tzom Gedaliah$/, "fast"],
  [/^Erev Yom Kippur$/, "erev"],
  [/^Yom Kippur$/, "chag"],
  [/^Erev Sukkot$/, "erev"],
  [/^Sukkot I$/, "chag", "סוכות"],
  [/^Sukkot (II|III|IV|V|VI) \(CH''M\)$/, "cholhamoed", "חול המועד סוכות"],
  [/^Sukkot VII \(Hoshana Raba\)$/, "cholhamoed", "הושענא רבה"],
  [/^Shmini Atzeret$/, "chag", "שמחת תורה"],
  [/^Chanukah: /, "hanukkah"],
  [/^Asara B'Tevet$/, "fast", "צום עשרה בטבת"],
  [/^Tu BiShvat$/, "other"],
  [/^Ta'anit Esther$/, "fast"],
  [/^Purim$/, "other"],
  [/^Shushan Purim$/, "other"],
  [/^Erev Pesach$/, "erev"],
  [/^Pesach I$/, "chag", "פסח"],
  [/^Pesach (II|III|IV|V|VI) \(CH''M\)$/, "cholhamoed", "חול המועד פסח"],
  [/^Pesach VII$/, "chag", "שביעי של פסח"],
  [/^Yom HaShoah$/, "other"],
  [/^Yom HaZikaron$/, "other"],
  [/^Yom HaAtzma'ut$/, "chag"], // statutory day off
  [/^Lag BaOmer$/, "other"],
  [/^Yom Yerushalayim$/, "other"],
  [/^Erev Shavuot$/, "erev"],
  [/^Shavuot$/, "chag"],
  [/^Tzom Tammuz$/, "fast"],
  [/^Erev Tish'a B'Av$/, "fast"], // the fast starts that evening; not an erev chag, so no vacation tint
  [/^Tish'a B'Av$/, "fast", "צום תשעה באב"],
  [/^Tish'a B'Av \(observed\)$/, "fast", "צום תשעה באב (נדחה)"],
  [/^Rosh Chodesh /, "roshchodesh"],
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function fetchHebcal(start: string, end: string): Promise<HebcalItem[]> {
  const params = new URLSearchParams({
    v: "1", cfg: "json", i: "on", // Israel schedule
    maj: "on", min: "on", mod: "on", nx: "on", mf: "on", // holidays, state days, Rosh Chodesh, minor fasts
    s: "off", ss: "off", c: "off", // no parasha, special shabbatot or candle lighting
    start, end,
  });
  const res = await fetch(`https://www.hebcal.com/hebcal?${params}`, { headers: { "User-Agent": "task-management-app holiday import" } });
  if (!res.ok) throw new Error(`Hebcal ${res.status} for ${start}..${end}`);
  const json = (await res.json()) as { items?: HebcalItem[] };
  return json.items ?? [];
}

function classify(item: HebcalItem): Row | null {
  const title = item.title.replace(/[‘’]/g, "'");
  for (const [re, kind, label] of RULES) {
    if (re.test(title)) return { date: item.date.slice(0, 10), title: label ?? item.hebrew, kind };
  }
  return null;
}

async function main() {
  const { fmtDate, todayStr } = await import("../lib/date");
  const years = Number(arg("--years") ?? 3);
  if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error("--years must be 1..10");
  const dryRun = process.argv.includes("--dry-run");

  const from = todayStr().slice(0, 8) + "01";
  const [fy, fm] = from.split("-").map(Number);
  const to = fmtDate(new Date(Date.UTC(fy + years, fm, 0))); // last day of the same month, `years` later

  const items: HebcalItem[] = [];
  for (let y = fy; y <= fy + years; y++) {
    items.push(...(await fetchHebcal(y === fy ? from : `${y}-01-01`, y === fy + years ? to : `${y}-12-31`)));
  }

  const rows = new Map<string, Row>();
  const skipped = new Set<string>();
  for (const it of items) {
    const r = classify(it);
    if (r) rows.set(`${r.date}|${r.title}`, r);
    else skipped.add(it.title);
  }
  const list = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));

  const byKind: Record<string, number> = {};
  for (const r of list) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  console.log(`range ${from} .. ${to}: ${items.length} Hebcal items, ${list.length} kept`, byKind);
  console.log(`skipped: ${[...skipped].sort().join(", ")}`);

  if (dryRun) {
    for (const r of list) console.log(r.date, r.kind.padEnd(11), r.title);
    return;
  }

  const { pool, ensureSchema } = await import("../lib/db");
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const del = await client.query(`DELETE FROM ms_holidays WHERE date BETWEEN $1 AND $2`, [from, to]);
    await client.query(
      `INSERT INTO ms_holidays (date, title, kind) SELECT * FROM unnest($1::date[], $2::text[], $3::text[])`,
      [list.map((r) => r.date), list.map((r) => r.title), list.map((r) => r.kind)],
    );
    await client.query("COMMIT");
    console.log(`replaced ${del.rowCount} rows with ${list.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool().end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
