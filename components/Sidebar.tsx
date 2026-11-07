"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCheck, Columns3, LayoutDashboard, ListChecks, Plus, X } from "lucide-react";
import { useData } from "./DataProvider";
import type { ViewType } from "@/lib/types";
import { isOverdue } from "./ui";

const VIEW_ICON: Record<ViewType, React.ReactNode> = {
  kanban: <Columns3 size={14} />,
  todo: <ListChecks size={14} />,
  calendar: <CalendarDays size={14} />,
};

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaces, tasks, today, openSpace } = useData();
  const pathname = usePathname();

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-line bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <CheckCheck size={20} />
            </div>
            <span className="text-lg font-bold">המשימות שלי</span>
          </div>
          <button className="rounded-lg p-1.5 text-muted hover:bg-slate-100 lg:hidden" onClick={onClose} aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <Link
            href="/"
            onClick={onClose}
            className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              pathname === "/" ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <LayoutDashboard size={18} /> דשבורד
          </Link>

          <div className="mb-1.5 mt-5 flex items-center justify-between px-3">
            <span className="text-xs font-bold text-muted">המרחבים שלי</span>
            <button
              onClick={() => openSpace({ mode: "new" })}
              className="rounded-lg p-1 text-muted transition hover:bg-slate-100 hover:text-accent"
              aria-label="מרחב חדש"
              title="מרחב חדש"
            >
              <Plus size={16} />
            </button>
          </div>

          {spaces.map((s) => {
            const href = `/space/${s.id}`;
            const active = pathname === href;
            const open_ = tasks.filter((t) => t.space_id === s.id && t.status !== "done");
            const late = open_.filter((t) => isOverdue(t, today)).length;
            return (
              <Link
                key={s.id}
                href={href}
                onClick={onClose}
                className={`group mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "font-bold" : "font-medium text-slate-600 hover:bg-slate-50"
                }`}
                style={active ? { background: s.color + "14", color: s.color } : undefined}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                {late > 0 && <span className="rounded-full bg-red-50 px-1.5 text-[11px] font-bold text-red-600">{late}</span>}
                <span className="text-xs text-muted">{open_.length}</span>
                <span className="text-slate-300 group-hover:text-slate-400">{VIEW_ICON[s.view]}</span>
              </Link>
            );
          })}

          <button
            onClick={() => openSpace({ mode: "new" })}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            <Plus size={16} /> מרחב חדש
          </button>
        </nav>

        <div className="pb-20" />
      </aside>
    </>
  );
}
