"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const q = useSearchParams(), r = useRouter();
  const [mode, setMode] = useState(q.get("mode") === "signup" ? "signup" : "signin");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password") }) });
    if (res.ok) { const next = q.get("next"); r.push(next && next.startsWith("/") ? next : "/"); r.refresh(); return; }
    setErr((await res.json().catch(() => null))?.error?.message ?? "Something went wrong."); setBusy(false);
  };
  return (
    <div className="mx-auto max-w-[440px] px-6 py-16 md:py-[96px]">
      <div className="eyebrow">{mode === "signup" ? "Create account" : "Welcome back"}</div>
      <h1 className="display mt-3 !text-[40px]">{mode === "signup" ? "Start mapping brands." : "Sign in."}</h1>
      <form onSubmit={submit} className="mt-10 space-y-6">
        <div><label htmlFor="email" className="text-ink">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" placeholder="you@company.com" /></div>
        <div><label htmlFor="pw" className="text-ink">Password</label><input id="pw" name="password" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="field" placeholder="At least 8 characters" /></div>
        {err && <p className="text-[14px] text-ink" role="alert">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      </form>
      <p className="mt-6 text-[14px]">{mode === "signup" ? "Already have an account? " : "New here? "}<button className="link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); }}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>
    </div>
  );
}
export default function Auth() { return <Suspense><Form /></Suspense>; }
