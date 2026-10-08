"use client";
import { Suspense, use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import KeyDialog from "@/components/KeyDialog";

type Ev = { stage: string; status: "active" | "done" | "warn"; label: string; detail?: string };
type Job = { id: string; url: string; status: "running" | "done" | "error"; events: Ev[]; brandId: string | null; error: { code: string; message: string; provider?: "tinyfish" | "gemini" } | null; diff: { colors: number; typography: number; messaging: number; changed: boolean } | null };

// Stages mirror the backend pipeline; labels/details are replaced by what actually happened.
const STAGES: [string, string][] = [
  ["connect", "Connect to the website"], ["homepage", "Find the homepage"], ["discover", "Discover brand pages"], ["pages", "Read product and company pages"],
  ["render", "Render the live page in a browser"], ["visual", "Analyse the visual system"], ["typography", "Map typography"], ["voice", "Reconstruct brand voice"], ["validate", "Validate findings"], ["compile", "Compile Brand DNA"],
];

export default function ExplorePage(props: { params: Promise<{ id: string }> }) { return <Suspense><Explore {...props} /></Suspense>; }

function Explore({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const refresh = useSearchParams().get("refresh") === "1";
  const [job, setJob] = useState<Job | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    const tick = async () => {
      if (stop.current) return;
      let res: Response;
      try { res = await fetch(`/api/jobs/${id}`); } catch { return setTimeout(tick, 1500); }
      if (res.ok) {
        const j: Job = await res.json();
        setJob(j);
        if (j.status === "done" && j.brandId) {
          const d = j.diff && refresh ? `?changed=${j.diff.colors},${j.diff.typography},${j.diff.messaging}` : "";
          return setTimeout(() => r.replace(`/brands/${j.brandId}${d}`), 700);
        }
        if (j.status === "error") { if (j.error?.code === "INVALID_KEY") setKeyOpen(true); return; }
      } else if (res.status === 401) return r.push("/auth");
      setTimeout(tick, 900);
    };
    tick();
    return () => { stop.current = true; };
  }, [id, r, refresh]);

  const byStage = new Map(job?.events.map((e) => [e.stage, e]));
  const host = job ? job.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
  const err = job?.error;

  const retry = async () => {
    const res = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: job!.url, refresh }) });
    const j = await res.json();
    if (res.ok) r.replace(`/explore/${j.jobId}?refresh=${refresh ? 1 : 0}`);
  };

  return (
    <div className="mx-auto max-w-[760px] px-6 py-16 md:py-[96px]">
      <div className="eyebrow">TinyFish exploration</div>
      <h1 className="display mt-3 break-words">Exploring {host || "…"}</h1>
      <ul className="mt-12 divide-y divide-hairline-soft border-y border-hairline-soft">
        {STAGES.map(([s, fallback]) => {
          const e = byStage.get(s);
          const active = !err && e?.status === "active";
          const failed = err && !e;
          return (
            <li key={s} className="flex items-start gap-4 py-4 fade-in">
              <span aria-hidden className={"mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full " + (e?.status === "done" ? "bg-ink" : e?.status === "warn" ? "border-2 border-ink" : active ? "bg-coral pulse" : "border border-ash")} />
              <div className="min-w-0 flex-1">
                <div className={e ? "text-ink" : "text-stone"}>{e?.label ?? fallback}</div>
                {e?.detail && <div className="mono mt-1 break-words text-slate">{e.detail}</div>}
              </div>
              <span className="micro mt-1 shrink-0">{failed ? "" : e?.status === "done" ? "Done" : e?.status === "warn" ? "Partial" : active ? "Working" : ""}</span>
            </li>
          );
        })}
      </ul>
      {err && (
        <div className="mt-8 rounded-lg border border-hairline-soft p-6" role="alert">
          <h2 className="h-sm">We couldn’t finish this exploration</h2>
          <p className="mt-2">{err.message}</p>
          <div className="mt-6 flex gap-3">
            {err.code === "INVALID_KEY" ? <button className="btn" onClick={() => setKeyOpen(true)}>Replace key</button> : ["TIMEOUT", "INTERRUPTED", "RATE_LIMITED", "TINYFISH_ERROR", "TINYFISH_UNREACHABLE", "EXTRACTION_FAILED"].includes(err.code) && <button className="btn" onClick={retry}>Try again</button>}
            <Link href="/" className="btn btn-ghost">Try another URL</Link>
          </div>
        </div>
      )}
      {!err && job?.status !== "done" && <p className="meta mt-6">Progress reflects what the backend is doing right now. Large sites can take a minute or two.</p>}
      <KeyDialog open={keyOpen} provider={err?.provider ?? "tinyfish"} invalid mode="connect" onClose={() => setKeyOpen(false)} onConnected={() => { setKeyOpen(false); retry(); }} />
    </div>
  );
}
