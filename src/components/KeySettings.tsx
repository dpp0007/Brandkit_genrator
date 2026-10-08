"use client";
import { useState } from "react";
import KeyDialog, { LABEL, Provider } from "./KeyDialog";

type S = { connected: boolean; masked?: string; lastVerifiedAt?: string };
type All = Record<Provider, S>;
const BLURB: Record<Provider, string> = { tinyfish: "Live website exploration", gemini: "Gemini 3.5 Flash-Lite · voice and messaging interpretation" };

export default function KeySettings({ initial }: { initial: All }) {
  const [all, setAll] = useState<All>(initial);
  const reload = async () => setAll(await (await fetch("/api/credentials")).json());
  return <>{(["tinyfish", "gemini"] as Provider[]).map((p) => <Card key={p} p={p} s={all[p]} reload={reload} />)}</>;
}

function Card({ p, s, reload }: { p: Provider; s: S; reload: () => Promise<void> }) {
  const name = LABEL[p];
  const [dlg, setDlg] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true); setNote("");
    const r = await fetch("/api/credentials/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p }) });
    if (r.ok) { await reload(); setNote("Connection works."); }
    else setNote((await r.json().catch(() => null))?.error?.message ?? "Test failed.");
    setBusy(false);
  };
  const remove = async () => { await fetch(`/api/credentials?provider=${p}`, { method: "DELETE" }); setConfirm(false); setNote(""); await reload(); };

  return (
    <section className="mt-12 border-t border-hairline-soft pt-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div><h2 className="h-sm">{name}</h2><p className="meta mt-1">{BLURB[p]}</p></div>
        <span className="tag">{s.connected ? "Connected" : "Not connected"}</span>
      </div>
      {s.connected ? (
        <>
          <div className="mt-6 text-ink">{name} API Key</div>
          <div className="mono mt-1 text-[15px] text-graphite">{s.masked}</div>
          {s.lastVerifiedAt && <p className="meta mt-1">Last verified {s.lastVerifiedAt.slice(0, 16).replace("T", " ") + " UTC"}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn" onClick={test} disabled={busy}>{busy ? "Testing…" : "Test connection"}</button>
            <button className="btn btn-ghost" onClick={() => setDlg(true)}>Replace</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(true)}>Delete</button>
          </div>
        </>
      ) : (
        <div className="mt-6"><p>BrandMeld can’t explore websites until you connect a {name} key.</p><button className="btn mt-4" onClick={() => setDlg(true)}>Connect {name}</button></div>
      )}
      {note && <p className="mt-4 text-[14px] text-ink" role="status">{note}</p>}
      <KeyDialog open={dlg} provider={p} mode={s.connected ? "replace" : "connect"} onClose={() => setDlg(false)} onConnected={async () => { setDlg(false); await reload(); }} />
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby={`rm-${p}`}>
          <div className="fade-in w-full max-w-[460px] rounded-lg border border-hairline-soft bg-canvas p-8">
            <h2 id={`rm-${p}`} className="h-md !text-[28px]">Remove {name} API key?</h2>
            <p className="mt-3">BrandMeld will no longer be able to {p === "tinyfish" ? "explore websites" : "interpret brand voice"} until you add another key.</p>
            <div className="mt-8 flex gap-3"><button className="btn btn-ghost" onClick={() => setConfirm(false)} autoFocus>Cancel</button><button className="btn" onClick={remove}>Remove key</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
