import { loadEnv } from "./env";
loadEnv();

/**
 * Runs the Google Calendar sync now (the app also runs it when opened).
 *
 *   npm run gcal:sync                                  # every GCAL_ICS_<spaceId> in the env
 *   npm run gcal:sync -- --dry-run                     # print what would change
 *   npm run gcal:sync -- --file cal.ics --space 4 --dry-run   # a local .ics file instead of the env
 */

import { readFileSync } from "fs";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { syncGoogleCalendar } = await import("../lib/gcal");
  const { pool } = await import("../lib/db");
  const file = arg("--file");
  const space = Number(arg("--space"));
  if (file && !Number.isInteger(space)) throw new Error("--file needs --space <id>");

  const result = await syncGoogleCalendar({
    force: true,
    dryRun: process.argv.includes("--dry-run"),
    feeds: file ? [{ spaceId: space, text: readFileSync(file, "utf8") }] : undefined,
  });
  if (result.status === "ok" && result.preview) {
    for (const line of result.preview) console.log(line);
    delete result.preview;
  }
  console.log(result);
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
