"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "הכניסה נכשלה");
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setError("אין חיבור לשרת");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="anim-pop card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Lock size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold">המשימות שלי</h1>
            <p className="text-sm text-muted">הזן סיסמה כדי להיכנס</p>
          </div>
        </div>
        <label htmlFor="password" className="label">
          סיסמה
        </label>
        <div className="relative">
          <input
            id="password"
            type={visible ? "text" : "password"}
            autoFocus
            autoComplete="current-password"
            className="field"
            style={{ paddingInlineEnd: "2.75rem" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={visible ? "הסתר סיסמה" : "הצג סיסמה"}
            aria-pressed={visible}
            title={visible ? "הסתר סיסמה" : "הצג סיסמה"}
            className="absolute inset-y-0 end-1 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink"
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || !password}>
          {busy ? "נכנס..." : "כניסה"}
        </button>
      </form>
    </main>
  );
}
