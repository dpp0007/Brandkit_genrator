// A brand-guide specimen for the hero. Uses the signed-in user's latest real brand when there is one;
// otherwise it is a clearly decorative illustration that cycles through sample palettes.
type Real = { name: string; colors: string[]; font: string | null; tone: string[]; conf: [string, number][] } | null;

const STAGES = ["Fetching pages", "Rendering in a browser", "Measuring styles", "Checking the evidence"];

export default function HeroArt({ real }: { real: Real }) {
  const sw = real?.colors.slice(0, 4) ?? [];
  return (
    <div className="relative mx-auto w-full max-w-[470px]" aria-hidden>
      <div className="absolute -inset-6 rounded-[28px] bg-white/[0.03] blur-2xl" />
      <div className="relative overflow-hidden rounded-lg border border-white/12 bg-[#14141a] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
        <i className="scan pointer-events-none absolute inset-x-0 z-10 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <div className="flex items-center justify-between">
          <span className="micro !text-white/50">{real ? real.name : "Brand DNA"}</span>
          <span className="relative h-4 w-40 text-right text-[11px] uppercase tracking-[.2px] text-white/50">
            {real ? <span>Latest analysis</span> : STAGES.map((s, i) => <span key={s} className="stage absolute inset-y-0 right-0" style={{ animationDelay: `${i * 3}s` }}>{s}</span>)}
          </span>
        </div>

        <div className="mt-5 flex h-28 gap-1.5 overflow-hidden rounded-md">
          {real && sw.length ? sw.map((c, i) => <i key={i} className="rounded-sm" style={{ background: c, flex: i === 0 ? 3 : 1 }} />)
            : <><i className="cyc1 rounded-sm" style={{ flex: 3 }} /><i className="cyc2 rounded-sm" style={{ flex: 1.4 }} /><i className="cyc3 rounded-sm" style={{ flex: 1 }} /><i className="cyc4 rounded-sm" style={{ flex: 1 }} /></>}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-white/40">
          {real && sw.length ? sw.map((c) => <span key={c}>{c}</span>) : ["Primary", "Accent", "Surface", "Text"].map((l) => <span key={l}>{l}</span>)}
        </div>

        <div className="mt-6 grid grid-cols-[1fr_1fr] gap-4">
          <div className="rounded-md border border-white/10 p-4">
            <div className="micro !text-white/40">Type</div>
            <div className="mt-3 text-[54px] leading-none text-white" style={{ letterSpacing: "-2px" }}>Aa</div>
            <div className="mt-2 font-mono text-[11px] text-white/40">{real?.font ?? "heading · body"}</div>
          </div>
          <div className="rounded-md border border-white/10 p-4">
            <div className="micro !text-white/40">Voice</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(real?.tone.length ? real.tone.slice(0, 4) : ["Direct", "Technical", "Calm", "Precise"]).map((t) => <span key={t} className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] text-white/80">{t}</span>)}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {(real?.conf.length ? real.conf.map(([l, v]) => [l, `${Math.round(v * 100)}%`]) : [["Primary colour", "94%"], ["Typeface", "91%"], ["Tagline", "88%"]]).map(([l, p], i) => (
            <div key={l} className="grid grid-cols-[110px_1fr_34px] items-center gap-3 text-[11px] text-white/50">
              <span>{l}</span><span className="h-[3px] bg-white/10"><i className={(real ? "" : "bar ") + "block h-full bg-white/80"} style={{ animationDelay: `${i * 0.8}s`, width: p }} /></span><span className="font-mono">{p}</span>
            </div>
          ))}
        </div>
      </div>
      {!real && <div className="mt-3 text-right text-[11px] text-white/30">Illustration. Your result uses the real site.</div>}
    </div>
  );
}
