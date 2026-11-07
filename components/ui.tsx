"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { Priority, Status, Task } from "@/lib/types";
import { PRIORITY_META, STATUS_META } from "@/lib/constants";
import { dueLabel } from "@/lib/date";

export function PriorityChip({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="chip" style={{ color: m.color, background: m.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="chip" style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  );
}

export function SpaceDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />;
}

export function isOverdue(t: Pick<Task, "due_date" | "status">, today: string) {
  return t.status !== "done" && !!t.due_date && t.due_date < today;
}

export function DueChip({ task, today }: { task: Task; today: string }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task, today);
  const isToday = task.due_date === today && task.status !== "done";
  const cls = overdue ? "bg-red-50 text-red-600" : isToday ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return <span className={`chip ${cls}`}>{dueLabel(task.due_date, today)}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`anim-pop card flex max-h-[92vh] w-full ${width} flex-col rounded-b-none shadow-2xl sm:rounded-b-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-muted hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
