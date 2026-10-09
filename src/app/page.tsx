import Link from "next/link";
import ExploreForm from "@/components/ExploreForm";
import HeroArt from "@/components/HeroArt";
import Reveal from "@/components/Reveal";
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/db";

export const dynamic = "force-dynamic";

const OUTPUTS: [string, string, React.ReactNode][] = [
  ["Logo", "The mark that belongs to the site, from its own header, not the partner logos beside it.",
    <div key="l" className="flex h-full items-center justify-center"><div className="h-10 w-10 rounded-full border-[6px] border-ink" /><div className="ml-3 h-3 w-16 bg-ink" /></div>],
  ["Colour", "Primary, supporting and surface colours, weighted by what the page actually paints.",
    <div key="c" className="flex h-full overflow-hidden rounded-sm"><i className="flex-[3] bg-ink" /><i className="flex-1 bg-slate" /><i className="flex-1 bg-stone" /><i className="flex-1 bg-hairline" /></div>],
  ["Type", "Heading and body faces, weights and the size hierarchy, measured in a real browser.",
    <div key="t" className="flex h-full items-end gap-4"><span className="text-[56px] leading-none text-ink" style={{ letterSpacing: "-2px" }}>Aa</span><span className="mono pb-1 text-slate">400 · 600</span></div>],
  ["Voice", "Tone, writing habits and a do and don’t list taken from how the copy is written.",
    <div key="v" className="flex h-full flex-col justify-end gap-1.5"><i className="h-2 w-full bg-ink" /><i className="h-2 w-4/5 bg-stone" /><i className="h-2 w-3/5 bg-hairline-soft" /></div>],
  ["Evidence", "Every finding keeps the pages it came from and a confidence score.",
    <div key="e" className="flex h-full flex-col justify-end gap-3"><div className="h-[3px] bg-hairline"><i className="block h-full w-[92%] bg-ink" /></div><div className="h-[3px] bg-hairline"><i className="block h-full w-[64%] bg-ink" /></div><div className="h-[3px] bg-hairline"><i className="block h-full w-[78%] bg-ink" /></div></div>],
];

