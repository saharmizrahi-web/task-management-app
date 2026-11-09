"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays, CalendarRange, Check, Flame, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { DueChip, PriorityChip, SpaceDot, isOverdue } from "./ui";
import { PRIORITY_META } from "@/lib/constants";
import { addDays, fmtDate, weekStart, weekdayLong, parseDate, MONTHS } from "@/lib/date";
import type { Space, Task } from "@/lib/types";

export function Dashboard() {
  const { spaces, tasks, today, dashboardSpaceIds, setDashboardSpaces, openTask, openSpace } = useData();

  const selected = dashboardSpaceIds === null ? spaces.map((s) => s.id) : dashboardSpaceIds.filter((id) => spaces.some((s) => s.id === id));
  const selSet = new Set(selected);
  const shownSpaces = spaces.filter((s) => selSet.has(s.id));
  const scoped = tasks.filter((t) => selSet.has(t.space_id));
  const open = scoped.filter((t) => t.status !== "done");

  const rank = (t: Task) => PRIORITY_META[t.priority].rank;
  const byUrgency = (a: Task, b: Task) => rank(a) - rank(b) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const urgent = open.filter((t) => t.priority === "urgent").sort(byUrgency);
  const dueToday = open.filter((t) => t.due_date === today).sort(byUrgency);
  const overdue = open.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  // Week and month don't repeat each other or "today": the week runs from tomorrow
  // to Saturday, the month from the day after that week to the end of the month.
  const d = parseDate(today);
  const weekEnd = addDays(weekStart(today), 6);
  const monthEnd = fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  const byDate = (a: Task, b: Task) => a.due_date!.localeCompare(b.due_date!) || rank(a) - rank(b);
  const dueBetween = (after: string, until: string) =>
    open.filter((t) => t.due_date && t.due_date > after && t.due_date <= until).sort(byDate);
  const thisWeek = dueBetween(today, weekEnd);
  const thisMonth = dueBetween(weekEnd, monthEnd);
  const monthEndText = `עד ${parseDate(monthEnd).getUTCDate()} ב${MONTHS[d.getUTCMonth()]}`;

  function toggle(id: number) {
    const next = selSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setDashboardSpaces(next.length === spaces.length ? null : next);
  }

  const dateText =`יום ${weekdayLong(today)}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]}`;

  if (spaces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">ברוכים הבאים</h1>
        <p className="max-w-sm text-muted">מתחילים ביצירת המרחב הראשון שלך, למשל בית, עבודה או לימודים.</p>
        <button className="btn-primary" onClick={() => openSpace({ mode: "new" })}>
          <Plus size={16} /> יצירת מרחב
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <p className="text-sm text-muted">{dateText}</p>
        <h1 className="text-2xl font-bold sm:text-3xl">הדשבורד שלי</h1>
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-2">
        <span className="ml-1 text-sm font-medium text-muted">מציג מרחבים:</span>
        {spaces.map((s) => {
          const on = selSet.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition"
              style={on ? { background: s.color + "16", borderColor: s.color, color: s.color } : { background: "#fff", borderColor: "#e6e8ef", color: "#94a3b8" }}
            >
              {on ? <Check size={14} /> : <SpaceDot color="#cbd5e1" size={8} />}
              {s.name}
            </button>
          );
        })}
      </div>

      {shownSpaces.length === 0 ? (
        <div className="card py-16 text-center text-muted">בחר לפחות מרחב אחד כדי לראות משימות</div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <Section title="דחוף" icon={<Flame size={18} />} tone="#dc2626" tasks={urgent} spaces={spaces} today={today} empty="אין משימות דחופות" />
            <Section title="להיום" icon={<CalendarClock size={18} />} tone="#d97706" tasks={dueToday} spaces={spaces} today={today} empty="אין משימות להיום" />
            <Section title="באיחור" icon={<AlertTriangle size={18} />} tone="#e11d48" tasks={overdue} spaces={spaces} today={today} empty="אין משימות באיחור" />
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <Section title="השבוע" hint="מחר עד שבת" icon={<CalendarRange size={18} />} tone="#4f46e5" tasks={thisWeek} spaces={spaces} today={today} empty="אין משימות בהמשך השבוע" />
            <Section title="החודש" hint={`אחרי השבוע, ${monthEndText}`} icon={<CalendarDays size={18} />} tone="#0d9488" tasks={thisMonth} spaces={spaces} today={today} empty="אין משימות בהמשך החודש" />
          </div>

          <h2 className="mb-3 text-base font-bold">המרחבים</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shownSpaces.map((s) => (
              <SpaceCard key={s.id} space={s} tasks={tasks.filter((t) => t.space_id === s.id)} today={today} />
            ))}
          </div>
        </>
      )}
    </div>
  );

  function Section({ title, hint, icon, tone, tasks: list, spaces: all, today: td, empty }: { title: string; hint?: string; icon: React.ReactNode; tone: string; tasks: Task[]; spaces: Space[]; today: string; empty: string }) {
    return (
      <section className="card flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3" style={{ color: tone }}>
          {icon}
          <h2 className="text-sm font-bold">{title}</h2>
          {hint && <span className="text-xs text-muted">{hint}</span>}
          <span className="mr-auto rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: tone + "15" }}>{list.length}</span>
        </header>
        <ul className="max-h-80 flex-1 divide-y divide-line overflow-y-auto">
          {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{empty}</li>}
          {list.map((t) => {
            const sp = all.find((s) => s.id === t.space_id);
            return (
              <li key={t.id}>
                <button onClick={() => openTask({ mode: "edit", id: t.id })} className="flex w-full flex-col gap-1.5 px-4 py-3 text-right transition hover:bg-slate-50">
                  <span className="text-sm font-medium leading-snug">{t.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {sp && (
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <SpaceDot color={sp.color} size={8} /> {sp.name}
                      </span>
                    )}
                    <PriorityChip priority={t.priority} />
                    <DueChip task={t} today={td} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}

function SpaceCard({ space, tasks, today }: { space: Space; tasks: Task[]; today: string }) {
  const open = tasks.filter((t) => t.status !== "done").length;
  const late = tasks.filter((t) => isOverdue(t, today)).length;
  const ws = weekStart(today);
  const closed = tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) >= ws).length;
  return (
    <Link href={`/space/${space.id}`} className="card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: space.color }} />
      <div className="mb-4 flex items-center gap-2.5">
        <SpaceDot color={space.color} size={12} />
        <h3 className="text-base font-bold">{space.name}</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={open} label="פתוחות" />
        <Stat value={late} label="באיחור" danger={late > 0} />
        <Stat value={closed} label="נסגרו השבוע" good={closed > 0} />
      </div>
    </Link>
  );
}

function Stat({ value, label, danger, good }: { value: number; label: string; danger?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3">
      <div className={`text-2xl font-bold ${danger ? "text-red-600" : good ? "text-green-600" : ""}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}
