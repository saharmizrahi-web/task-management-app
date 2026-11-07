import { loadEnv } from "./env";
loadEnv();

type Seed = { title: string; priority: string; status: string; due: number | null; description?: string; doneAgo?: number };

const HOME: Seed[] = [
  { title: "לשלם ארנונה", priority: "urgent", status: "new", due: 0, description: "תשלום דו-חודשי, אפשר באתר העירייה" },
  { title: "לקנות חלב, ביצים ולחם", priority: "medium", status: "new", due: 0 },
  { title: "להתקשר לסבתא", priority: "high", status: "new", due: 1 },
  { title: "לתאם טכנאי למזגן", priority: "medium", status: "new", due: -2 },
  { title: "להזמין מתנה ליום הולדת של אחותי", priority: "medium", status: "done", due: -3, doneAgo: 1 },
];

const WORK: Seed[] = [
  { title: "להכין מצגת ללקוח החדש", priority: "urgent", status: "in_progress", due: 1, description: "10 שקפים: בעיה, פתרון, תמחור" },
  { title: "לענות לפניות שנצברו במייל", priority: "high", status: "new", due: -1 },
  { title: "לעדכן את דוח ההוצאות החודשי", priority: "medium", status: "new", due: 5 },
  { title: "פגישת סטטוס שבועית עם הצוות", priority: "medium", status: "in_progress", due: 0 },
  { title: "לבדוק הצעת מחיר מספק הדפוס", priority: "low", status: "paused", due: 12 },
  { title: "לשלוח חשבונית ללקוח", priority: "high", status: "done", due: -2, doneAgo: 0 },
];

const STUDY: Seed[] = [
  { title: "להגיש עבודה בסטטיסטיקה", priority: "urgent", status: "in_progress", due: 3 },
  { title: "לקרוא פרקים 4 עד 6 בספר הקורס", priority: "medium", status: "new", due: 2 },
  { title: "להתכונן למבחן באלגברה", priority: "high", status: "new", due: 8 },
  { title: "לשלוח מייל למרצה על הארכה", priority: "low", status: "new", due: -1 },
  { title: "מפגש קבוצת לימוד", priority: "medium", status: "new", due: 4 },
];

async function main() {
  const { pool, ensureSchema } = await import("../lib/db");
  const { addDays, todayStr } = await import("../lib/date");
  await ensureSchema();
  const db = pool();

  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM ms_spaces`);
  if (existing.rows[0].n > 0 && !process.argv.includes("--force")) {
    console.log("data already exists, skipping seed (use --force to add anyway)");
    await db.end();
    return;
  }

  const today = todayStr();
  const spaces = [
    { name: "בית", color: "#10b981", view: "todo", tasks: HOME },
    { name: "עבודה", color: "#4f46e5", view: "kanban", tasks: WORK },
    { name: "לימודים", color: "#f59e0b", view: "calendar", tasks: STUDY },
  ];

  let sp = 0;
  let total = 0;
  for (const s of spaces) {
    sp += 1000;
    const r = await db.query(
      `INSERT INTO ms_spaces (name, color, view, position) VALUES ($1,$2,$3,$4) RETURNING id`,
      [s.name, s.color, s.view, sp],
    );
    const spaceId = r.rows[0].id as number;
    let pos = 0;
    for (const t of s.tasks) {
      pos += 1000;
      const due = t.due === null ? null : addDays(today, t.due);
      const completed = t.status === "done" ? new Date(Date.now() - (t.doneAgo ?? 0) * 86400000) : null;
      await db.query(
        `INSERT INTO ms_tasks (space_id, title, description, priority, status, due_date, completed_at, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [spaceId, t.title, t.description ?? "", t.priority, t.status, due, completed, pos],
      );
      total++;
    }
  }
  console.log(`seeded ${spaces.length} spaces and ${total} tasks`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
