"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ago, download, slug } from "@/lib/client";
import { useExplorer } from "./useExplorer";
import BrandPreview from "./BrandPreview";

type Src = { url: string; reason: string };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onColor = (hex: string) => (lum(hex) > 0.4 ? "#0a0a0a" : "#ffffff");
const SECTIONS = [["overview", "Overview"], ["logo", "Logo"], ["colour", "Colour"], ["type", "Typography"], ["voice", "Voice"], ["messaging", "Messaging"], ["evidence", "Evidence"]] as const;

function Meter({ v }: { v: number }) {
  return <span className="inline-flex items-center gap-2" title={`${pct(v)} confidence`}><span className="h-[3px] w-14 bg-hairline"><span className="block h-full bg-ink" style={{ width: pct(v) }} /></span><span className="mono text-[11px] text-slate">{pct(v)}</span></span>;
}
function Section({ id, eyebrow, title, aside, children }: { id: string; eyebrow: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} data-section className="scroll-mt-24 border-t border-hairline-soft py-12 first:border-t-0 first:pt-0 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">{eyebrow}</div><h2 className="h-md mt-2 !text-[28px] md:!text-[34px]">{title}</h2></div>
        {aside}
      </div>
      {children}
    </section>
  );
}
const Label = ({ children }: { children: React.ReactNode }) => <div className="micro mb-3">{children}</div>;
function Rows({ items, numbered }: { items: string[]; numbered?: boolean }) {
  if (!items.length) return null;
  return <ol className="border-t border-hairline-soft">{items.map((x, i) => <li key={i} className="flex gap-5 border-b border-hairline-soft py-3.5"><span className="mono w-6 shrink-0 pt-0.5 text-slate">{numbered ? String(i + 1).padStart(2, "0") : "·"}</span><span className="text-ink-soft">{x}</span></li>)}</ol>;
}

