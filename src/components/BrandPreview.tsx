"use client";
import { useEffect, useMemo, useState } from "react";

// Renders sample pages using only the extracted Brand DNA (tokens + real copy), so you can see
// what a site built from the AI context would look like.
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const readable = (bg: string, pref: string[], fallbackDark = "#0a0a0a") => pref.find((c) => contrast(c, bg) >= 4.5) ?? (lum(bg) > 0.4 ? fallbackDark : "#ffffff");
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (s: string, n: number) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);

type Mode = "light" | "dark";
type View = "product" | "bold" | "editorial" | "components";

export default function BrandPreview({ dna }: { dna: any }) {
  const [mode, setMode] = useState<Mode>("light");
  const [view, setView] = useState<View>("product");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [copied, setCopied] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  const t = useMemo(() => {
    const c = dna.colors;
    const hexes = (xs: any[]) => (xs ?? []).map((x) => x.hex as string);
    const bgs = hexes(c.background), texts = hexes(c.text);
    const lightBg = [...bgs].sort((a, b) => lum(b) - lum(a)).find((x) => lum(x) > 0.6) ?? "#ffffff";
    const darkBg = [...bgs].sort((a, b) => lum(a) - lum(b)).find((x) => lum(x) < 0.12) ?? "#0b0b0f";
    const bg = mode === "light" ? lightBg : darkBg;
    const primary: string = c.primary?.hex ?? (mode === "light" ? "#0a0a0a" : "#ffffff");
    const accent: string = c.accent?.[0]?.hex ?? c.secondary?.[0]?.hex ?? primary;
    const base = [...texts, mode === "light" ? "#0a0a0a" : "#ffffff"];
    const text = readable(bg, base);
    const strong = base.filter((x) => contrast(x, bg) >= 4.5).sort((a, b) => contrast(b, bg) - contrast(a, bg))[0] ?? text;
    const muted = mix(text, bg, 0.4);
    const surface = mix(bg, text, mode === "light" ? 0.045 : 0.08);
    const border = mix(bg, text, 0.15);
    const btnBg = contrast(primary, bg) >= 1.8 ? primary : text;
    const btnText = readable(btnBg, ["#ffffff", "#0a0a0a"]);
    const pats: string[] = (dna.visual_identity?.patterns ?? []).map((p: any) => p.value as string);
    const radiusTxt = pats.find((p) => /radius|pill/i.test(p)) ?? "";
    const radius = /pill/i.test(radiusTxt) ? 999 : Math.min(24, parseFloat(radiusTxt.match(/(\d+(\.\d+)?)px/)?.[1] ?? "8") || 8);
    const heading: string | null = dna.typography?.heading?.value ?? dna.typography?.body?.value ?? null;
    const body: string | null = dna.typography?.body?.value ?? heading;
    const w = dna.typography?.weights?.value as number[] | undefined;
    return {
      bg, primary, accent, text, strong, muted, surface, border, btnBg, btnText, radius,
      cardRadius: radius >= 999 ? 20 : Math.min(radius + 4, 24),
      soft: pats.some((p) => /soft shadow/i.test(p)),
      upper: pats.some((p) => /uppercase/i.test(p)),
      tight: pats.some((p) => /negative letter-spacing/i.test(p)),
      heading, body, headW: w?.length && w.some((x) => x >= 600) && !w.every((x) => x <= 500) ? 600 : w?.includes(500) ? 500 : 400,
    };
  }, [dna, mode]);

  // Load the brand's fonts when they exist on Google Fonts; otherwise the system sans stack is used.
  useEffect(() => {
    for (const f of [t.heading, t.body]) {
      if (!f || !/^[A-Za-z0-9 ]+$/.test(f)) continue;
      const id = "bm-font-" + f.replace(/ /g, "-");
      if (document.getElementById(id)) continue;
      const l = document.createElement("link"); l.id = id; l.rel = "stylesheet";
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700&display=swap`;
      document.head.appendChild(l);
    }
  }, [t.heading, t.body]);

  const name: string = dna.brand.name;
  const tagline: string = dna.messaging.tagline?.value ?? dna.brand.tagline ?? name;
  const positioning: string = dna.messaging.positioning?.value ?? "";
  const ctas: string[] = (dna.messaging.ctas ?? []).map((x: any) => x.value as string);
  const cta1 = cap(ctas[0] ?? "Get started"), cta2 = cap(ctas[1] ?? "Learn more");
  const vps: string[] = (dna.messaging.value_propositions ?? []).map((x: any) => x.value as string);
  const pillars: string[] = (dna.messaging.pillars ?? []).map((x: any) => x.value as string);
  const feats = (vps.length >= 3 ? vps : [...vps, ...pillars]).slice(0, 3);
  const terms: string[] = (dna.voice.terminology ?? []).map((x: any) => x.value as string).slice(0, 8);
  const tone: string[] = dna.voice.tone.value ?? [];
  const kinds = [...new Set((dna.evidence.pages as any[]).map((p) => p.kind).filter((k) => k && k !== "home" && k !== "other"))] as string[];
  const nav = (kinds.length ? kinds : ["product", "about"]).slice(0, 4).map(cap);
  const logo: string | null = dna.logo?.primary?.value ?? null;
  const mobile = device === "mobile";

  const font = (f: string | null) => (f ? `"${f}", ` : "") + 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const H = (size: number, color = t.strong): React.CSSProperties => ({ fontFamily: font(t.heading), fontWeight: t.headW, fontSize: size, lineHeight: 1.04, letterSpacing: t.tight ? "-0.035em" : "-0.015em", color });
  const eyebrow = (color = t.muted): React.CSSProperties => ({ fontSize: 12, letterSpacing: "0.09em", textTransform: t.upper ? "uppercase" : "none", color, fontWeight: 600 });
  const btn = (primary: boolean, o: { bg?: string; fg?: string } = {}): React.CSSProperties => ({ background: primary ? o.bg ?? t.btnBg : "transparent", color: primary ? o.fg ?? t.btnText : o.fg ?? t.text, border: `1px solid ${primary ? o.bg ?? t.btnBg : o.fg ? alpha(o.fg, 0.4) : t.border}`, borderRadius: t.radius, padding: "12px 22px", fontSize: 14, fontWeight: 600, fontFamily: font(t.body), cursor: "default", display: "inline-block", whiteSpace: "nowrap" });
  const card: React.CSSProperties = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.cardRadius, padding: 24, boxShadow: t.soft ? `0 18px 40px -22px ${mix(t.bg, "#000000", 0.6)}` : "none" };

  const cssVars = `:root {\n  --brand-primary: ${t.primary};\n  --brand-accent: ${t.accent};\n  --brand-bg: ${t.bg};\n  --brand-text: ${t.text};\n  --brand-surface: ${t.surface};\n  --brand-border: ${t.border};\n  --brand-radius: ${t.radius >= 999 ? "9999px" : t.radius + "px"};\n  --font-heading: ${font(t.heading)};\n  --font-body: ${font(t.body)};\n}`;

  const Brand = ({ color = t.strong }: { color?: string }) => (logo && logoOk
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={logo} alt={name} onError={() => setLogoOk(false)} referrerPolicy="no-referrer" style={{ height: 26, maxWidth: 150, objectFit: "contain", filter: lum(color) > 0.8 && lum(t.bg) < 0.5 ? "brightness(0) invert(1)" : "none" }} />
    : <span style={{ ...H(22, color), fontWeight: 600 }}>{name}</span>);

  // A generic product window built from tokens, with real copy as the row labels.
  const AppWindow = () => {
    const rows = (feats.length ? feats : [tagline]).slice(0, 3);
    const bars = [38, 62, 48, 80, 58, 92, 70];
    return (
      <div style={{ ...card, padding: 0, overflow: "hidden", boxShadow: `0 40px 80px -30px ${alpha(t.primary, 0.45)}, 0 0 0 1px ${t.border}` }}>
        <div className="flex items-center gap-2" style={{ borderBottom: `1px solid ${t.border}`, padding: "10px 14px" }}>
          {[0, 1, 2].map((i) => <i key={i} style={{ width: 8, height: 8, borderRadius: 99, background: t.border }} />)}
          <span style={{ marginLeft: 10, fontSize: 11, color: t.muted }}>{name}</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: mobile ? "1fr" : "120px 1fr" }}>
          {!mobile && (
            <div style={{ borderRight: `1px solid ${t.border}`, padding: 14 }} className="space-y-2.5">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-2"><i style={{ width: 10, height: 10, borderRadius: Math.min(t.radius, 4), background: i === 0 ? t.primary : alpha(t.text, 0.18) }} /><i style={{ height: 6, flex: 1, borderRadius: 3, background: i === 0 ? alpha(t.text, 0.5) : alpha(t.text, 0.12) }} /></div>)}
            </div>
          )}
          <div style={{ padding: 18 }}>
            <div className="flex items-end justify-between">
              <div><div style={{ fontSize: 11, color: t.muted }}>{cap(kinds[0] ?? "overview")}</div><div style={{ ...H(26), lineHeight: 1.1 }}>{terms[0] ? cap(terms[0]) : name}</div></div>
              <span style={{ ...btn(true), padding: "6px 12px", fontSize: 12 }}>{cta1}</span>
            </div>
            <div className="mt-5 flex items-end gap-2" style={{ height: 88 }}>
              {bars.map((h, i) => <i key={i} style={{ flex: 1, height: `${h}%`, borderRadius: Math.min(t.radius, 6), background: i === 5 ? t.primary : i === 3 ? t.accent : alpha(t.text, 0.14) }} />)}
            </div>
            <div className="mt-5 space-y-2.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10, fontSize: 12.5, color: t.text }}>
                  <span className="truncate">{short(r, 44)}</span>
                  <span style={{ border: `1px solid ${t.border}`, borderRadius: 99, padding: "2px 9px", fontSize: 10.5, color: i === 0 ? t.btnText : t.muted, background: i === 0 ? t.btnBg : "transparent", whiteSpace: "nowrap" }}>{tone[i] ?? terms[i + 1] ?? "Active"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Glyph = ({ i }: { i: number }) => {
    const c = [t.primary, t.accent, t.text][i % 3];
    const s = { width: 40, height: 40, background: alpha(c, 0.14), borderRadius: Math.min(t.radius + 2, 14), display: "grid", placeItems: "center" } as const;
    return (
      <div style={s}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          {i % 3 === 0 && <><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2" fill={c} /></>}
          {i % 3 === 1 && <path d="M3 15 L10 4 L17 15 Z" />}
          {i % 3 === 2 && <><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M3.5 10h13" /></>}
        </svg>
      </div>
    );
  };

  const Footer = () => (
    <div style={{ borderTop: `1px solid ${t.border}`, padding: mobile ? "28px 20px" : "36px 48px", fontSize: 13, color: t.muted }} className="flex flex-wrap items-center justify-between gap-4">
      <Brand /><span>{short(tagline, 70)}</span><span>{nav.join("  ·  ")}</span>
    </div>
  );

  return (
    <div className="pb-24 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Seg label="Style" value={view} onChange={setView} options={[["product", "Product"], ["bold", "Bold"], ["editorial", "Editorial"], ["components", "Kit"]]} />
          <Seg label="Canvas" value={mode} onChange={setMode} options={[["light", "Light"], ["dark", "Dark"]]} />
          <Seg label="Device" value={device} onChange={setDevice} options={[["desktop", "Desktop"], ["mobile", "Mobile"]]} />
        </div>
        <button className="link" onClick={async () => { await navigator.clipboard.writeText(cssVars); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Copied" : "Copy as CSS variables"}</button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_250px]">
        <div className="overflow-hidden rounded-lg border border-hairline-soft bg-cool shadow-[0_30px_70px_-40px_rgba(0,0,0,.35)]">
          <div className="flex items-center gap-3 border-b border-hairline-soft bg-canvas px-4 py-2.5">
            <span className="flex gap-1.5">{[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-hairline-soft" />)}</span>
            <span className="mono flex-1 truncate rounded-full bg-warm px-3 py-1 text-center text-[11px] text-slate">{dna.brand.domain}</span>
          </div>
          <div className={mobile ? "flex justify-center bg-cool py-6" : ""}>
            <div key={view + mode + device} className="fade-in" style={{ background: t.bg, color: t.text, fontFamily: font(t.body), width: mobile ? 390 : "auto", maxWidth: "100%", minHeight: 560 }}>

              {/* nav (the bold style sits on the brand colour) */}
              {(() => {
                const onBold = view === "bold";
                const bg = onBold ? t.btnBg : "transparent", fg = onBold ? t.btnText : t.strong;
                return (
                  <div style={{ background: bg, borderBottom: onBold ? "none" : `1px solid ${t.border}`, padding: mobile ? "14px 20px" : "18px 48px" }} className="flex items-center justify-between">
                    <Brand color={fg} />
                    {!mobile && <div className="flex gap-7" style={{ fontSize: 14, color: onBold ? alpha(fg, 0.75) : t.muted }}>{nav.map((n) => <span key={n}>{n}</span>)}</div>}
                    <span style={onBold ? btn(true, { bg: fg, fg: t.btnBg }) : { ...btn(true), padding: "9px 18px" }}>{cta1}</span>
                  </div>
                );
              })()}

              {view === "product" && (
                <>
                  <div style={{ position: "relative", overflow: "hidden", padding: mobile ? "44px 20px 40px" : "84px 48px 72px", backgroundImage: `radial-gradient(60% 55% at 85% 0%, ${alpha(t.primary, mode === "dark" ? 0.28 : 0.16)}, transparent 70%), radial-gradient(40% 45% at 0% 20%, ${alpha(t.accent, mode === "dark" ? 0.18 : 0.1)}, transparent 70%)` }}>
                    <div className="grid items-center gap-12" style={{ gridTemplateColumns: mobile ? "1fr" : "1.05fr 0.95fr" }}>
                      <div>
                        <span style={{ ...eyebrow(t.strong), border: `1px solid ${t.border}`, borderRadius: 99, padding: "5px 12px", background: alpha(t.bg, 0.6), display: "inline-block" }}>{terms[0] ? cap(terms[0]) : name}</span>
                        <h1 style={{ ...H(mobile ? 38 : 64), marginTop: 20 }}>{tagline}</h1>
                        {positioning && <p style={{ marginTop: 22, fontSize: mobile ? 16 : 18, lineHeight: 1.55, color: t.muted, maxWidth: 520 }}>{short(positioning, 190)}</p>}
                        <div className="mt-8 flex flex-wrap gap-3"><span style={btn(true)}>{cta1}</span><span style={btn(false)}>{cta2}</span></div>
                        {tone.length > 0 && <div className="mt-8 flex flex-wrap gap-2">{tone.slice(0, 4).map((x) => <span key={x} style={{ fontSize: 12, color: t.muted, border: `1px solid ${t.border}`, borderRadius: 99, padding: "3px 11px" }}>{x}</span>)}</div>}
                      </div>
                      <AppWindow />
                    </div>
                  </div>
                  {terms.length > 3 && (
                    <div style={{ borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, padding: "16px 0", overflow: "hidden", background: t.surface }}>
                      <div className="marquee flex w-max gap-12 whitespace-nowrap" style={{ fontSize: 13, color: t.muted, ...(t.upper ? { textTransform: "uppercase", letterSpacing: ".08em" } : {}) }}>
                        {[0, 1].map((k) => <div key={k} className="flex gap-12">{terms.map((w) => <span key={w + k}>{w}</span>)}</div>)}
                      </div>
                    </div>
                  )}
                  {feats.length > 0 && (
                    <div style={{ padding: mobile ? "48px 20px" : "88px 48px" }}>
                      <div style={eyebrow()}>Why {name}</div>
                      <h2 style={{ ...H(mobile ? 28 : 40), marginTop: 12, maxWidth: 620 }}>{short(pillars[0] ?? feats[0], 80)}</h2>
                      <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: mobile ? "1fr" : `repeat(${feats.length}, 1fr)` }}>
                        {feats.map((f, i) => (
                          <div key={i} style={card} className="transition-transform duration-300 hover:-translate-y-1">
                            <Glyph i={i} />
                            <div style={{ ...H(19), marginTop: 22, lineHeight: 1.25 }}>{short(f, 72)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ margin: mobile ? "0 20px 48px" : "0 48px 72px", borderRadius: t.cardRadius + 4, background: t.btnBg, color: t.btnText, padding: mobile ? "36px 24px" : "56px 52px" }} className="flex flex-wrap items-center justify-between gap-6">
                    <div style={{ ...H(mobile ? 26 : 38, t.btnText), maxWidth: 520 }}>{short(tagline, 70)}</div>
                    <span style={btn(true, { bg: t.btnText, fg: t.btnBg })}>{cta1}</span>
                  </div>
                  <Footer />
                </>
              )}

              {view === "bold" && (
                <>
                  <div style={{ background: t.btnBg, color: t.btnText, padding: mobile ? "36px 20px 56px" : "72px 48px 96px" }}>
                    <div style={eyebrow(alpha(t.btnText, 0.7))}>{name}</div>
                    <h1 style={{ ...H(mobile ? 46 : 104, t.btnText), marginTop: 16, letterSpacing: "-0.045em", lineHeight: 0.95 }}>{tagline}</h1>
                    {positioning && <p style={{ marginTop: 28, fontSize: mobile ? 16 : 20, lineHeight: 1.5, maxWidth: 560, color: alpha(t.btnText, 0.82) }}>{short(positioning, 170)}</p>}
                    <div className="mt-9 flex flex-wrap gap-3"><span style={btn(true, { bg: t.btnText, fg: t.btnBg })}>{cta1}</span><span style={btn(false, { fg: t.btnText })}>{cta2}</span></div>
                  </div>
                  {terms.length > 3 && (
                    <div style={{ background: t.accent, color: readable(t.accent, ["#ffffff", "#0a0a0a"]), padding: "14px 0", overflow: "hidden" }}>
                      <div className="marquee flex w-max gap-10 whitespace-nowrap" style={{ fontSize: 15, fontWeight: 600 }}>
                        {[0, 1].map((k) => <div key={k} className="flex gap-10">{terms.map((w) => <span key={w + k}>{w} <span style={{ opacity: 0.45, marginLeft: 40 }}>✦</span></span>)}</div>)}
                      </div>
                    </div>
                  )}
                  <div style={{ padding: mobile ? "40px 20px" : "72px 48px" }}>
                    {feats.map((f, i) => (
                      <div key={i} className="grid items-baseline gap-4" style={{ gridTemplateColumns: mobile ? "36px 1fr" : "90px 1fr", borderTop: `1px solid ${t.border}`, padding: mobile ? "20px 0" : "30px 0" }}>
                        <span style={{ fontFamily: font(t.heading), fontSize: 14, color: t.muted }}>{String(i + 1).padStart(2, "0")}</span>
                        <span style={{ ...H(mobile ? 22 : 36), lineHeight: 1.12 }}>{f}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 28 }}><span style={btn(true)}>{cta1}</span></div>
                  </div>
                  <Footer />
                </>
              )}

              {view === "editorial" && (
                <>
                  <div style={{ padding: mobile ? "40px 20px" : "72px 48px 40px", maxWidth: 780, margin: "0 auto" }}>
                    <div style={eyebrow()}>{kinds.includes("blog") ? "Journal" : "Notes"} · 4 min read</div>
                    <h1 style={{ ...H(mobile ? 34 : 56), marginTop: 14 }}>{tagline}</h1>
                    {positioning && <p style={{ marginTop: 24, fontSize: 20, lineHeight: 1.55, color: t.muted }}>{positioning}</p>}
                    <div className="mt-8 flex items-center gap-3" style={{ fontSize: 13, color: t.muted }}><Brand /><span>·</span><span>{tone.slice(0, 2).join(", ") || "Editorial"}</span></div>
                  </div>
                  <div style={{ height: mobile ? 160 : 280, margin: mobile ? "0 20px" : "0 48px", borderRadius: t.cardRadius + 4, backgroundImage: `linear-gradient(135deg, ${t.primary}, ${t.accent})`, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle at 20% 120%, ${alpha(t.bg, 0.5)}, transparent 55%)` }} />
                  </div>
                  <div style={{ padding: mobile ? "36px 20px" : "56px 48px", maxWidth: 780, margin: "0 auto" }}>
                    {feats.map((f, i) => {
                      const parts = f.split(/(?<=[.!?])\s+/);
                      return (
                        <div key={i} style={{ marginBottom: 32 }}>
                          <h2 style={{ ...H(26), lineHeight: 1.18 }}>{parts[0]}</h2>
                          {parts.length > 1 && <p style={{ marginTop: 10, fontSize: 17, lineHeight: 1.7 }}>{parts.slice(1).join(" ")}</p>}
                        </div>
                      );
                    })}
                    <blockquote style={{ borderLeft: `3px solid ${t.primary}`, paddingLeft: 22, margin: "36px 0", ...H(mobile ? 22 : 28), lineHeight: 1.25 }}>{pillars[0] ?? short(tagline, 80)}</blockquote>
                    <span style={btn(true)}>{cta1}</span>
                  </div>
                  <Footer />
                </>
              )}

              {view === "components" && (
                <div style={{ padding: mobile ? "28px 20px" : "48px", display: "grid", gap: 36 }}>
                  <div style={{ display: "grid", gap: 36, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
                    <div><div style={eyebrow()}>Buttons</div><div className="mt-4 flex flex-wrap gap-3"><span style={btn(true)}>{cta1}</span><span style={btn(false)}>{cta2}</span><span style={btn(true, { bg: t.accent, fg: readable(t.accent, ["#ffffff", "#0a0a0a"]) })}>{cap(ctas[2] ?? "Accent")}</span></div></div>
                    <div><div style={eyebrow()}>Typography</div><div style={{ ...H(44), marginTop: 12 }}>{name}</div><div style={{ marginTop: 8, fontSize: 14, color: t.muted }}>{t.heading ?? "System sans"} / {t.body ?? "System sans"}</div></div>
                    <div><div style={eyebrow()}>Input</div><div style={{ marginTop: 12, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: "12px 14px", fontSize: 14, color: t.muted, background: t.surface }}>you@company.com</div></div>
                    <div><div style={eyebrow()}>Tags</div><div className="mt-4 flex flex-wrap gap-2">{tone.slice(0, 4).map((x, i) => <span key={x} style={{ border: `1px solid ${i === 0 ? t.primary : t.border}`, background: i === 0 ? alpha(t.primary, 0.12) : "transparent", borderRadius: 999, padding: "4px 13px", fontSize: 12.5, color: t.strong }}>{x}</span>)}</div></div>
                  </div>
                  <div><div style={eyebrow()}>Palette</div><div className="mt-4 flex overflow-hidden" style={{ borderRadius: t.cardRadius, border: `1px solid ${t.border}`, height: 76 }}>{[t.primary, t.accent, ...(dna.colors.secondary ?? []).map((x: any) => x.hex), t.surface, t.text].slice(0, 6).map((c: string, i: number) => <i key={i} style={{ background: c, flex: i === 0 ? 3 : 1 }} />)}</div></div>
                  <div style={{ display: "grid", gap: 16, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
                    <div style={card}><Glyph i={0} /><div style={{ ...H(20), marginTop: 18, lineHeight: 1.25 }}>{short(feats[0] ?? tagline, 70)}</div><p style={{ marginTop: 8, fontSize: 14, color: t.muted }}>{short(positioning, 120)}</p></div>
                    <div style={{ ...card, background: t.btnBg, color: t.btnText, border: "none" }}><div style={{ ...H(20, t.btnText), lineHeight: 1.25 }}>{short(feats[1] ?? tagline, 70)}</div><div style={{ marginTop: 18 }}><span style={btn(true, { bg: t.btnText, fg: t.btnBg })}>{cta1}</span></div></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="text-[14px]">
          <div className="micro mb-3">Built from the Brand DNA</div>
          <ul className="space-y-3 border-t border-hairline-soft pt-3">
            <li><span className="micro block">Colour</span><span className="mt-1 flex gap-1.5">{[t.primary, t.accent, t.bg, t.text].map((c, i) => <i key={i} className="h-5 w-5 rounded-sm border border-hairline-soft" style={{ background: c }} title={c} />)}</span></li>
            <li><span className="micro block">Type</span>{t.heading ?? "System sans"}{t.body && t.body !== t.heading ? ` / ${t.body}` : ""}</li>
            <li><span className="micro block">Shape</span>{t.radius >= 999 ? "Pill buttons" : `${t.radius}px corners`}, {t.soft ? "soft shadows" : "flat surfaces"}</li>
            <li><span className="micro block">Copy</span>Tagline, positioning, value propositions, CTAs and recurring terms come from the site.</li>
            {(dna.voice.dos ?? []).slice(0, 2).map((d: any, i: number) => <li key={i}><span className="micro block">Voice rule</span>{d.value}</li>)}
          </ul>
          <p className="meta mt-4">Brand fonts load from Google Fonts when available there; otherwise a system sans stands in. Layouts are generic templates, so this shows tokens and tone, not the site&rsquo;s real design.</p>
        </aside>
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="micro">{label}</span>
      <div className="flex rounded-full border border-hairline-soft p-0.5">
        {options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={"rounded-full px-3.5 py-1 text-[13px] font-semibold transition-colors " + (value === v ? "bg-ink text-white" : "text-slate hover:text-ink")}>{l}</button>)}
      </div>
    </div>
  );
}
