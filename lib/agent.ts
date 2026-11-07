import { q } from "./db";
import { sign, safeEqual } from "./auth";
import { addDays, todayStr, weekdayLong, weekStart } from "./date";
import { PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "./constants";
import { createTask, deleteTasks, updateTask, type TaskInput } from "./store";
import type { Priority, Space, Status, Task } from "./types";

export const AGENT_MODEL = "gpt-6-luna";
const CONFIRM_THRESHOLD = 3; // more than this many tasks => ask first

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface PendingAction {
  token: string;
  kind: "add" | "update" | "delete";
  count: number;
  summary: string;
  titles: string[];
}

export interface AgentResult {
  reply: string;
  actions: string[];
  mutated: boolean;
  pending: PendingAction[];
}

/* ------------------------------------------------------------------ */
/* scope + data helpers                                                */
/* ------------------------------------------------------------------ */

interface Ctx {
  spaces: Space[]; // spaces inside the scope
  today: string;
  pending: PendingAction[];
  actions: string[];
  mutated: boolean;
}

async function loadScope(spaceIds: number[] | "all"): Promise<Space[]> {
  const rows = await q<Space>(`SELECT id, name, color, view, position FROM ms_spaces ORDER BY position, id`);
  if (spaceIds === "all") return rows;
  const set = new Set(spaceIds);
  return rows.filter((s) => set.has(s.id));
}

async function scopedTasks(ctx: Ctx): Promise<Task[]> {
  if (!ctx.spaces.length) return [];
  const rows = await q<Task>(
    `SELECT id, space_id, title, description, priority, status, due_date, completed_at, position, created_at
       FROM ms_tasks WHERE space_id = ANY($1::int[]) ORDER BY space_id, position, id`,
    [ctx.spaces.map((s) => s.id)],
  );
  return rows.map((t) => ({
    ...t,
    completed_at: t.completed_at ? new Date(t.completed_at).toISOString() : null,
    created_at: new Date(t.created_at).toISOString(),
  }));
}

function resolveSpace(ctx: Ctx, ref: unknown): Space | string {
  if (ref === undefined || ref === null || ref === "") {
    if (ctx.spaces.length === 1) return ctx.spaces[0];
    return `לא צוין מרחב. המרחבים הזמינים: ${ctx.spaces.map((s) => s.name).join(", ")}`;
  }
  const txt = String(ref).trim();
  const byId = ctx.spaces.find((s) => String(s.id) === txt);
  if (byId) return byId;
  const lc = txt.toLowerCase();
  const exact = ctx.spaces.find((s) => s.name.trim().toLowerCase() === lc);
  if (exact) return exact;
  const part = ctx.spaces.filter((s) => s.name.toLowerCase().includes(lc) || lc.includes(s.name.toLowerCase()));
  if (part.length === 1) return part[0];
  return `המרחב "${txt}" לא נמצא בהקשר הנוכחי. המרחבים הזמינים: ${ctx.spaces.map((s) => s.name).join(", ")}`;
}

interface Filter {
  ids?: number[];
  space?: string | number;
  status?: string;
  priority?: string;
  overdue?: boolean;
  due_on?: string;
  due_before?: string;
  due_after?: string;
  no_due_date?: boolean;
  search?: string;
}

function hasFilter(f: Filter): boolean {
  return !!(
    (f.ids && f.ids.length) || f.space !== undefined || f.status || f.priority || f.overdue ||
    f.due_on || f.due_before || f.due_after || f.no_due_date || f.search
  );
}

function applyFilter(ctx: Ctx, tasks: Task[], f: Filter): Task[] | string {
  let out = tasks;
  if (f.ids && f.ids.length) {
    const set = new Set(f.ids.map(Number));
    out = out.filter((t) => set.has(t.id));
  }
  if (f.space !== undefined && f.space !== null && f.space !== "") {
    const sp = resolveSpace(ctx, f.space);
    if (typeof sp === "string") return sp;
    out = out.filter((t) => t.space_id === sp.id);
  }
  if (f.status) out = out.filter((t) => t.status === f.status);
  if (f.priority) out = out.filter((t) => t.priority === f.priority);
  if (f.overdue) out = out.filter((t) => t.status !== "done" && t.due_date !== null && t.due_date < ctx.today);
  if (f.due_on) out = out.filter((t) => t.due_date === f.due_on);
  if (f.due_before) out = out.filter((t) => t.due_date !== null && t.due_date < f.due_before!);
  if (f.due_after) out = out.filter((t) => t.due_date !== null && t.due_date > f.due_after!);
  if (f.no_due_date) out = out.filter((t) => t.due_date === null);
  if (f.search) {
    const s = f.search.toLowerCase();
    out = out.filter((t) => t.title.toLowerCase().includes(s) || t.description.toLowerCase().includes(s));
  }
  return out;
}

const spaceName = (ctx: Ctx, id: number) => ctx.spaces.find((s) => s.id === id)?.name ?? String(id);

function brief(ctx: Ctx, t: Task) {
  return {
    id: t.id,
    space: spaceName(ctx, t.space_id),
    title: t.title,
    priority: t.priority,
    status: t.status,
    due_date: t.due_date,
    ...(t.description ? { description: t.description.slice(0, 120) } : {}),
  };
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* ------------------------------------------------------------------ */
/* confirmation tokens (stateless, HMAC-signed)                        */
/* ------------------------------------------------------------------ */

type PendingPayload =
  | { kind: "add"; inputs: TaskInput[]; exp: number }
  | { kind: "update"; ids: number[]; changes: TaskInput; exp: number }
  | { kind: "delete"; ids: number[]; exp: number };

function makeToken(p: PendingPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readToken(token: string): PendingPayload | null {
  const [body, sig] = String(token).split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PendingPayload;
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

function pendingCard(kind: PendingAction["kind"], titles: string[], token: string, summary: string): PendingAction {
  return { token, kind, count: titles.length, summary, titles: titles.slice(0, 12) };
}

/* ------------------------------------------------------------------ */
/* tools                                                               */
/* ------------------------------------------------------------------ */

const filterProps = {
  ids: { type: "array", items: { type: "integer" }, description: "מזהי משימות ספציפיים" },
  space: { type: "string", description: "שם המרחב (או מזהה). לא חובה." },
  status: { type: "string", enum: STATUSES, description: "new=חדשה, in_progress=בעבודה, paused=בהשהייה, done=הושלמה" },
  priority: { type: "string", enum: PRIORITIES },
  overdue: { type: "boolean", description: "רק משימות באיחור (תאריך יעד עבר ולא הושלמו)" },
  due_on: { type: "string", description: "תאריך יעד מדויק YYYY-MM-DD" },
  due_before: { type: "string", description: "תאריך יעד לפני YYYY-MM-DD" },
  due_after: { type: "string", description: "תאריך יעד אחרי YYYY-MM-DD" },
  no_due_date: { type: "boolean", description: "רק משימות בלי תאריך יעד" },
  search: { type: "string", description: "חיפוש טקסט בכותרת/תיאור" },
};

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_tasks",
      description: "קורא משימות מהמרחבים שבהקשר הנוכחי. כל הפילטרים אופציונליים ומשתלבים. מחזיר עד 80 משימות.",
      parameters: { type: "object", properties: { ...filterProps, limit: { type: "integer" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tasks",
      description: "מוסיף משימה אחת או יותר. אם יש רק מרחב אחד בהקשר אפשר להשמיט את space.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                space: { type: "string", description: "שם המרחב" },
                priority: { type: "string", enum: PRIORITIES },
                status: { type: "string", enum: STATUSES },
                due_date: { type: "string", description: "YYYY-MM-DD" },
                description: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_tasks",
      description:
        "מעדכן משימות. בוחרים משימות לפי ids ו/או פילטרים, ומציינים ב-changes מה לשנות. אפשר לשנות status, priority, due_date (YYYY-MM-DD או null להסרה), title, description, space. חובה לפחות פילטר אחד או ids.",
      parameters: {
        type: "object",
        properties: {
          ...filterProps,
          changes: {
            type: "object",
            properties: {
              status: { type: "string", enum: STATUSES },
              priority: { type: "string", enum: PRIORITIES },
              due_date: { type: ["string", "null"] },
              title: { type: "string" },
              description: { type: "string" },
              space: { type: "string" },
            },
          },
        },
        required: ["changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_tasks",
      description: "מוחק משימות לפי ids ו/או פילטרים. תמיד דורש אישור מהמשתמש. חובה לפחות פילטר אחד או ids.",
      parameters: { type: "object", properties: { ...filterProps } },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_tasks",
      description:
        "מסכם את המצב: ספירה לפי סטטוס ועדיפות, באיחור, להיום, דחופות פתוחות, והמשימות הפתוחות החשובות ביותר. אפשר לצמצם למרחב אחד.",
      parameters: { type: "object", properties: { space: { type: "string" } } },
    },
  },
];

type Args = Record<string, any>;

function pickFilter(a: Args): Filter {
  return {
    ids: Array.isArray(a.ids) ? a.ids.map(Number).filter(Number.isInteger) : undefined,
    space: a.space,
    status: a.status,
    priority: a.priority,
    overdue: a.overdue === true,
    due_on: isDate(a.due_on) ? a.due_on : undefined,
    due_before: isDate(a.due_before) ? a.due_before : undefined,
    due_after: isDate(a.due_after) ? a.due_after : undefined,
    no_due_date: a.no_due_date === true,
    search: typeof a.search === "string" && a.search.trim() ? a.search.trim() : undefined,
  };
}

async function runTool(ctx: Ctx, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case "read_tasks": {
      const all = await scopedTasks(ctx);
      const f = applyFilter(ctx, all, pickFilter(a));
      if (typeof f === "string") return { error: f };
      const limit = Math.min(Number(a.limit) || 80, 80);
      ctx.actions.push(`קראתי ${Math.min(f.length, limit)} משימות`);
      return { total: f.length, tasks: f.slice(0, limit).map((t) => brief(ctx, t)) };
    }

    case "summarize_tasks": {
      const all = await scopedTasks(ctx);
      let tasks = all;
      if (a.space) {
        const f = applyFilter(ctx, all, { space: a.space });
        if (typeof f === "string") return { error: f };
        tasks = f;
      }
      const open = tasks.filter((t) => t.status !== "done");
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      for (const t of tasks) byStatus[STATUS_META[t.status].label] = (byStatus[STATUS_META[t.status].label] ?? 0) + 1;
      for (const t of open) byPriority[PRIORITY_META[t.priority].label] = (byPriority[PRIORITY_META[t.priority].label] ?? 0) + 1;
      const ws = weekStart(ctx.today);
      const rank = (t: Task) => PRIORITY_META[t.priority].rank;
      const top = [...open]
        .sort((x, y) => rank(x) - rank(y) || (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999"))
        .slice(0, 10)
        .map((t) => brief(ctx, t));
      ctx.actions.push("סיכמתי את המשימות");
      return {
        spaces: ctx.spaces.map((s) => s.name),
        total: tasks.length,
        open: open.length,
        overdue: open.filter((t) => t.due_date && t.due_date < ctx.today).length,
        due_today: open.filter((t) => t.due_date === ctx.today).length,
        urgent_open: open.filter((t) => t.priority === "urgent").length,
        completed_this_week: tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) >= ws).length,
        by_status: byStatus,
        open_by_priority: byPriority,
        top_open_tasks: top,
      };
    }

    case "add_tasks": {
      const list: Args[] = Array.isArray(a.tasks) ? a.tasks : [];
      if (!list.length) return { error: "לא התקבלו משימות להוספה" };
      const inputs: TaskInput[] = [];
      for (const item of list) {
        const sp = resolveSpace(ctx, item.space);
        if (typeof sp === "string") return { error: sp };
        const title = String(item.title ?? "").trim();
        if (!title) return { error: "יש משימה בלי כותרת" };
        inputs.push({
          space_id: sp.id,
          title,
          description: typeof item.description === "string" ? item.description : "",
          priority: PRIORITIES.includes(item.priority) ? item.priority : "medium",
          status: STATUSES.includes(item.status) ? item.status : "new",
          due_date: isDate(item.due_date) ? item.due_date : null,
        });
      }
      if (inputs.length > CONFIRM_THRESHOLD) {
        const token = makeToken({ kind: "add", inputs, exp: Date.now() + 30 * 60 * 1000 });
        const titles = inputs.map((i) => `${i.title} (${spaceName(ctx, i.space_id!)})`);
        ctx.pending.push(pendingCard("add", titles, token, `הוספת ${inputs.length} משימות`));
        return { status: "awaiting_user_confirmation", count: inputs.length, note: "לא בוצע עדיין. הצג למשתמש כפתור אישור." };
      }
      const created: Task[] = [];
      for (const i of inputs) created.push(await createTask(i));
      ctx.mutated = true;
      ctx.actions.push(`נוספו ${created.length} משימות`);
      return { status: "done", created: created.map((t) => brief(ctx, t)) };
    }

    case "update_tasks": {
      const filter = pickFilter(a);
      if (!hasFilter(filter)) return { error: "חובה לציין ids או פילטר. כדי לעדכן הכל ציין למשל space או status." };
      const all = await scopedTasks(ctx);
      const matched = applyFilter(ctx, all, filter);
      if (typeof matched === "string") return { error: matched };
      const c: Args = a.changes ?? {};
      const changes: TaskInput = {};
      if (STATUSES.includes(c.status)) changes.status = c.status;
      if (PRIORITIES.includes(c.priority)) changes.priority = c.priority;
      if (c.due_date === null) changes.due_date = null;
      else if (isDate(c.due_date)) changes.due_date = c.due_date;
      if (typeof c.title === "string" && c.title.trim()) changes.title = c.title.trim();
      if (typeof c.description === "string") changes.description = c.description;
      if (c.space) {
        const sp = resolveSpace(ctx, c.space);
        if (typeof sp === "string") return { error: sp };
        changes.space_id = sp.id;
      }
      if (!Object.keys(changes).length) return { error: "לא צוין מה לשנות" };
      if (!matched.length) return { status: "done", updated: 0, note: "לא נמצאו משימות מתאימות" };
      if (matched.length > CONFIRM_THRESHOLD) {
        const token = makeToken({ kind: "update", ids: matched.map((t) => t.id), changes, exp: Date.now() + 30 * 60 * 1000 });
        ctx.pending.push(pendingCard("update", matched.map((t) => `${t.title} (${spaceName(ctx, t.space_id)})`), token, `עדכון ${matched.length} משימות`));
        return { status: "awaiting_user_confirmation", count: matched.length, note: "לא בוצע עדיין. הצג למשתמש כפתור אישור." };
      }
      const updated: Task[] = [];
      for (const t of matched) {
        const r = await updateTask(t.id, changes);
        if (r) updated.push(r);
      }
      ctx.mutated = true;
      ctx.actions.push(`עודכנו ${updated.length} משימות`);
      return { status: "done", updated: updated.map((t) => brief(ctx, t)) };
    }

    case "delete_tasks": {
      const filter = pickFilter(a);
      if (!hasFilter(filter)) return { error: "חובה לציין ids או פילטר למחיקה" };
      const all = await scopedTasks(ctx);
      const matched = applyFilter(ctx, all, filter);
      if (typeof matched === "string") return { error: matched };
      if (!matched.length) return { status: "done", deleted: 0, note: "לא נמצאו משימות מתאימות" };
      const token = makeToken({ kind: "delete", ids: matched.map((t) => t.id), exp: Date.now() + 30 * 60 * 1000 });
      ctx.pending.push(pendingCard("delete", matched.map((t) => `${t.title} (${spaceName(ctx, t.space_id)})`), token, `מחיקת ${matched.length} משימות`));
      return { status: "awaiting_user_confirmation", count: matched.length, note: "מחיקה תמיד דורשת אישור. לא בוצע עדיין." };
    }
  }
  return { error: `כלי לא מוכר: ${name}` };
}

/* ------------------------------------------------------------------ */
/* confirmation execution                                              */
/* ------------------------------------------------------------------ */

export async function executePending(token: string, scopeIds: number[] | "all"): Promise<{ message: string; mutated: boolean }> {
  const p = readToken(token);
  if (!p) return { message: "פג תוקף האישור או שהוא לא תקין. בקש שוב מהסוכן.", mutated: false };
  const allowed = new Set((await loadScope(scopeIds)).map((s) => s.id));

  if (p.kind === "add") {
    let n = 0;
    for (const i of p.inputs) {
      if (!i.space_id || !allowed.has(i.space_id)) continue;
      await createTask(i);
      n++;
    }
    return { message: `בוצע. נוספו ${n} משימות.`, mutated: n > 0 };
  }

  // update / delete: only touch tasks that still live inside the scope
  const rows = await q<{ id: number }>(
    `SELECT id FROM ms_tasks WHERE id = ANY($1::int[]) AND space_id = ANY($2::int[])`,
    [p.ids, [...allowed]],
  );
  const ids = rows.map((r) => r.id);
  if (p.kind === "delete") {
    const n = await deleteTasks(ids);
    return { message: `בוצע. נמחקו ${n} משימות.`, mutated: n > 0 };
  }
  let n = 0;
  for (const id of ids) {
    if (p.changes.space_id && !allowed.has(p.changes.space_id)) continue;
    if (await updateTask(id, p.changes)) n++;
  }
  return { message: `בוצע. עודכנו ${n} משימות.`, mutated: n > 0 };
}

/* ------------------------------------------------------------------ */
/* the agent loop                                                      */
/* ------------------------------------------------------------------ */

function systemPrompt(ctx: Ctx, scopeAll: boolean): string {
  const today = ctx.today;
  const days = Array.from({ length: 7 }, (_, i) => `${weekdayLong(addDays(today, i))} ${addDays(today, i)}`).join(" | ");
  return `אתה העוזר החכם של מערכת ניהול משימות אישית. אתה עונה תמיד בעברית, קצר וענייני (משפט עד שלושה).

היום: יום ${weekdayLong(today)}, ${today} (שעון ישראל). הימים הקרובים: ${days}.
כשהמשתמש אומר "מחר", "ביום שלישי", "עד ה-10" וכד', חשב תאריך מדויק בפורמט YYYY-MM-DD מהתאריכים האלה. "עד ה-10" הוא ה-10 הקרוב בחודש (הנוכחי, ואם עבר אז הבא).

הקשר העבודה הנוכחי: ${scopeAll ? "כל המרחבים" : "מרחב ספציפי"}. המרחבים שאתה רשאי לראות ולשנות:
${ctx.spaces.map((s) => `- ${s.name} (תצוגה: ${s.view})`).join("\n") || "- (אין מרחבים)"}
אתה פועל אך ורק על המרחבים האלה. אל תזכיר ואל תיגע במרחבים אחרים, גם אם המשתמש מבקש. אם הוא מבקש משהו מחוץ להקשר, הסבר שאפשר לשנות את הבחירה בראש חלון הצ'אט.

עדיפויות: דחוף > גבוהה > בינונית > נמוכה. סטטוסים: חדשה (new), בעבודה (in_progress), בהשהייה (paused), הושלמה (done).
ברירות מחדל להוספה: עדיפות בינונית, סטטוס חדשה. אל תמציא מרחב: אם יש יותר ממרחב אחד והמשתמש לא ציין, שאל באיזה מרחב.

כללים:
- לשאלות על המצב או על מה חשוב, השתמש ב-summarize_tasks או read_tasks לפני שאתה עונה. אל תנחש.
- לפעולות, השתמש בכלים. אל תגיד שביצעת משהו אם לא קראת לכלי והוא החזיר status "done".
- כלי שהחזיר "awaiting_user_confirmation" לא בוצע עדיין. אמור כמה משימות ישתנו (ציין את המספר המדויק) ובקש מהמשתמש ללחוץ על כפתור האישור שמופיע בצ'אט. אל תטען שזה בוצע.
- אחרי ביצוע, אמור בקצרה מה עשית ועל כמה משימות.
- אל תוסיף פילטרים שהמשתמש לא ביקש. "כל המשימות" פירושו בלי פילטר סטטוס או עדיפות, רק המרחב אם צריך.
- אם המשתמש מציין מרחב ספציפי שאינו ברשימה שלמעלה, אל תוסיף או תשנה במרחב אחר. הסבר שהמרחב לא נבחר ושאפשר לשנות בחירה בראש הצ'אט.
- בתשובה ציין את שם המרחב בדיוק כפי שחזר מהכלי, לא כפי שהמשתמש כתב.
- בשאלות על עדיפויות, תן המלצה ברורה: 3 עד 5 משימות עם נימוק של שורה לכל אחת.
- כתוב בעברית פשוטה, בלי מקפים ארוכים, בלי אימוג'ים.`;
}

async function callModel(instructions: string, input: unknown[]): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY לא הוגדר בשרת");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || AGENT_MODEL,
      instructions,
      input,
      tools: TOOLS.map((t) => ({ type: "function", name: t.function.name, description: t.function.description, parameters: t.function.parameters, strict: false })),
      reasoning: { effort: process.env.OPENAI_REASONING || "low" },
    }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מהמודל (${res.status})`);
  }
  if (!res.ok || json.error) {
    throw new Error(`שגיאת מודל: ${json?.error?.message ?? res.status}`);
  }
  return json;
}

export async function runAgent(history: ChatMsg[], spaceIds: number[] | "all"): Promise<AgentResult> {
  const spaces = await loadScope(spaceIds);
  const scopeAll = spaceIds === "all";
  const ctx: Ctx = { spaces, today: todayStr(), pending: [], actions: [], mutated: false };

  const instructions = systemPrompt(ctx, scopeAll);
  const input: any[] = history.slice(-20).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  let reply = "";
  for (let step = 0; step < 8; step++) {
    const json = await callModel(instructions, input);
    const output: any[] = json.output ?? [];
    const calls = output.filter((o) => o.type === "function_call");
    if (!calls.length) {
      reply = output
        .filter((o) => o.type === "message")
        .flatMap((o) => (o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text))
        .join("\n")
        .trim();
      break;
    }
    input.push(...output);
    for (const call of calls) {
      let args: Args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        /* keep empty */
      }
      let result: unknown;
      try {
        result = await runTool(ctx, call.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "שגיאה בכלי" };
      }
      if (process.env.AGENT_DEBUG) console.log("[agent tool]", call.name, JSON.stringify(args), JSON.stringify(result).slice(0, 600));
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }

  if (!reply) {
    reply = ctx.pending.length
      ? `זו פעולה על ${ctx.pending.reduce((n, p) => n + p.count, 0)} משימות. לחץ על אישור כדי לבצע.`
      : ctx.actions.length
        ? `בוצע: ${ctx.actions.join(", ")}.`
        : "לא הצלחתי להשלים את הבקשה, נסה לנסח אותה מחדש.";
  }
  return { reply, actions: ctx.actions, mutated: ctx.mutated, pending: ctx.pending };
}

export type { Priority, Status };
