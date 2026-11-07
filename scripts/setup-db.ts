import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { pool, SCHEMA_SQL } = await import("../lib/db");
  await pool().query(SCHEMA_SQL);
  console.log("schema ready");
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
