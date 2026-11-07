"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal } from "./ui";
import { DEFAULT_PRIORITY, PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "@/lib/constants";
import type { Priority, Status } from "@/lib/types";

export function TaskModal() {
  const { taskModal, openTask, tasks, spaces, addTask, patchTask, removeTask } = useData();
  const existing = taskModal?.mode === "edit" ? tasks.find((t) => t.id === taskModal.id) : undefined;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [status, setStatus] = useState<Status>("new");
  const [due, setDue] = useState("");
  const [spaceId, setSpaceId] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const key = taskModal ? (taskModal.mode === "edit" ? `e${taskModal.id}` : `n${taskModal.space_id}${taskModal.due_date}${taskModal.status}`) : "";

  useEffect(() => {
    if (!taskModal) return;
    setConfirmDelete(false);
    if (taskModal.mode === "edit" && existing) {
      setTitle(existing.title);
      setDescription(existing.description);
      setPriority(existing.priority);
      setStatus(existing.status);
      setDue(existing.due_date ?? "");
      setSpaceId(existing.space_id);
    } else if (taskModal.mode === "new") {
      setTitle("");
      setDescription("");
      setPriority(DEFAULT_PRIORITY);
      setStatus(taskModal.status ?? "new");
      setDue(taskModal.due_date ?? "");
      setSpaceId(taskModal.space_id ?? spaces[0]?.id ?? 0);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!taskModal) return null;
  if (taskModal.mode === "edit" && !existing) return null;
  const close = () => openTask(null);

  async function save() {
    if (!title.trim() || !spaceId) return;
    setBusy(true);
    const payload = { title: title.trim(), description, priority, status, due_date: due || null, space_id: spaceId };
    if (taskModal!.mode === "edit") await patchTask(existing!.id, payload);
    else await addTask(payload);
    setBusy(false);
    close();
  }

  return (
    <Modal
      title={taskModal.mode === "edit" ? "כרטיס משימה" : "משימה חדשה"}
      onClose={close}
      footer={
        <>
          <button className="btn-primary" onClick={save} disabled={busy || !title.trim()}>
            {taskModal.mode === "edit" ? "שמירה" : "יצירת משימה"}
          </button>
          <button className="btn-ghost" onClick={close}>ביטול</button>
          {taskModal.mode === "edit" &&
            (confirmDelete ? (
              <button
                className="btn mr-auto bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  await removeTask(existing!.id);
                  close();
                }}
              >
                בטוח, למחוק
              </button>
            ) : (
              <button className="btn-danger mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> מחיקה
              </button>
            ))}
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <label className="label">כותרת</label>
          <input ref={titleRef} className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה צריך לעשות?" />
        </div>

        <div>
          <label className="label">עדיפות</label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.slice().reverse().map((p) => {
              const m = PRIORITY_META[p];
              const on = priority === p;
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className="rounded-xl border px-2 py-2 text-sm font-medium transition"
                  style={on ? { background: m.bg, color: m.color, borderColor: m.color } : { borderColor: "#e6e8ef", color: "#6b7280" }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סטטוס</label>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">תאריך יעד</label>
            <input type="date" className="field" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">מרחב</label>
          <select className="field" value={spaceId} onChange={(e) => setSpaceId(Number(e.target.value))}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">תיאור</label>
          <textarea className="field min-h-24 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="פרטים נוספים (לא חובה)" />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
