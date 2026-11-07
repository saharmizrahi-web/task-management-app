import { q } from "./db";
import type { AppData, Priority, Space, Status, Task, ViewType } from "./types";
import { PRIORITIES, STATUSES, DEFAULT_PRIORITY, DEFAULT_STATUS } from "./constants";

const TASK_COLS = `id, space_id, title, description, priority, status, due_date, completed_at, position, created_at`;
const SPACE_COLS = `id, name, color, view, position`;

const isPriority = (v: unknown): v is Priority => PRIORITIES.includes(v as Priority);
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
const isView = (v: unknown): v is ViewType => v === "kanban" || v === "todo" || v === "calendar";
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function loadAll(): Promise<AppData> {
  const [spaces, tasks, settings] = await Promise.all([
    q<Space>(`SELECT ${SPACE_COLS} FROM ms_spaces ORDER BY position, id`),
    q<Task>(`SELECT ${TASK_COLS} FROM ms_tasks ORDER BY position, id`),
    q<{ value: number[] | null }>(`SELECT value FROM ms_settings WHERE key = 'dashboard_spaces'`),
  ]);
  return {
    spaces,
    tasks: tasks.map(normalizeTask),
    dashboardSpaceIds: settings[0] ? settings[0].value : null,
  };
}

function normalizeTask(t: Task): Task {
  return {
    ...t,
    completed_at: t.completed_at ? new Date(t.completed_at).toISOString() : null,
    created_at: new Date(t.created_at).toISOString(),
  };
}

/* ---------------- spaces ---------------- */

export async function createSpace(input: { name?: string; color?: string; view?: string }): Promise<Space> {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("שם המרחב חסר");
  const view: ViewType = isView(input.view) ? input.view : "kanban";
  const color = input.color && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : "#4f46e5";
  const [row] = await q<Space>(
    `INSERT INTO ms_spaces (name, color, view, position)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) FROM ms_spaces), 0) + 1000)
     RETURNING ${SPACE_COLS}`,
    [name.slice(0, 60), color, view],
  );
  return row;
}

export async function updateSpace(id: number, input: { name?: string; color?: string; view?: string }): Promise<Space | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof input.name === "string" && input.name.trim()) {
    vals.push(input.name.trim().slice(0, 60));
    sets.push(`name = $${vals.length}`);
  }
  if (input.color && /^#[0-9a-fA-F]{6}$/.test(input.color)) {
    vals.push(input.color);
    sets.push(`color = $${vals.length}`);
  }
  if (isView(input.view)) {
    vals.push(input.view);
    sets.push(`view = $${vals.length}`);
  }
  if (!sets.length) {
    const [row] = await q<Space>(`SELECT ${SPACE_COLS} FROM ms_spaces WHERE id = $1`, [id]);
    return row ?? null;
  }
  vals.push(id);
  const [row] = await q<Space>(`UPDATE ms_spaces SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING ${SPACE_COLS}`, vals);
  return row ?? null;
}

export async function deleteSpace(id: number): Promise<void> {
  await q(`DELETE FROM ms_spaces WHERE id = $1`, [id]);
  const s = await q<{ value: number[] | null }>(`SELECT value FROM ms_settings WHERE key = 'dashboard_spaces'`);
  if (s[0] && Array.isArray(s[0].value)) {
    await setDashboardSpaces(s[0].value.filter((x) => x !== id));
  }
}

export async function setDashboardSpaces(ids: number[] | null): Promise<void> {
  if (ids === null) {
    await q(`DELETE FROM ms_settings WHERE key = 'dashboard_spaces'`);
    return;
  }
  await q(
    `INSERT INTO ms_settings (key, value) VALUES ('dashboard_spaces', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(ids)],
  );
}

/* ---------------- tasks ---------------- */

export interface TaskInput {
  space_id?: number;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string | null;
  position?: number;
}

async function endPosition(spaceId: number, status: Status): Promise<number> {
  const [r] = await q<{ m: number | null }>(
    `SELECT MAX(position) AS m FROM ms_tasks WHERE space_id = $1 AND status = $2`,
    [spaceId, status],
  );
  return (r?.m ?? 0) + 1000;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const title = (input.title ?? "").trim();
  if (!title) throw new Error("כותרת המשימה חסרה");
  if (!input.space_id) throw new Error("מרחב חסר");
  const priority = isPriority(input.priority) ? input.priority : DEFAULT_PRIORITY;
  const status = isStatus(input.status) ? input.status : DEFAULT_STATUS;
  const due = input.due_date && isDate(input.due_date) ? input.due_date : null;
  const position = typeof input.position === "number" ? input.position : await endPosition(input.space_id, status);
  const [row] = await q<Task>(
    `INSERT INTO ms_tasks (space_id, title, description, priority, status, due_date, completed_at, position)
     VALUES ($1, $2, $3, $4, $5, $6, ${status === "done" ? "now()" : "NULL"}, $7)
     RETURNING ${TASK_COLS}`,
    [input.space_id, title.slice(0, 300), (input.description ?? "").slice(0, 5000), priority, status, due, position],
  );
  return normalizeTask(row);
}

export async function updateTask(id: number, input: TaskInput): Promise<Task | null> {
  const [cur] = await q<Task>(`SELECT ${TASK_COLS} FROM ms_tasks WHERE id = $1`, [id]);
  if (!cur) return null;
  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (typeof input.title === "string" && input.title.trim()) add("title", input.title.trim().slice(0, 300));
  if (typeof input.description === "string") add("description", input.description.slice(0, 5000));
  if (isPriority(input.priority)) add("priority", input.priority);
  if (input.due_date === null) add("due_date", null);
  else if (isDate(input.due_date)) add("due_date", input.due_date);

  const targetSpace = typeof input.space_id === "number" ? input.space_id : cur.space_id;
  const spaceChanged = targetSpace !== cur.space_id;
  if (spaceChanged) add("space_id", targetSpace);

  const targetStatus: Status = isStatus(input.status) ? input.status : cur.status;
  const statusChanged = targetStatus !== cur.status;
  if (statusChanged) {
    add("status", targetStatus);
    sets.push(targetStatus === "done" ? "completed_at = now()" : "completed_at = NULL");
  }
  if (typeof input.position === "number") add("position", input.position);
  else if (statusChanged || spaceChanged) add("position", await endPosition(targetSpace, targetStatus));

  vals.push(id);
  const [row] = await q<Task>(`UPDATE ms_tasks SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING ${TASK_COLS}`, vals);
  return row ? normalizeTask(row) : null;
}

export async function deleteTask(id: number): Promise<void> {
  await q(`DELETE FROM ms_tasks WHERE id = $1`, [id]);
}

export async function deleteTasks(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await q(`DELETE FROM ms_tasks WHERE id = ANY($1::int[]) RETURNING id`, [ids]);
  return rows.length;
}
