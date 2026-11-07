"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Columns3, ListChecks, Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal } from "./ui";
import { SPACE_COLORS, VIEW_META } from "@/lib/constants";
import type { ViewType } from "@/lib/types";

const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  kanban: <Columns3 size={22} />,
  todo: <ListChecks size={22} />,
  calendar: <CalendarDays size={22} />,
};

export function SpaceModal() {
  const { spaceModal, openSpace, spaces, tasks, addSpace, patchSpace, removeSpace } = useData();
  const router = useRouter();
  const existing = spaceModal?.mode === "edit" ? spaces.find((s) => s.id === spaceModal.id) : undefined;

  const [name, setName] = useState("");
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [view, setView] = useState<ViewType>("kanban");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const key = spaceModal ? (spaceModal.mode === "edit" ? `e${spaceModal.id}` : "new") : "";

  useEffect(() => {
    if (!spaceModal) return;
    setConfirmDelete(false);
    if (spaceModal.mode === "edit" && existing) {
      setName(existing.name);
      setColor(existing.color);
      setView(existing.view);
    } else {
      setName("");
      setColor(SPACE_COLORS[spaces.length % SPACE_COLORS.length]);
      setView("kanban");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!spaceModal) return null;
  if (spaceModal.mode === "edit" && !existing) return null;
  const close = () => openSpace(null);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    if (spaceModal!.mode === "edit") {
      await patchSpace(existing!.id, { name: name.trim(), color, view });
      close();
    } else {
      const s = await addSpace({ name: name.trim(), color, view });
      close();
      if (s) router.push(`/space/${s.id}`);
    }
    setBusy(false);
  }

  const taskCount = existing ? tasks.filter((t) => t.space_id === existing.id).length : 0;

  return (
    <Modal
      title={spaceModal.mode === "edit" ? "עריכת מרחב" : "מרחב חדש"}
      onClose={close}
      footer={
        <>
          <button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {spaceModal.mode === "edit" ? "שמירה" : "יצירת מרחב"}
          </button>
          <button className="btn-ghost" onClick={close}>ביטול</button>
          {spaceModal.mode === "edit" &&
            (confirmDelete ? (
              <button
                className="btn mr-auto bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  await removeSpace(existing!.id);
                  close();
                  router.push("/");
                }}
              >
                בטוח, למחוק גם {taskCount} משימות
              </button>
            ) : (
              <button className="btn-danger mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> מחיקת מרחב
              </button>
            ))}
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <label className="label">שם המרחב</label>
          <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: בית, עבודה, לימודים" />
        </div>

        <div>
          <label className="label">צבע</label>
          <div className="flex flex-wrap gap-2.5">
            {SPACE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className="flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition hover:scale-110"
                style={{ background: c, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
              >
                {color === c && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">תצוגה</label>
          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(VIEW_META) as ViewType[]).map((v) => {
              const on = view === v;
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => setView(v)}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 text-center transition"
                  style={on ? { borderColor: color, background: color + "12", color } : { borderColor: "#e6e8ef", color: "#475569" }}
                >
                  {VIEW_ICONS[v]}
                  <span className="text-sm font-bold">{VIEW_META[v].label}</span>
                  <span className="text-[11px] leading-snug text-muted">{VIEW_META[v].description}</span>
                </button>
              );
            })}
          </div>
          {spaceModal.mode === "edit" && <p className="mt-2 text-xs text-muted">אפשר להחליף תצוגה בכל רגע, המשימות נשמרות כמו שהן.</p>}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