export default function BrandView({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"guide" | "preview" | "context" | "json">("guide");
  const [toast, setToast] = useState("");
  const [active, setActive] = useState("overview");
  const { start, error, dialog } = useExplorer();
  const ch = useSearchParams().get("changed")?.split(",").map(Number);
  const t = useRef<any>(null);

  useEffect(() => { fetch(`/api/brands/${id}`).then(async (r) => (r.ok ? setD(await r.json()) : setErr((await r.json()).error?.message ?? "Not found"))); }, [id]);
  useEffect(() => {
    if (!d || tab !== "guide") return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-20% 0px -65% 0px" });
    document.querySelectorAll("[data-section]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [d, tab]);

  if (err) return <div className="mx-auto max-w-[760px] px-6 py-24"><h1 className="display">Brand not found</h1><p className="mt-4">{err}</p></div>;
  if (!d) return <div className="mx-auto max-w-[1280px] px-6 py-24 md:px-12"><div className="h-10 w-64 animate-pulse bg-hairline" /><div className="mt-6 h-5 w-96 animate-pulse bg-hairline" /></div>;

  const g = d.guide, dna = d.dna, name = d.brand.name;
  const copy = async (what: string, text: string) => { await navigator.clipboard.writeText(text); setToast(`Copied ${what}`); clearTimeout(t.current); t.current = setTimeout(() => setToast(""), 1600); };
  const json = JSON.stringify(dna, null, 2);
  const sw = g.colors.swatches as any[];
  const hasColour = sw.length > 0, hasType = !!(g.typography.heading || g.typography.body);
  const partial = dna.meta.partial;
  const sections = SECTIONS.filter(([k]) => !(k === "logo" && !g.logo.primary && !g.logo.favicon));
  const fonts = [...new Set([g.typography.heading, g.typography.body].filter(Boolean))] as string[];

  return (
    <div className="mx-auto max-w-[1280px] px-6 md:px-12">
      <header className="pb-8 pt-10 md:pt-14">
        <div className="eyebrow">Brand guide · v{d.version}</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="display break-words">{name}</h1>
            <p className="mt-3 text-[14px]"><a className="link" href={d.brand.url} target="_blank" rel="noreferrer">{d.brand.url.replace(/^https?:\/\//, "")} ↗</a><span className="meta ml-3">Analysed {ago(d.brand.updatedAt)} · {g.overview.pages_explored} page{g.overview.pages_explored === 1 ? "" : "s"} read</span></p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn" onClick={() => start(d.brand.url, true)}>Re-analyse</button>
            <button className="btn btn-ghost" onClick={() => copy("AI context", d.context.text)}>Copy AI context</button>
            <button className="btn btn-ghost" onClick={() => download(`${slug(name)}-brand-dna.json`, json)}>Download JSON</button>
          </div>
        </div>
        {error && <p className="mt-3 text-[14px] text-ink" role="alert">{error}</p>}
        {ch && <div className="mt-6 border-l-2 border-ink pl-4 fade-in" role="status"><div className="micro !text-ink">Re-analysed</div><p className="mt-1 text-ink">{ch.every((n) => n === 0) ? "Nothing changed since the last analysis." : `${ch[0]} colour, ${ch[1]} typography and ${ch[2]} messaging change${ch[0] + ch[1] + ch[2] === 1 ? "" : "s"} since the last analysis.`}</p></div>}
        {partial && <div className="mt-6 border-l-2 border-ash pl-4" role="status"><div className="micro">Partial result</div><p className="mt-1 text-[14px]">{g.warnings[0] ?? "Some visual details could not be measured for this site."}</p></div>}
        <div className="mt-8 flex gap-8 overflow-x-auto border-b border-hairline-soft" role="tablist">
          {([["guide", "Brand guide"], ["preview", "Preview"], ["context", "AI context"], ["json", "Brand DNA"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={"-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 text-[14px] font-semibold transition-colors " + (tab === k ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink")}>{l}</button>
          ))}
        </div>
      </header>

      {tab === "preview" && <BrandPreview dna={dna} />}
      {tab === "context" && (
        <div className="grid gap-10 pb-24 fade-in lg:grid-cols-[1fr_340px]">
          <div>
            <div className="flex flex-wrap gap-3"><button className="btn" onClick={() => copy("context", d.context.text)}>Copy</button><button className="btn btn-ghost" onClick={() => download(`${slug(name)}-context.txt`, d.context.text, "text/plain")}>Download .txt</button><button className="btn btn-ghost" onClick={() => download(`${slug(name)}-context.json`, JSON.stringify(d.context, null, 2))}>Download JSON</button></div>
            <pre className="mono mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-warm p-6 leading-relaxed text-ink-soft">{d.context.text}</pre>
          </div>
          <aside>
            <Label>Use it from code</Label>
            <p className="text-[14px]">Paste the context into a system prompt, or fetch it on demand.</p>
            <pre className="mono mt-4 overflow-auto rounded-md bg-scrim p-4 text-[12px] leading-relaxed text-white/90">{`curl -X POST $BRANDMELD/api/context \\\n  -H "content-type: application/json" \\\n  -H "cookie: bm_session=…" \\\n  -d '{"url":"${d.brand.url}"}'`}</pre>
            <p className="meta mt-3">Also: <span className="mono">/api/extract</span> for the full Brand DNA and <span className="mono">/api/guide</span> for presentation data.</p>
          </aside>
        </div>
      )}
      {tab === "json" && (
        <div className="pb-24 fade-in">
          <div className="flex gap-3"><button className="btn" onClick={() => copy("JSON", json)}>Copy</button><button className="btn btn-ghost" onClick={() => download(`${slug(name)}-brand-dna.json`, json)}>Download JSON</button></div>
          <pre className="mono mt-6 max-h-[72vh] overflow-auto rounded-md bg-warm p-6 text-ink-soft">{json}</pre>
        </div>
      )}

      {tab === "guide" && (
        <div className="grid gap-12 pb-24 fade-in lg:grid-cols-[170px_1fr]">
          <nav className="hidden lg:block" aria-label="Sections">
            <ul className="sticky top-24 space-y-1 border-l border-hairline-soft">
              {sections.map(([k, l]) => <li key={k}><a href={`#${k}`} className={"-ml-px block border-l py-1.5 pl-4 text-[14px] " + (active === k ? "border-ink font-semibold text-ink" : "border-transparent text-slate hover:text-ink")}>{l}</a></li>)}
            </ul>
          </nav>
          <div className="min-w-0 max-w-[880px]">
            <nav className="-mx-6 mb-8 flex gap-5 overflow-x-auto border-b border-hairline-soft px-6 pb-3 lg:hidden" aria-label="Sections">
              {sections.map(([k, l]) => <a key={k} href={`#${k}`} className="shrink-0 text-[13px] font-semibold text-slate">{l}</a>)}
            </nav>
            <Section id="overview" eyebrow="Overview" title={g.overview.tagline ?? name}>
              {g.overview.positioning && <p className="subtitle max-w-2xl">{g.overview.positioning}</p>}
              <dl className="mt-10 grid grid-cols-2 border-y border-hairline-soft md:grid-cols-4">
                {[["Pages read", String(g.overview.pages_explored)], ["Colours", hasColour ? String(sw.length) : "n/a"], ["Typefaces", hasType ? String(fonts.length) : "n/a"], ["Overall confidence", pct(g.overview.confidence)]].map(([k, v], i) => (
                  <div key={k} className={"py-5 " + (i > 0 ? "md:border-l md:border-hairline-soft md:pl-6" : "")}><dt className="micro">{k}</dt><dd className="mt-1 text-[28px] text-ink" style={{ letterSpacing: "-0.6px" }}>{v}</dd></div>
                ))}
              </dl>
            </Section>

            {(g.logo.primary || g.logo.favicon) && (
              <Section id="logo" eyebrow="Logo" title="Mark">
                {g.logo.primary && <LogoTile src={g.logo.primary} label="Primary" />}
                {(g.logo.variants.length > 0 || g.logo.favicon) && (
                  <div className="mt-6 flex flex-wrap items-end gap-6">
                    {g.logo.variants.map((v: string, i: number) => <LogoTile key={i} src={v} label={`Variant ${i + 1}`} small />)}
                    {g.logo.favicon && <LogoTile src={g.logo.favicon} label="Favicon" small />}
                  </div>
                )}
              </Section>
            )}

            <Section id="colour" eyebrow="Colour system" title="Colour" aside={hasColour ? <span className="meta">Click a swatch to copy its HEX</span> : null}>
              {hasColour ? (
                <>
                  <div className="flex h-36 overflow-hidden rounded-lg border border-hairline-soft md:h-44">
                    {sw.slice(0, 6).map((c, i) => (
                      <button key={i} onClick={() => copy(c.hex, c.hex)} className="group flex min-w-0 items-end p-3 text-left transition-[flex] duration-300 hover:!flex-[2]" style={{ background: c.hex, color: onColor(c.hex), flex: i === 0 ? 3 : 1 }} title={`${c.role} ${c.hex}`}>
                        <span className="mono truncate text-[12px] opacity-90">{c.hex}</span>
                      </button>
                    ))}
                  </div>
                  <table className="mt-8 w-full text-left text-[14px]">
                    <thead><tr className="micro"><th className="pb-2 font-normal">Role</th><th className="pb-2 font-normal">HEX</th><th className="hidden pb-2 font-normal sm:table-cell">RGB</th><th className="hidden pb-2 font-normal md:table-cell">Seen in</th><th className="pb-2 text-right font-normal">Confidence</th></tr></thead>
                    <tbody>
                      {sw.map((c, i) => (
                        <tr key={i} className="border-t border-hairline-soft">
                          <td className="py-3"><span className="flex items-center gap-3"><span className="h-5 w-5 shrink-0 rounded-sm border border-hairline-soft" style={{ background: c.hex }} /><span className="text-ink">{c.role}</span></span></td>
                          <td><button className="mono text-ink underline-offset-4 hover:underline" onClick={() => copy(c.hex, c.hex)}>{c.hex}</button></td>
                          <td className="mono hidden text-slate sm:table-cell">{c.rgb.replace("rgb(", "").replace(")", "")}</td>
                          <td className="hidden text-slate md:table-cell">{c.found_in.join(", ")}</td>
                          <td className="text-right"><Meter v={c.confidence} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {g.colors.gradients.length > 0 && <div className="mt-8"><Label>Gradients</Label>{g.colors.gradients.map((x: string, i: number) => <div key={i} className="mt-2"><div className="h-10 rounded-md border border-hairline-soft" style={{ background: x }} /></div>)}</div>}
                </>
              ) : <Missing what="colours" />}
            </Section>

            <Section id="type" eyebrow="Typography" title="Type">
              {hasType ? (
                <>
                  <div className="grid gap-px overflow-hidden rounded-lg border border-hairline-soft bg-hairline-soft sm:grid-cols-2">
                    {[["Heading", g.typography.heading], ["Body", g.typography.body]].map(([l, f]) => f && (
                      <div key={l as string} className="bg-canvas p-6">
                        <div className="micro">{l}</div>
                        <div className="mt-6 text-[64px] leading-none text-ink" style={{ letterSpacing: "-1.5px" }}>Aa</div>
                        <div className="h-sm mt-5">{f}</div>
                        {g.typography.weights.length > 0 && <div className="mono mt-1 text-slate">{g.typography.weights.join(" · ")}</div>}
                      </div>
                    ))}
                  </div>
                  {g.typography.mono && <p className="mt-5"><span className="micro mr-3">Code</span><span className="mono text-ink">{g.typography.mono}</span></p>}
                  {g.typography.hierarchy.length > 0 && (
                    <div className="mt-8">
                      <Label>Hierarchy, as measured</Label>
                      <div className="border-t border-hairline-soft">
                        {g.typography.hierarchy.map((h: any) => {
                          const px = Math.min(parseFloat(h.size) || 16, 56);
                          return (
                            <div key={h.level} className="grid grid-cols-[48px_1fr_auto] items-baseline gap-4 border-b border-hairline-soft py-4">
                              <span className="mono text-slate">{h.level}</span>
                              <span className="truncate text-ink" style={{ fontSize: px, fontWeight: parseInt(h.weight) || 400, lineHeight: 1.15 }}>{h.level === "p" ? "Body copy sets the reading rhythm" : "The headline sets the tone"}</span>
                              <span className="mono text-slate">{h.size}{h.weight ? ` / ${h.weight}` : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="meta mt-2">Sizes and weights are measured; the sample text is set in this app’s typeface.</p>
                    </div>
                  )}
                  {g.visual_style.length > 0 && <div className="mt-10"><Label>Visual style</Label><Rows items={g.visual_style} /></div>}
                </>
              ) : <Missing what="typefaces" />}
            </Section>

            <Section id="voice" eyebrow="Voice" title="How it sounds">
              <p className="text-[28px] leading-tight text-ink md:text-[34px]" style={{ letterSpacing: "-0.8px" }}>{g.voice.traits.join(" / ")}</p>
              <div className="mt-8"><Rows items={g.voice.style} /></div>
              <div className="mt-12 grid gap-10 md:grid-cols-2">
                <div><Label>Do</Label><Rows items={g.voice.dos} numbered /></div>
                <div><Label>Don’t</Label><Rows items={g.voice.donts} numbered /></div>
              </div>
            </Section>

            <Section id="messaging" eyebrow="Messaging" title="What it says">
              {g.messaging.tagline && <><Label>Tagline</Label><p className="display !text-[34px] md:!text-[44px]">{g.messaging.tagline}</p></>}
              {g.messaging.positioning && <><div className="mt-10"><Label>Positioning</Label></div><p className="max-w-2xl text-[18px] leading-relaxed text-ink-soft">{g.messaging.positioning}</p></>}
              {g.messaging.value_propositions.length > 0 && <div className="mt-10"><Label>Value propositions</Label><Rows items={g.messaging.value_propositions} numbered /></div>}
              {g.messaging.pillars.length > 0 && <div className="mt-10"><Label>Pillars</Label><Rows items={g.messaging.pillars} /></div>}
              {g.messaging.ctas.length > 0 && <div className="mt-10"><Label>Calls to action</Label><div className="flex flex-wrap gap-2">{g.messaging.ctas.map((c: string) => <span key={c} className="rounded-full border border-ink px-4 py-1.5 text-[13px] font-semibold text-ink">{c}</span>)}</div></div>}
              {g.messaging.terminology.length > 0 && <div className="mt-10"><Label>Recurring terms</Label><div className="flex flex-wrap gap-2">{g.messaging.terminology.map((c: string) => <span key={c} className="tag !normal-case !tracking-normal !text-[12px]">{c}</span>)}</div></div>}
            </Section>

            <Section id="evidence" eyebrow="Evidence" title="Where it came from" aside={<button className="link" onClick={() => document.querySelectorAll<HTMLDetailsElement>("#evidence details").forEach((x) => (x.open = true))}>Expand all</button>}>
              <div className="border-t border-hairline-soft">
                {g.evidence.map((e: any, i: number) => (
                  <details key={i} className="group border-b border-hairline-soft">
                    <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-4 py-4 md:grid-cols-[150px_1fr_auto]">
                      <span className="micro hidden md:block">{e.property}</span>
                      <span className="flex min-w-0 items-center gap-3">{/^#[0-9A-F]{6}$/i.test(e.value) && <span className="h-4 w-4 shrink-0 rounded-sm border border-hairline-soft" style={{ background: e.value }} />}<span className="truncate text-ink">{e.property === "logo" ? "Brand mark" : String(e.value).slice(0, 110)}</span></span>
                      <Meter v={e.confidence} />
                    </summary>
                    <ul className="mb-4 space-y-3 pl-0 md:pl-[166px]">{e.sources.map((s: Src, j: number) => <li key={j} className="text-[13px]"><span className="mono break-all text-slate">{s.url}</span><br /><span className="text-graphite">{s.reason}</span></li>)}</ul>
                  </details>
                ))}
              </div>
              <details className="mt-8"><summary className="link cursor-pointer list-none">Pages read ({g.pages.length})</summary><ul className="mono mt-3 space-y-1 text-slate">{g.pages.map((p: any) => <li key={p.url} className="break-all"><span className="mr-2 text-ink">{p.kind}</span>{p.url}</li>)}</ul></details>
              <details className="mt-4"><summary className="link cursor-pointer list-none">Validation ({dna.validation.checks.filter((c: any) => c.status === "pass").length} passed, {dna.validation.checks.filter((c: any) => c.status !== "pass").length} flagged)</summary><ul className="mono mt-3 space-y-1 text-slate">{dna.validation.checks.map((c: any, i: number) => <li key={i}><span className="mr-2 text-ink">{c.status}</span>{c.detail}</li>)}{g.warnings.map((w: string, i: number) => <li key={"w" + i}><span className="mr-2 text-ink">note</span>{w}</li>)}</ul></details>
            </Section>
          </div>
        </div>
      )}
      <div aria-live="polite" className={"pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 " + (toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}>{toast || "·"}</div>
      {dialog}
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <div className="rounded-lg border border-dashed border-hairline-soft p-6"><p className="text-ink">No {what} were measured for this site.</p><p className="meta mt-1">Visual details come from rendering the live page in a TinyFish browser. Re-analyse once that is available on your account.</p></div>;
}

function LogoTile({ src, label, dark, small }: { src: string; label: string; dark?: boolean; small?: boolean }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return (
    <figure className={small ? "w-28" : ""}>
      <div className={(small ? "h-20 " : "h-40 ") + "flex items-center justify-center rounded-lg border border-hairline-soft p-6 " + (dark ? "bg-scrim" : "bg-warm")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className={"max-h-full max-w-full object-contain " + (dark ? "[filter:invert(1)_grayscale(1)_brightness(1.8)]" : "")} onError={() => setBad(true)} referrerPolicy="no-referrer" />
      </div>
      <figcaption className="micro mt-2">{label}</figcaption>
    </figure>
  );
}
