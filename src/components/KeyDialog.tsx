"use client";
import { useEffect, useRef, useState } from "react";

export type Provider = "tinyfish" | "gemini";
export const LABEL: Record<Provider, string> = { tinyfish: "TinyFish", gemini: "Gemini" };
const COPY: Record<Provider, { why: string; steps: string[]; url: string; link: string; field: string; placeholder: string; note?: string }> = {
  tinyfish: {
    why: "BrandMeld uses TinyFish to explore the live website and collect the brand evidence needed to build your Brand DNA. Your TinyFish API key is required to perform this live web exploration.",
    steps: ["Open the TinyFish developer dashboard.", "Sign in or create an account.", "Create an API key.", "Copy the key.", "Paste it into BrandMeld."],
    url: "https://agent.tinyfish.ai/api-keys", link: "Open the TinyFish key page ↗", field: "TinyFish API Key", placeholder: "Paste API key",
  },
  gemini: {
    why: "BrandMeld uses Google Gemini (Gemini 3.5 Flash-Lite) to interpret the evidence TinyFish collects: tone of voice, messaging and writing rules. Your own Gemini API key is required, and it is free to create in Google AI Studio.",
    steps: ["Open Google AI Studio and sign in with your Google account.", "Click “Create API key”. Pick an existing Google Cloud project or let AI Studio create one.", "Copy the key. It starts with “AIza”.", "Paste it into BrandMeld."],
    url: "https://aistudio.google.com/apikey", link: "Open Google AI Studio ↗", field: "Gemini API Key", placeholder: "Paste key (starts with AIza)",
    note: "Free-tier keys have usage limits. If you hit a rate limit, wait a minute or enable billing in Google AI Studio.",
  },
};

type State = "none" | "connecting" | "connected" | "invalid" | "error";
export default function KeyDialog({ open, provider = "tinyfish", mode = "connect", invalid = false, onClose, onConnected }: { open: boolean; provider?: Provider; mode?: "connect" | "replace"; invalid?: boolean; onClose: () => void; onConnected: () => void }) {
  const [state, setState] = useState<State>("none");
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const c = COPY[provider], name = LABEL[provider];
  useEffect(() => { if (open) { setState(invalid ? "invalid" : "none"); setMsg(""); setHelp(false); setTimeout(() => ref.current?.focus(), 50); } }, [open, invalid]);
  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = ref.current?.value ?? "";
    setState("connecting");
    const r = await fetch("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key }) });
    if (ref.current) ref.current.value = ""; // never keep the key in the DOM after submission
    if (r.ok) return setState("connected");
    const j = await r.json().catch(() => null);
    setMsg(j?.error?.message ?? "Something went wrong.");
    setState(j?.error?.code === "INVALID_KEY" ? "invalid" : "error");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="kd-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="fade-in max-h-full w-full max-w-[520px] text-graphite overflow-auto rounded-lg border border-hairline-soft bg-canvas p-6 sm:p-8">
        {state === "connected" ? (
          <>
            <h2 id="kd-title" className="h-md">{name} connected</h2>
            <p className="mt-3">Your key is securely stored. You won’t be asked for it again.</p>
            <button className="btn mt-8" onClick={onConnected} autoFocus>Continue</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="eyebrow">{name} API key</div>
            <h2 id="kd-title" className="h-md mt-2">{mode === "replace" ? "Replace your key" : state === "invalid" ? "We couldn’t authenticate this key" : `Connect ${name}`}</h2>
            <p className="mt-3">
              {state === "invalid" ? "Check that the key is active and try again." : c.why}
            </p>
            <button type="button" className="link mt-4" onClick={() => setHelp(!help)} aria-expanded={help}>{help ? "Hide steps" : "How do I get a key?"}</button>
            {help && (
              <div className="fade-in mt-3">
                <ol className="list-decimal space-y-1 pl-5 text-[15px]">{c.steps.map((x) => <li key={x}>{x}</li>)}</ol>
                <a className="link mt-3 inline-block" href={c.url} target="_blank" rel="noreferrer">{c.link}</a>
                {c.note && <p className="meta mt-2">{c.note}</p>}
              </div>
            )}
            <label className="mt-6 block text-ink" htmlFor="tfkey">{c.field}</label>
            <input id="tfkey" ref={ref} type="password" autoComplete="off" spellCheck={false} placeholder={c.placeholder} className="field" required disabled={state === "connecting"} />
            {(state === "error" || (state === "invalid" && msg)) && <p className="meta mt-2 !text-ink" role="alert">{msg}</p>}
            <div className="mt-8 flex items-center gap-3">
              <button className="btn" disabled={state === "connecting"}>{state === "connecting" ? "Connecting to TinyFish…" : state === "invalid" ? "Replace key" : "Connect"}</button>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={state === "connecting"}>Cancel</button>
            </div>
            <p className="meta mt-4">Stored encrypted on the server. Never shown again after you submit it.</p>
          </form>
        )}
      </div>
    </div>
  );
}
