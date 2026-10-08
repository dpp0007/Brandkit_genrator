"use client";
import { useEffect, useState } from "react";
import { useExplorer } from "./useExplorer";

export default function ExploreForm({ dark = false, initial = "" }: { dark?: boolean; initial?: string }) {
  const [url, setUrl] = useState(initial);
  const { start, busy, error, dialog } = useExplorer();
  useEffect(() => { if (initial) setUrl(initial); }, [initial]);
  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (url.trim()) start(url.trim()); }}
        className={dark ? "flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.06] py-1.5 pl-6 pr-1.5 transition-colors focus-within:border-white/70" : "flex flex-col gap-4 sm:flex-row sm:items-end"}
      >
        <label className="sr-only" htmlFor="site">Company website or name</label>
        <input id="site" className={dark ? "min-w-0 flex-1 bg-transparent py-2.5 text-[18px] text-white outline-none placeholder:text-white/40" : "field flex-1 text-[20px]"} placeholder="https://company.com" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
        <button className={"btn shrink-0 " + (dark ? "btn-dark !h-11 !px-6 disabled:!opacity-60" : "")} disabled={busy || !url.trim()}>{busy ? "Preparing…" : "Explore Brand"}</button>
      </form>
      {error && <p className={"mt-3 text-[14px] " + (dark ? "text-white" : "text-ink")} role="alert">{error}</p>}
      <p className="mt-5 flex flex-wrap items-center gap-2 text-[14px]">
        <span className={dark ? "mr-1 text-white/45" : "mr-1 text-slate"}>Try</span>
        {[["Stripe", "https://stripe.com"], ["Linear", "https://linear.app"], ["Notion", "https://notion.com"]].map(([n, u]) => (
          <button key={n} type="button" onClick={() => setUrl(u)} className={"rounded-full border px-3.5 py-1 text-[13px] font-semibold transition-colors " + (dark ? "border-white/20 text-white/90 hover:border-white hover:bg-white/10" : "border-hairline-soft text-ink hover:border-ink")}>{n}</button>
        ))}
      </p>
      {dialog}
    </div>
  );
}
