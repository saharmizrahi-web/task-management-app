"use client";

import Link from "next/link";
import { CalendarDays, Columns3, ListChecks, Pencil, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { KanbanView } from "./views/KanbanView";
import { TodoView } from "./views/TodoView";
import { CalendarView } from "./views/CalendarView";
import { VIEW_META } from "@/lib/constants";
import type { ViewType } from "@/lib/types";

const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  kanban: <Columns3 size={16} />,
  todo: <ListChecks size={16} />,
  calendar: <CalendarDays size={16} />,
};

export function SpacePage({ spaceId }: { spaceId: number }) {
  const { spaces, tasks, patchSpace, openTask, openSpace } = useData();
  const space = spaces.find((s) => s.id === spaceId);

  if (!space) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-bold">המרחב לא נמצא</p>
        <Link href="/" className="btn-primary">חזרה לדשבורד</Link>
      </div>
    );
  }

  const spaceTasks = tasks.filter((t) => t.space_id === space.id);
  const open = spaceTasks.filter((t) => t.status !== "done").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-4 sm:px-8">
        <span className="h-4 w-4 rounded-full" style={{ background: space.color }} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight">{space.name}</h1>
          <p className="text-xs text-muted">{open} משימות פתוחות, {spaceTasks.length - open} הושלמו</p>
        </div>
        <button onClick={() => openSpace({ mode: "edit", id: space.id })} className="rounded-lg p-2 text-muted hover:bg-slate-100" aria-label="עריכת מרחב" title="עריכת מרחב">
          <Pencil size={16} />
        </button>

        <div className="mr-auto flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="תצוגה">
            {(Object.keys(VIEW_META) as ViewType[]).map((v) => {
              const on = space.view === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={on}
                  onClick={() => patchSpace(space.id, { view: v })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-white shadow-sm" : "text-muted hover:text-ink"}`}
                  style={on ? { color: space.color } : undefined}
                >
                  {VIEW_ICONS[v]}
                  <span className="hidden sm:inline">{VIEW_META[v].label}</span>
                </button>
              );
            })}
          </div>
          <button className="btn-primary" style={{ background: space.color }} onClick={() => openTask({ mode: "new", space_id: space.id })}>
            <Plus size={16} /> משימה חדשה
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {space.view === "kanban" && <KanbanView space={space} tasks={spaceTasks} />}
        {space.view === "todo" && <TodoView space={space} tasks={spaceTasks} />}
        {space.view === "calendar" && <CalendarView space={space} tasks={spaceTasks} />}
      </div>
    </div>
  );
}
