import type { BrandDNA } from "./compile";

const kind = (dna: BrandDNA, url: string) => dna.evidence.pages.find((p) => url.startsWith(p.url))?.kind ?? (url.endsWith(".css") || url.includes(".css?") ? "stylesheet" : "page");

// /api/guide: presentation-ready sections for humans.
export function toGuide(dna: BrandDNA) {
  const colorRows = [
    ...(dna.colors.primary ? [{ role: "Primary", ...dna.colors.primary }] : []),
    ...dna.colors.secondary.map((c) => ({ role: "Secondary", ...c })),
    ...dna.colors.accent.map((c) => ({ role: "Accent", ...c })),
    ...dna.colors.background.map((c) => ({ role: "Background", ...c })),
    ...dna.colors.text.map((c) => ({ role: "Text", ...c })),
  ].map((c) => ({ role: c.role, hex: c.hex, rgb: c.rgb, usage: c.usage, confidence: c.confidence, found_in: [...new Set(c.evidence.map((e) => kind(dna, e.url)))] }));
  return {
    overview: { name: dna.brand.name, website: dna.brand.url, positioning: dna.brand.positioning, tagline: dna.brand.tagline, confidence: dna.confidence.overall, pages_explored: dna.meta.pages_explored, extracted_at: dna.meta.extracted_at },
    logo: { primary: dna.logo.primary?.value ?? null, variants: dna.logo.variants.map((v) => v.value), favicon: dna.logo.favicon?.value ?? null, confidence: dna.logo.primary?.confidence ?? 0 },
    colors: { swatches: colorRows, gradients: dna.colors.gradients.map((g) => g.css).filter((c) => /^(linear|radial|conic)-gradient\([#a-zA-Z0-9%.,()\s\/-]+\)$/.test(c) && !/url\(|var\(|expression|@import|\\/i.test(c)) },
    typography: { heading: dna.typography.heading?.value ?? null, body: dna.typography.body?.value ?? null, mono: dna.typography.mono?.value ?? null, weights: dna.typography.weights?.value ?? [], hierarchy: dna.typography.hierarchy },
    visual_style: dna.visual_identity.patterns.map((p) => p.value),
    voice: { traits: dna.voice.tone.value, style: dna.voice.writing_style.map((f) => f.value), dos: dna.voice.dos.map((f) => f.value), donts: dna.voice.donts.map((f) => f.value) },
    messaging: { tagline: dna.messaging.tagline?.value ?? null, positioning: dna.messaging.positioning?.value ?? null, value_propositions: dna.messaging.value_propositions.map((f) => f.value), pillars: dna.messaging.pillars.map((f) => f.value), ctas: dna.messaging.ctas.map((c) => c.value), terminology: dna.voice.terminology.map((t) => t.value) },
    evidence: dna.evidence.findings.filter((f) => /^(primary_color|secondary_color_1|heading_font|body_font|tagline|positioning|tone|logo)$/.test(f.property)).map((f) => ({ property: f.property.replace(/_/g, " "), value: f.value, confidence: f.confidence, found_in: [...new Set(f.evidence.map((e) => kind(dna, e.url)))], sources: f.evidence })),
    pages: dna.evidence.pages,
    warnings: dna.validation.warnings,
  };
}

// /api/context: text + structured block for AI agents.
export function toContext(dna: BrandDNA) {
  const n = dna.brand.name, L = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "- (not established)");
  const hex = (xs: { hex: string }[]) => xs.map((x) => x.hex).join(", ") || "n/a";
  const text = `BRAND CONTEXT

You are creating content for ${n} (${dna.brand.url}).
${dna.brand.positioning ? `\nWhat ${n} is:\n${dna.brand.positioning}\n` : ""}
Brand personality / tone:
${dna.voice.tone.value.join(", ")}

Writing style:
${L(dna.voice.writing_style.map((f) => f.value))}

Visual identity:
- Primary colour: ${dna.colors.primary?.hex ?? "n/a"}
- Secondary: ${hex(dna.colors.secondary)}
- Accent: ${hex(dna.colors.accent)}
- Backgrounds: ${hex(dna.colors.background)}
- Text: ${hex(dna.colors.text)}
- Heading font: ${dna.typography.heading?.value ?? "n/a"}; body font: ${dna.typography.body?.value ?? "n/a"}${dna.typography.mono ? `; mono: ${dna.typography.mono.value}` : ""}
${dna.visual_identity.patterns.map((p) => `- ${p.value}`).join("\n")}

Messaging:
- Tagline: ${dna.messaging.tagline?.value ?? "n/a"}
${dna.messaging.value_propositions.map((v) => `- Value proposition: ${v.value}`).join("\n")}
${dna.messaging.pillars.map((v) => `- Pillar: ${v.value}`).join("\n")}
- Typical CTAs: ${dna.messaging.ctas.map((c) => `"${c.value}"`).join(", ") || "n/a"}

Preferred terminology:
${dna.voice.terminology.map((t) => t.value).join(", ") || "(none established)"}

DO:
${L(dna.voice.dos.map((f) => f.value))}

DON'T:
${L(dna.voice.donts.map((f) => f.value))}

Design tokens:
${Object.entries(dna.design_tokens).map(([k, v]) => `${k}: ${v}`).join("\n")}

Confidence: ${Math.round(dna.confidence.overall * 100)}% overall. Derived from ${dna.meta.pages_explored} pages of ${dna.brand.domain} on ${dna.meta.extracted_at.slice(0, 10)}.`;
  return {
    brand: n, url: dna.brand.url, text,
    structured: { tone: dna.voice.tone.value, terminology: dna.voice.terminology.map((t) => t.value), do: dna.voice.dos.map((f) => f.value), dont: dna.voice.donts.map((f) => f.value), tagline: dna.messaging.tagline?.value ?? null, design_tokens: dna.design_tokens },
    confidence: dna.confidence.overall,
  };
}

// Change summary between two extractions (structure ready for a richer diff).
export function diffDna(a: BrandDNA, b: BrandDNA) {
  const colorSet = (d: BrandDNA) => new Set(Object.entries(d.design_tokens).filter(([k]) => k.startsWith("color.")).map(([, v]) => v));
  const ca = colorSet(a), cb = colorSet(b);
  const colors = [...cb].filter((x) => !ca.has(x)).length + [...ca].filter((x) => !cb.has(x)).length;
  const typo = (["font.heading", "font.body"] as const).filter((k) => a.design_tokens[k] !== b.design_tokens[k]).length;
  const msgs = [a.messaging.tagline?.value !== b.messaging.tagline?.value, a.messaging.positioning?.value !== b.messaging.positioning?.value, JSON.stringify(a.messaging.value_propositions.map((x) => x.value)) !== JSON.stringify(b.messaging.value_propositions.map((x) => x.value))].filter(Boolean).length;
  return { colors, typography: typo, messaging: msgs, changed: colors + typo + msgs > 0 };
}
