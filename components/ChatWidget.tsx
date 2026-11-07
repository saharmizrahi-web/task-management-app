"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Layers, Loader2, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { useData } from "./DataProvider";
import { SpaceDot } from "./ui";

type Scope = "all" | number;

interface Pending {
  token: string;
  kind: "add" | "update" | "delete";
  count: number;
  summary: string;
  titles: string[];
  state: "idle" | "busy" | "approved" | "rejected";
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  pending?: Pending[];
  error?: boolean;
}

const SUGGESTIONS = [
  "מה המשימות הכי חשובות שצריך לתת להן עדיפות?",
  "תסכם לי איפה אני עומד",
  "תדחה את כל מה שבאיחור למחר",
  "תוסיף: לקנות חלב, להתקשר לסבתא מחר, לשלם ארנונה עד ה-10",
];

let seq = 1;

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-[14px] leading-relaxed">
      {lines.map((l, i) => {
        const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
        if (m) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
              <span>{renderInline(m[1])}</span>
            </div>
          );
        }
        if (!l.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(l)}</p>;
      })}
    </div>
  );
}

export function ChatWidget() {
  const { spaces, refresh } = useData();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [scopeMenu, setScopeMenu] = useState(false);
  const [override, setOverride] = useState<{ path: string; scope: Scope } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const auto: Scope = useMemo(() => {
    const m = pathname.match(/^\/space\/(\d+)/);
    return m ? Number(m[1]) : "all";
  }, [pathname]);
  const scope: Scope = override && override.path === pathname ? override.scope : auto;
  const scopeSpace = scope === "all" ? null : spaces.find((s) => s.id === scope);
  const effectiveScope: Scope = scope === "all" || scopeSpace ? scope : "all";
  const scopePayload = effectiveScope === "all" ? "all" : [effectiveScope];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { id: seq++, role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
          scope: scopePayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה");
      setMessages((m) => [
        ...m,
        {
          id: seq++,
          role: "assistant",
          content: json.reply,
          actions: json.actions,
          pending: (json.pending ?? []).map((p: Omit<Pending, "state">) => ({ ...p, state: "idle" as const })),
        },
      ]);
      if (json.mutated) await refresh();
    } catch (e) {
      setMessages((m) => [...m, { id: seq++, role: "assistant", content: e instanceof Error ? e.message : "משהו השתבש, נסה שוב", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function setPendingState(msgId: number, token: string, state: Pending["state"]) {
    setMessages((ms) => ms.map((m) => (m.id === msgId ? { ...m, pending: m.pending?.map((p) => (p.token === token ? { ...p, state } : p)) } : m)));
  }

  async function approve(msgId: number, p: Pending) {
    setPendingState(msgId, p.token, "busy");
    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: p.token, scope: scopePayload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה");
      setPendingState(msgId, p.token, "approved");
      setMessages((m) => [...m, { id: seq++, role: "assistant", content: json.message }]);
      if (json.mutated) await refresh();
    } catch (e) {
      setPendingState(msgId, p.token, "idle");
      setMessages((m) => [...m, { id: seq++, role: "assistant", content: e instanceof Error ? e.message : "האישור נכשל", error: true }]);
    }
  }

  function reject(msgId: number, p: Pending) {
    setPendingState(msgId, p.token, "rejected");
    setMessages((m) => [...m, { id: seq++, role: "assistant", content: "בסדר, ביטלתי. לא שיניתי כלום." }]);
  }

  return (
    <>
      {/* floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="anim-pop group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-l from-indigo-600 to-violet-600 py-3.5 pl-5 pr-4 text-white shadow-[0_10px_30px_rgba(79,70,229,0.45)] transition hover:scale-105 active:scale-95"
          aria-label="פתיחת הסוכן החכם"
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <Sparkles size={22} />
            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-600" />
          </span>
          <span className="text-sm font-bold">שאל את הסוכן</span>
        </button>
      )}

      {/* panel */}
      {open && (
        <div className="anim-pop fixed inset-0 z-50 flex flex-col overflow-hidden border-line bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(700px,calc(100vh-40px))] sm:w-[420px] sm:rounded-3xl sm:border">
          <header className="bg-gradient-to-l from-indigo-600 to-violet-600 px-4 pb-3 pt-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                <Sparkles size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold leading-tight">הסוכן החכם</h2>
                <p className="flex items-center gap-1.5 text-xs text-indigo-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> מחובר ומוכן
                </p>
              </div>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="rounded-lg p-2 text-indigo-100 hover:bg-white/15" aria-label="שיחה חדשה" title="שיחה חדשה">
                  <RotateCcw size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-indigo-100 hover:bg-white/15" aria-label="סגירה">
                <X size={18} />
              </button>
            </div>

            {/* scope */}
            <div className="relative mt-3">
              <button
                onClick={() => setScopeMenu((v) => !v)}
                className="flex w-full items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm transition hover:bg-white/25"
              >
                <span className="text-indigo-100">עובד עכשיו על:</span>
                <span className="flex items-center gap-1.5 font-bold">
                  {scopeSpace ? (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: scopeSpace.color }} />
                      {scopeSpace.name}
                    </>
                  ) : (
                    <>
                      <Layers size={14} /> כל המרחבים
                    </>
                  )}
                </span>
                <ChevronDown size={16} className={`mr-auto transition ${scopeMenu ? "rotate-180" : ""}`} />
              </button>
              {scopeMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setScopeMenu(false)} />
                  <div className="anim-pop absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl bg-white py-1 text-ink shadow-xl ring-1 ring-black/5">
                    {([{ id: "all" as Scope, name: "כל המרחבים", color: "" }, ...spaces.map((s) => ({ id: s.id as Scope, name: s.name, color: s.color }))]).map((o) => (
                      <button
                        key={String(o.id)}
                        onClick={() => {
                          setOverride({ path: pathname, scope: o.id });
                          setScopeMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition hover:bg-slate-50"
                      >
                        {o.color ? <SpaceDot color={o.color} /> : <Layers size={14} className="text-muted" />}
                        <span className="flex-1 text-right">{o.name}</span>
                        {effectiveScope === o.id && <Check size={15} className="text-accent" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4">
            {messages.length === 0 && (
              <div className="anim-fade pt-2">
                <div className="mb-4 rounded-2xl bg-white p-4 text-sm leading-relaxed shadow-sm ring-1 ring-line">
                  שלום, אני הסוכן שלך. אפשר לשאול אותי על המשימות, ולבקש ממני להוסיף, לעדכן, לדחות או למחוק.
                  {scopeSpace ? (
                    <> כרגע אני עובד רק על המרחב <b>{scopeSpace.name}</b>.</>
                  ) : (
                    <> כרגע אני רואה את כל המרחבים.</>
                  )}
                </div>
                <p className="mb-2 text-xs font-bold text-muted">נסה לשאול:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-right text-sm transition hover:border-accent hover:bg-accent-soft">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"} anim-fade`}>
                <div className={`max-w-[88%] ${m.role === "user" ? "" : "w-full max-w-[92%]"}`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      m.role === "user"
                        ? "rounded-br-md bg-accent text-white"
                        : m.error
                          ? "rounded-bl-md bg-red-50 text-red-700 ring-1 ring-red-100"
                          : "rounded-bl-md bg-white ring-1 ring-line"
                    }`}
                  >
                    <RichText text={m.content} />
                  </div>

                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[...new Set(m.actions)].map((a) => (
                        <span key={a} className="chip bg-emerald-50 text-emerald-700">
                          <Check size={12} /> {a}
                        </span>
                      ))}
                    </div>
                  )}

                  {m.pending?.map((p) => (
                    <div key={p.token} className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-sm font-bold text-amber-900">{p.summary}</p>
                      <ul className="mb-3 mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-xs text-amber-800">
                        {p.titles.map((t, i) => (
                          <li key={i} className="truncate">• {t}</li>
                        ))}
                        {p.count > p.titles.length && <li>ועוד {p.count - p.titles.length}...</li>}
                      </ul>
                      {p.state === "approved" && <p className="text-sm font-bold text-emerald-700">אושר ובוצע</p>}
                      {p.state === "rejected" && <p className="text-sm font-bold text-slate-500">בוטל</p>}
                      {(p.state === "idle" || p.state === "busy") && (
                        <div className="flex gap-2">
                          <button disabled={p.state === "busy"} onClick={() => approve(m.id, p)} className="btn flex-1 bg-emerald-600 text-white hover:bg-emerald-700">
                            {p.state === "busy" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} אשר
                          </button>
                          <button disabled={p.state === "busy"} onClick={() => reject(m.id, p)} className="btn flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                            <X size={15} /> לא מאשר
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-end anim-fade">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-line">
                  <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-slate-50 p-1.5 pr-3.5 focus-within:border-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="כתוב לסוכן..."
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-indigo-600 disabled:opacity-40"
                aria-label="שליחה"
              >
                <SendHorizontal size={17} className="-scale-x-100" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