const STEPS: [string, string, string][] = [
  ["TinyFish Fetch", "Reads the live site", "Starts at the homepage, follows the links that matter (about, product, pricing, careers) and reads each page. It does not crawl everything."],
  ["TinyFish Browser", "Renders and measures", "Opens the page in a real browser and reads computed styles, so colours and fonts come from what is painted, not from guesses in the markup."],
  ["Gemini", "Reads the writing", "Interprets tone, positioning and messaging from the copy, and has to quote the site for anything it claims."],
  ["Validator", "Removes what isn’t supported", "Claims that can’t be found on the site are dropped, conflicts are flagged, and everything left gets a confidence score."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const user = await currentUser();
  const mine = user ? await store.listBrands(user.id, 4) : [];
  const recent = mine.map((r) => ({ id: r.id, name: r.name, url: r.url, primary: r.dna ? (JSON.parse(r.dna).colors?.primary?.hex as string | undefined) ?? null : null }));

  // The hero specimen shows the signed-in user's latest real brand when there is one.
  let real: { name: string; colors: string[]; font: string | null; tone: string[]; conf: [string, number][] } | null = null;
  if (mine[0]?.dna) {
    const d = JSON.parse(mine[0].dna);
    const colors = [d.colors?.primary?.hex, ...(d.colors?.secondary ?? []).map((c: any) => c.hex), ...(d.colors?.accent ?? []).map((c: any) => c.hex), ...(d.colors?.background ?? []).map((c: any) => c.hex)].filter(Boolean);
    if (colors.length >= 2) real = { name: mine[0].name, colors: [...new Set(colors)] as string[], font: d.typography?.heading?.value ?? d.typography?.body?.value ?? null, tone: d.voice?.tone?.value ?? [], conf: ([["Primary colour", d.colors?.primary?.confidence], ["Typeface", d.typography?.heading?.confidence ?? d.typography?.body?.confidence], ["Tagline", d.messaging?.tagline?.confidence]] as [string, number | undefined][]).filter((x): x is [string, number] => typeof x[1] === "number") };
  }

  return (
    <>
      <section id="top" className="relative overflow-hidden bg-scrim text-white">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-14 px-6 pb-16 pt-14 md:px-12 md:pb-[88px] md:pt-[88px] lg:min-h-[680px] lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="eyebrow !text-white/60">Brand DNA from the live web</div>
            <h1 className="display mt-5 !text-white md:!text-[68px]" style={{ letterSpacing: "-2.2px" }}>Turn any website into a brand system.</h1>
            <p className="subtitle mt-6 max-w-[500px] !text-white/70">BrandMeld explores the live web and reconstructs the visual and verbal DNA behind a company.</p>
            <div className="mt-10 max-w-[600px]"><ExploreForm dark initial={url ?? ""} /></div>
            {recent.length > 0 && (
              <div className="mt-12 max-w-[600px] border-t border-white/15 pt-5">
                <div className="micro !text-white/50">Pick up where you left off</div>
                <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {recent.slice(0, 4).map((b) => (
                    <Link key={b.id} href={`/brands/${b.id}`} className="group flex items-center gap-3">
                      <span className="h-6 w-6 shrink-0 rounded-sm border border-white/20" style={{ background: b.primary ?? "#3a3a3a" }} />
                      <span className="min-w-0"><span className="block truncate text-[15px] text-white group-hover:underline">{b.name}</span><span className="block truncate text-[12px] text-white/50">{b.url.replace(/^https?:\/\//, "")}</span></span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="hidden lg:block"><HeroArt real={real} /></div>
        </div>
        <div className="relative overflow-hidden border-t border-white/10 py-4">
          <div className="marquee flex w-max gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[.2px] text-white/35">
            {[0, 1].map((k) => <div key={k} className="flex gap-10">{["logo", "colour", "typography", "tone of voice", "tagline", "value propositions", "calls to action", "design tokens", "evidence", "confidence"].map((w) => <span key={w + k}>{w} <span className="ml-10 text-white/20">/</span></span>)}</div>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 md:px-12 md:py-[96px]">
        <div className="eyebrow">What you get</div>
        <h2 className="h-md mt-3 max-w-[640px]">A brand guide for people, and the same facts as data for agents.</h2>
        <Reveal><div className="mt-12 grid border-t border-hairline-soft sm:grid-cols-2 lg:grid-cols-5">
          {OUTPUTS.map(([t, d, v], i) => (
            <div key={t} className={"flex flex-col border-b border-hairline-soft py-6 sm:pr-6 lg:border-b-0 lg:px-6 " + (i === 0 ? "lg:pl-0" : "lg:border-l lg:border-hairline-soft")}>
              <div className="h-24">{v}</div>
              <h3 className="h-sm mt-6">{t}</h3>
              <p className="mt-2 text-[14px]">{d}</p>
            </div>
          ))}
        </div></Reveal>
      </section>

      <section className="bg-warm">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-16 md:px-12 md:py-[96px] lg:grid-cols-[5fr_7fr]">
          <div>
            <div className="eyebrow">How it explores</div>
            <h2 className="h-md mt-3">Four steps, each one checkable.</h2>
            <p className="mt-5 max-w-[420px]">Nothing is looked up from memory. If the site doesn’t say it, or the browser can’t measure it, it isn’t in the result.</p>
          </div>
          <Reveal delay={120}><ol className="border-t border-hairline-soft">
            {STEPS.map(([who, what, text], i) => (
              <li key={who} className="grid grid-cols-[40px_1fr] gap-4 border-b border-hairline-soft py-6 sm:grid-cols-[40px_170px_1fr]">
                <span className="mono pt-1 text-slate">{String(i + 1).padStart(2, "0")}</span>
                <div><div className="micro">{who}</div><div className="h-sm mt-1.5 !text-[20px]">{what}</div></div>
                <p className="col-span-2 text-[15px] sm:col-span-1">{text}</p>
              </li>
            ))}
          </ol></Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-12 px-6 py-16 md:px-12 md:py-[96px] lg:grid-cols-[5fr_7fr]">
        <div>
          <div className="eyebrow">For agents and apps</div>
          <h2 className="h-md mt-3">One stable schema, three endpoints.</h2>
          <p className="mt-5 max-w-[420px]">The same Brand DNA shape comes back for every company. Ask for the full record, the presentation data, or ready-to-paste context for a prompt.</p>
          <ul className="mono mt-8 space-y-2 text-ink-soft"><li>POST /api/extract <span className="text-slate">brand DNA</span></li><li>POST /api/guide <span className="text-slate">guide data</span></li><li>POST /api/context <span className="text-slate">agent context</span></li></ul>
        </div>
        <pre className="mono overflow-auto rounded-lg bg-scrim p-6 leading-relaxed text-white/85">{`{
  "schema_version": "1.0",
  "brand":      { "name", "url", "tagline" },
  "colors":     { "primary": { "hex", "rgb", "confidence", "evidence": [ … ] }, … },
  "typography": { "heading", "body", "weights", "hierarchy" },
  "logo":       { "primary", "variants", "favicon" },
  "voice":      { "tone", "dos", "donts", "terminology" },
  "messaging":  { "tagline", "positioning", "value_propositions", "ctas" },
  "design_tokens": { "color.primary": "…", "font.heading": "…" },
  "confidence": { "overall", "by_section" },
  "validation": { "checks": [ … ] }
}`}</pre>
      </section>

      <section className="bg-footer text-white">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center md:px-12">
          <h2 className="h-md !text-white md:max-w-[560px]">Start with one URL.</h2>
          <a href="#top" className="btn btn-dark">Explore a brand</a>
        </div>
      </section>
    </>
  );
}
