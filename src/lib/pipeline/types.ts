export type Evidence = { url: string; reason: string };
export type Finding<T = string> = { value: T; confidence: number; evidence: Evidence[] };

export type Counted = Finding<string> & { count: number };
export type Page = {
  url: string; kind: string; title: string; description: string;
  html: string; text: string;
  links: string[]; imageLinks: string[]; meta: Record<string, any> | null; // from TinyFish Fetch links / image_links / page_metadata
};
export type Stylesheet = { url: string; css: string; pages: string[] };

// Measured from a live page rendered in a TinyFish Browser session (see computed.ts).
export type Computed = {
  pages: string[];
  elements: number;
  bgArea: Record<string, number>;
  textLen: Record<string, number>;
  buttonBg: Record<string, number>;
  buttonText: Record<string, number>;
  brandVars: { name: string; hex: string }[];
  themeColor: string | null;
  fonts: { heading: Record<string, number>; body: Record<string, number>; mono: Record<string, number>; loaded: string[] };
  weights: Record<string, number>;
  hierarchy: { level: string; size: string; weight: string; font: string; letterSpacing: string; lineHeight: string }[];
  radii: Record<string, number>;
  shadows: number; uppercase: number; tightTracking: number; styled: number;
  gradients: { css: string; area: number }[];
  ctas: { text: string; bg: string; color: string }[];
  logos: { value: string; signal: string; inHeader: boolean }[];
  favicon: string | null;
};

export type ScoutOutput = {
  origin: string;
  pages: Page[];
  stylesheets: Stylesheet[];
  computed: Computed | null;
  evidence: { url: string; kind: string; note: string }[];
  warnings: string[];
};

export type Emit = (stage: string, status: "active" | "done" | "warn", label: string, detail?: string) => void;

export type Visual = {
  colors: {
    primary: Finding | null;
    secondary: Finding[];
    accent: Finding[];
    background: Finding[];
    text: Finding[];
    gradients: Finding[];
  };
  typography: {
    heading: Finding | null;
    body: Finding | null;
    mono: Finding | null;
    weights: Finding<number[]> | null;
    hierarchy: { level: string; size: string; weight: string; font: string }[];
    sources: string[];
  };
  logo: { primary: Finding | null; variants: Finding[]; favicon: Finding | null };
  patterns: Finding[];
};

export type Voice = {
  tagline: Finding | null;
  positioning: Finding | null;
  value_propositions: Finding[];
  pillars: Finding[];
  terminology: Counted[];
  ctas: Counted[];
  tone: Finding<string[]>;
  writing_style: Finding[];
  dos: Finding[];
  donts: Finding[];
  interpreter: "llm" | "heuristic";
};
