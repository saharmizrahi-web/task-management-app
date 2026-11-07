"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useData } from "../DataProvider";
import { DueChip, PriorityChip } from "../ui";
import { PRIORITY_META } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";

function sortTasks(a: Task, b: Task) {
  return (
    PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    a.position - b.position
  );
}

export function TodoView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { patchTask, openTask, addTask, today } = useData();
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState("");

  const open = tasks.filter((t) => t.status !== "done").sort(sortTasks);
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    await addTask({ space_id: space.id, title });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <form onSubmit={quickAdd} className="card mb-5 flex items-center gap-2 p-2 pr-4 focus-within:ring-4 focus-within:ring-indigo-100">
        <Plus size={18} className="text-muted" />
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="הוספה מהירה: כתוב משימה ולחץ Enter"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
        <button className="btn-ghost !py-1.5" type="button" onClick={() => openTask({ mode: "new", space_id: space.id })}>
          עם פרטים
        </button>
      </form>

      {open.length === 0 && (
        <div className="card flex flex-col items-center gap-1 py-14 text-center">
          <p className="font-bold">אין משימות פתוחות</p>
          <p className="text-sm text-muted">כל הכבוד, או שאפשר להוסיף משימה חדשה למעלה</p>
        </div>
      )}

      <ul className="space-y-2">
        {open.map((t) => (
          <TodoRow key={t.id} task={t} today={today} color={space.color} onToggle={() => patchTask(t.id, { status: "done" })} onOpen={() => openTask({ mode: "edit", id: t.id })} />
        ))}
      </ul>

      {done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((v) => !v)} className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <ChevronDown size={16} className={`transition ${showDone ? "" : "-rotate-90"}`} />
            הושלמו ({done.length})
          </button>
          {showDone && (
            <ul className="anim-fade space-y-2">
              {done.map((t) => (
                <TodoRow key={t.id} task={t} today={today} color={space.color} onToggle={() => patchTask(t.id, { status: "new" })} onOpen={() => openTask({ mode: "edit", id: t.id })} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({ task, today, color, onToggle, onOpen }: { task: Task; today: string; color: string; onToggle: () => void; onOpen: () => void }) {
  const isDone = task.status === "done";
  const pm = PRIORITY_META[task.priority];
  return (
    <li
      className="card group flex cursor-pointer items-center gap-3 border-r-4 px-4 py-3 transition hover:shadow-md"
      style={{ borderRightColor: isDone ? "#e2e8f0" : pm.color }}
      onClick={onOpen}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isDone ? "החזר למשימה פתוחה" : "סמן כהושלמה"}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition hover:scale-110"
        style={isDone ? { background: "#16a34a", borderColor: "#16a34a" } : { borderColor: color }}
      >
        {isDone && <Check size={14} className="text-white" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${isDone ? "text-muted line-through" : ""}`}>{task.title}</p>
        {task.description && !isDone && <p className="truncate text-xs text-muted">{task.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isDone && <DueChip task={task} today={today} />}
        {!isDone && <PriorityChip priority={task.priority} />}
      </div>
    </li>
  );
}
