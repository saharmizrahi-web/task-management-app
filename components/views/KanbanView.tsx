"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useData } from "../DataProvider";
import { DueChip, PriorityChip } from "../ui";
import { STATUSES, STATUS_META } from "@/lib/constants";
import type { Space, Status, Task } from "@/lib/types";

export function KanbanView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { patchTask, openTask, today } = useData();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const byStatus = (s: Status) => tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  function onStart(e: DragStartEvent) {
    setActiveId(Number(String(e.active.id).replace("task:", "")));
  }
  function onOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function onEnd(e: DragEndEvent) {
    setActiveId(null);
    setOverId(null);
    const dragged = tasks.find((t) => t.id === Number(String(e.active.id).replace("task:", "")));
    if (!dragged || !e.over) return;
    const over = String(e.over.id);

    let status: Status;
    let position: number;

    if (over.startsWith("col:")) {
      status = over.slice(4) as Status;
      const col = byStatus(status).filter((t) => t.id !== dragged.id);
      position = (col[col.length - 1]?.position ?? 0) + 1000;
    } else {
      const target = tasks.find((t) => t.id === Number(over.replace("task:", "")));
      if (!target || target.id === dragged.id) return;
      status = target.status;
      const col = byStatus(status).filter((t) => t.id !== dragged.id);
      const idx = col.findIndex((t) => t.id === target.id);
      const sameColDown = dragged.status === status && byStatus(status).findIndex((t) => t.id === dragged.id) < byStatus(status).findIndex((t) => t.id === target.id);
      if (sameColDown) {
        const next = col[idx + 1];
        position = next ? (target.position + next.position) / 2 : target.position + 1000;
      } else {
        const prev = col[idx - 1];
        position = prev ? (prev.position + target.position) / 2 : target.position - 1000;
      }
    }

    if (status === dragged.status && position === dragged.position) return;
    patchTask(dragged.id, { status, position });
  }

  return (
    <DndContext id="kanban-dnd" sensors={sensors} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActiveId(null); setOverId(null); }}>
      <div className="grid h-full min-h-[480px] grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={byStatus(s)}
            overId={overId}
            activeId={activeId}
            today={today}
            color={space.color}
            onOpen={(id) => openTask({ mode: "edit", id })}
            onAdd={() => openTask({ mode: "new", space_id: space.id, status: s })}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>{active ? <CardBody task={active} today={today} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status, tasks, overId, activeId, today, color, onOpen, onAdd,
}: {
  status: Status; tasks: Task[]; overId: string | null; activeId: number | null; today: string; color: string;
  onOpen: (id: number) => void; onAdd: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${status}` });
  const m = STATUS_META[status];
  const overCol = overId === `col:${status}` || (overId?.startsWith("task:") && tasks.some((t) => `task:${t.id}` === overId));
  return (
    <section
      ref={setNodeRef}
      className="flex min-h-0 flex-col rounded-2xl p-2.5 transition"
      style={{ background: overCol && activeId ? m.bg : "#eceef4", outline: overCol && activeId ? `2px dashed ${m.color}55` : "none" }}
    >
      <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
        <h3 className="text-sm font-bold">{m.columnLabel}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted">{tasks.length}</span>
        <button onClick={onAdd} className="mr-auto rounded-lg p-1 text-muted transition hover:bg-white hover:text-ink" aria-label="משימה חדשה בעמודה" title="משימה חדשה בעמודה">
          <Plus size={16} />
        </button>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} today={today} hidden={t.id === activeId} highlight={overId === `task:${t.id}` && activeId !== t.id} color={color} onOpen={() => onOpen(t.id)} />
        ))}
        {tasks.length === 0 && <p className="py-6 text-center text-xs text-muted">גרור לכאן משימה</p>}
      </div>
    </section>
  );
}

function DraggableCard({ task, today, hidden, highlight, color, onOpen }: { task: Task; today: string; hidden: boolean; highlight: boolean; color: string; onOpen: () => void }) {
  const drag = useDraggable({ id: `task:${task.id}` });
  const drop = useDroppable({ id: `task:${task.id}` });
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      onClick={onOpen}
      className={`touch-manipulation transition ${hidden ? "opacity-30" : ""}`}
      style={highlight ? { boxShadow: `0 -3px 0 0 ${color}` } : undefined}
    >
      <CardBody task={task} today={today} />
    </div>
  );
}

function CardBody({ task, today, overlay }: { task: Task; today: string; overlay?: boolean }) {
  const done = task.status === "done";
  return (
    <div className={`card cursor-grab select-none p-3.5 transition hover:shadow-md active:cursor-grabbing ${overlay ? "rotate-2 shadow-xl" : ""}`}>
      <p className={`mb-2 text-sm font-medium leading-snug ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
      {task.description && <p className="mb-2 line-clamp-2 text-xs text-muted">{task.description}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={task.priority} />
        {!done && <DueChip task={task} today={today} />}
      </div>
    </div>
  );
}
