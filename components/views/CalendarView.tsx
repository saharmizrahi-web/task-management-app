"use client";

import { useMemo, useState } from "react";
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
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useData } from "../DataProvider";
import { Modal } from "../ui";
import { useHolidays } from "../useHolidays";
import { HOLIDAY_META, PRIORITY_META } from "@/lib/constants";
import { MONTHS, WEEKDAYS_SHORT, addDays, fmtDate, parseDate, weekStart, weekdayLong } from "@/lib/date";
import type { Holiday, Space, Task } from "@/lib/types";

const MAX_CHIPS = 3;

// Pastel backgrounds for Friday/Saturday and for chag / chol hamoed (vacation wins when both apply).
const DAY_TONE = {
  plain: { in: "bg-white hover:bg-slate-50", out: "bg-slate-50/60", swatch: "" },
  weekend: { in: "bg-[#eef1fb] hover:bg-[#e6eaf8]", out: "bg-[#eef1fb]/50", swatch: "bg-[#eef1fb]" },
  vacation: { in: "bg-[#fdeedd] hover:bg-[#fbe5cc]", out: "bg-[#fdeedd]/50", swatch: "bg-[#fdeedd]" },
};

export function CalendarView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, openTask, patchTask } = useData();
  const holidays = useHolidays();
  const t0 = parseDate(today);
  const [ym, setYm] = useState({ y: t0.getUTCFullYear(), m: t0.getUTCMonth() });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dayList, setDayList] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const cells = useMemo(() => {
    const first = fmtDate(new Date(Date.UTC(ym.y, ym.m, 1)));
    const last = fmtDate(new Date(Date.UTC(ym.y, ym.m + 1, 0)));
    const start = weekStart(first);
    const out: string[] = [];
    let d = start;
    while (d <= last || out.length % 7 !== 0) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [ym]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (!map.has(t.due_date)) map.set(t.due_date, []);
      map.get(t.due_date)!.push(t);
    }
    const rank = (t: Task) => (t.status === "done" ? 9 : PRIORITY_META[t.priority].rank);
    for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    return map;
  }, [tasks]);

  const undated = tasks.filter((t) => !t.due_date && t.status !== "done");
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  const go = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  function onEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const id = Number(String(e.active.id).replace("task:", ""));
    const day = String(e.over.id).replace("day:", "");
    const t = tasks.find((x) => x.id === id);
    if (t && t.due_date !== day) patchTask(id, { due_date: day });
  }

  const thisMonth = ym.y === t0.getUTCFullYear() && ym.m === t0.getUTCMonth();

  return (
    <DndContext id="calendar-dnd" sensors={sensors} onDragStart={(e) => setActiveId(Number(String(e.active.id).replace("task:", "")))} onDragEnd={onEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex h-full min-h-[560px] flex-col p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">
            {MONTHS[ym.m]} <span className="font-medium text-muted">{ym.y}</span>
          </h2>
          <div className="mr-2 flex items-center gap-1">
            <button className="rounded-full p-2 text-slate-600 hover:bg-slate-200/70" onClick={() => go(-1)} aria-label="חודש קודם">
              <ChevronRight size={20} />
            </button>
            <button className="rounded-full p-2 text-slate-600 hover:bg-slate-200/70" onClick={() => go(1)} aria-label="חודש הבא">
              <ChevronLeft size={20} />
            </button>
          </div>
          <button className="btn-ghost !py-1.5" disabled={thisMonth} onClick={() => setYm({ y: t0.getUTCFullYear(), m: t0.getUTCMonth() })}>
            היום
          </button>
          <button className="btn-ghost mr-auto !py-1.5" onClick={() => openTask({ mode: "new", space_id: space.id, due_date: today })}>
            <Plus size={16} /> משימה חדשה
          </button>
        </div>

        <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-slate-50/70">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="py-2.5 text-center text-xs font-bold text-muted">
                {w}
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(104px, 1fr))` }}>
            {cells.map((day, i) => (
              <DayCell
                key={day}
                day={day}
                inMonth={parseDate(day).getUTCMonth() === ym.m}
                isToday={day === today}
                lastRow={i >= cells.length - 7}
                lastCol={i % 7 === 6}
                tasks={byDay.get(day) ?? []}
                holidays={holidays.get(day) ?? []}
                color={space.color}
                dragging={activeId !== null}
                onCreate={() => openTask({ mode: "new", space_id: space.id, due_date: day })}
                onOpen={(id) => openTask({ mode: "edit", id })}
                onMore={() => setDayList(day)}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border border-line ${DAY_TONE.weekend.swatch}`} /> שישי ושבת
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border border-line ${DAY_TONE.vacation.swatch}`} /> חג וחול המועד
          </span>
          <a href="https://www.hebcal.com" target="_blank" rel="noreferrer" className="mr-auto hover:underline">
            חגים: Hebcal.com
          </a>
        </div>

        {undated.length > 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-3">
            <p className="mb-2 text-xs font-bold text-muted">ללא תאריך יעד ({undated.length}). גרור ללוח כדי לקבוע תאריך</p>
            <div className="flex flex-wrap gap-2">
              {undated.map((t) => (
                <Chip key={t.id} task={t} onOpen={() => openTask({ mode: "edit", id: t.id })} hidden={t.id === activeId} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <ChipFace task={active} overlay /> : null}</DragOverlay>

      {dayList && (
        <Modal
          title={`יום ${weekdayLong(dayList)}, ${parseDate(dayList).getUTCDate()} ב${MONTHS[parseDate(dayList).getUTCMonth()]}`}
          onClose={() => setDayList(null)}
          width="max-w-sm"
          footer={
            <button
              className="btn-primary w-full"
              onClick={() => {
                const d = dayList;
                setDayList(null);
                openTask({ mode: "new", space_id: space.id, due_date: d });
              }}
            >
              <Plus size={16} /> משימה חדשה ליום הזה
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            {(holidays.get(dayList) ?? []).length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {holidays.get(dayList)!.map((h) => (
                  <span key={h.title} className="text-xs font-bold" style={{ color: HOLIDAY_META[h.kind].color }}>
                    {h.title}
                  </span>
                ))}
              </div>
            )}
            {(byDay.get(dayList) ?? []).map((t) => (
              <ChipFace
                key={t.id}
                task={t}
                wide
                onClick={() => {
                  setDayList(null);
                  openTask({ mode: "edit", id: t.id });
                }}
              />
            ))}
          </div>
        </Modal>
      )}
    </DndContext>
  );
}

function DayCell({
  day, inMonth, isToday, lastRow, lastCol, tasks, holidays, color, dragging, onCreate, onOpen, onMore,
}: {
  day: string; inMonth: boolean; isToday: boolean; lastRow: boolean; lastCol: boolean; tasks: Task[]; holidays: Holiday[]; color: string; dragging: boolean;
  onCreate: () => void; onOpen: (id: number) => void; onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const date = parseDate(day);
  const num = date.getUTCDate();
  const label = num === 1 ? `${num} ב${MONTHS[date.getUTCMonth()]}` : String(num);
  const shown = tasks.slice(0, MAX_CHIPS);
  const extra = tasks.length - shown.length;
  const weekday = date.getUTCDay();
  const tone = holidays.some((h) => HOLIDAY_META[h.kind].dayOff) ? "vacation" : weekday === 5 || weekday === 6 ? "weekend" : "plain";
  return (
    <div
      ref={setNodeRef}
      onClick={onCreate}
      className={`group relative flex min-w-0 cursor-pointer flex-col gap-1 overflow-hidden p-1.5 transition ${lastRow ? "" : "border-b"} ${lastCol ? "" : "border-l"} border-line ${
        DAY_TONE[tone][inMonth ? "in" : "out"]
      }`}
      style={isOver && dragging ? { background: color + "18", boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-medium ${!inMonth ? "text-slate-400" : ""} ${isToday ? "font-bold text-white" : ""}`}
          style={isToday ? { background: color } : undefined}
        >
          {label}
        </span>
        <Plus size={14} className="text-slate-300 opacity-0 transition group-hover:opacity-100" />
      </div>
      {holidays.length > 0 && (
        <div className={`-mt-1 flex min-w-0 flex-col px-1 ${inMonth ? "" : "opacity-50"}`} title={holidays.map((h) => h.title).join(" · ")}>
          {holidays.slice(0, 2).map((h) => (
            <span key={h.title} className="truncate text-[11px] font-semibold leading-4" style={{ color: HOLIDAY_META[h.kind].color }}>
              {h.title}
            </span>
          ))}
        </div>
      )}
      {shown.map((t) => (
        <Chip key={t.id} task={t} onOpen={() => onOpen(t.id)} />
      ))}
      {extra > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          className="rounded-md px-1.5 py-0.5 text-right text-[11px] font-bold text-slate-600 hover:bg-slate-100"
        >
          עוד {extra}
        </button>
      )}
    </div>
  );
}

function Chip({ task, onOpen, hidden }: { task: Task; onOpen: () => void; hidden?: boolean }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `task:${task.id}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`touch-manipulation ${hidden ? "opacity-30" : ""}`}
    >
      <ChipFace task={task} />
    </div>
  );
}

function ChipFace({ task, overlay, wide, onClick }: { task: Task; overlay?: boolean; wide?: boolean; onClick?: () => void }) {
  const done = task.status === "done";
  const m = PRIORITY_META[task.priority];
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 truncate rounded-md px-2 text-[12px] font-medium leading-6 transition hover:brightness-95 ${wide ? "py-1.5" : ""} ${overlay ? "shadow-lg" : ""}`}
      style={done ? { background: "#f1f5f9", color: "#94a3b8", textDecoration: "line-through" } : { background: m.color, color: "#fff" }}
      title={task.title}
    >
      <span className="truncate">{task.title}</span>
    </div>
  );
}
