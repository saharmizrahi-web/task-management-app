"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Priority, Space, Status, Task, ViewType } from "@/lib/types";
import { todayStr } from "@/lib/date";

export interface TaskPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  due_date?: string | null;
  space_id?: number;
  position?: number;
}

export type TaskModalState = { mode: "edit"; id: number } | { mode: "new"; space_id?: number; due_date?: string | null; status?: Status } | null;
export type SpaceModalState = { mode: "new" } | { mode: "edit"; id: number } | null;

interface Ctx {
  spaces: Space[];
  tasks: Task[];
  dashboardSpaceIds: number[] | null;
  today: string;
  loaded: boolean;
  refresh: () => Promise<void>;
  addTask: (input: TaskPatch & { space_id: number; title: string }) => Promise<Task | null>;
  patchTask: (id: number, patch: TaskPatch) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  addSpace: (input: { name: string; color: string; view: ViewType }) => Promise<Space | null>;
  patchSpace: (id: number, patch: Partial<Pick<Space, "name" | "color" | "view">>) => Promise<void>;
  removeSpace: (id: number) => Promise<void>;
  setDashboardSpaces: (ids: number[] | null) => Promise<void>;
  taskModal: TaskModalState;
  openTask: (s: TaskModalState) => void;
  spaceModal: SpaceModalState;
  openSpace: (s: SpaceModalState) => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside provider");
  return c;
}

async function api<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "שגיאה");
  return json as T;
}

export function DataProvider({ initial, children }: { initial: AppData; children: React.ReactNode }) {
  const [spaces, setSpaces] = useState<Space[]>(initial.spaces);
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [dash, setDash] = useState<number[] | null>(initial.dashboardSpaceIds);
  const [today, setToday] = useState(() => todayStr());
  const [taskModal, openTask] = useState<TaskModalState>(null);
  const [spaceModal, openSpace] = useState<SpaceModalState>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    const t = setInterval(() => setToday(todayStr()), 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const d = await api<AppData>("/api/data", "GET");
    setSpaces(d.spaces);
    setTasks(d.tasks);
    setDash(d.dashboardSpaceIds);
  }, []);

  const addTask: Ctx["addTask"] = useCallback(async (input) => {
    try {
      const t = await api<Task>("/api/tasks", "POST", input);
      setTasks((prev) => [...prev, t]);
      return t;
    } catch (e) {
      alert(e instanceof Error ? e.message : "שגיאה ביצירת משימה");
      return null;
    }
  }, []);

  const patchTask: Ctx["patchTask"] = useCallback(
    async (id, patch) => {
      // optimistic update
      setTasks((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        const next: Task = { ...cur, ...patch } as Task;
        if (patch.status && patch.status !== cur.status) {
          next.completed_at = patch.status === "done" ? new Date().toISOString() : null;
          if (patch.position === undefined) {
            const col = prev.filter((t) => t.space_id === next.space_id && t.status === patch.status);
            next.position = col.reduce((m, t) => Math.max(m, t.position), 0) + 1000;
          }
        }
        return prev.map((t) => (t.id === id ? next : t));
      });
      try {
        const row = await api<Task>(`/api/tasks/${id}`, "PATCH", patch);
        setTasks((prev) => prev.map((t) => (t.id === id ? row : t)));
      } catch (e) {
        await refresh().catch(() => {});
        alert(e instanceof Error ? e.message : "שגיאה בעדכון");
      }
    },
    [refresh],
  );

  const removeTask: Ctx["removeTask"] = useCallback(
    async (id) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await api(`/api/tasks/${id}`, "DELETE");
      } catch {
        await refresh().catch(() => {});
      }
    },
    [refresh],
  );

  const addSpace: Ctx["addSpace"] = useCallback(async (input) => {
    try {
      const s = await api<Space>("/api/spaces", "POST", input);
      setSpaces((prev) => [...prev, s]);
      return s;
    } catch (e) {
      alert(e instanceof Error ? e.message : "שגיאה ביצירת מרחב");
      return null;
    }
  }, []);

  const patchSpace: Ctx["patchSpace"] = useCallback(
    async (id, patch) => {
      setSpaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      try {
        const row = await api<Space>(`/api/spaces/${id}`, "PATCH", patch);
        setSpaces((prev) => prev.map((s) => (s.id === id ? row : s)));
      } catch {
        await refresh().catch(() => {});
      }
    },
    [refresh],
  );

  const removeSpace: Ctx["removeSpace"] = useCallback(
    async (id) => {
      setSpaces((prev) => prev.filter((s) => s.id !== id));
      setTasks((prev) => prev.filter((t) => t.space_id !== id));
      setDash((prev) => (prev ? prev.filter((x) => x !== id) : prev));
      try {
        await api(`/api/spaces/${id}`, "DELETE");
      } catch {
        await refresh().catch(() => {});
      }
    },
    [refresh],
  );

  const setDashboardSpaces: Ctx["setDashboardSpaces"] = useCallback(async (ids) => {
    setDash(ids);
    try {
      await api("/api/settings", "PUT", { dashboardSpaceIds: ids });
    } catch {
      /* keep local choice */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      spaces, tasks, dashboardSpaceIds: dash, today, loaded: true,
      refresh, addTask, patchTask, removeTask, addSpace, patchSpace, removeSpace, setDashboardSpaces,
      taskModal, openTask, spaceModal, openSpace,
    }),
    [spaces, tasks, dash, today, refresh, addTask, patchTask, removeTask, addSpace, patchSpace, removeSpace, setDashboardSpaces, taskModal, spaceModal],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
