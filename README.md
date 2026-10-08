# BrandMeld

Turn any public website into a structured **Brand DNA**: logo, colours, typography, visual style, tone of voice, messaging, CTAs and brand rules, each with the pages it came from and a confidence score. The same result is available three ways:

- a **visual brand guide** for people,
- **AI context** and one canonical **JSON** for agents and apps,
- a **preview** that renders sample pages in the extracted design, so you can see what a site built from the context would look like.

The live site is explored with **TinyFish** (Fetch, Browser, Search). Voice and messaging are interpreted by **Google Gemini**. Nothing is hardcoded per brand; it runs against arbitrary public sites.

---

## Contents

1. [Quick start](#quick-start)
2. [How a user experiences it](#how-a-user-experiences-it)
3. [How the extraction works](#how-the-extraction-works)
4. [Brand DNA schema](#brand-dna-schema)
5. [API](#api)
6. [API keys and security](#api-keys-and-security)
7. [Data model](#data-model)
8. [Project layout](#project-layout)
9. [Configuration](#configuration)
10. [Testing without real keys](#testing-without-real-keys)
11. [Deployment](#deployment)
12. [Design system](#design-system)
13. [Known limits](#known-limits)
14. [Troubleshooting](#troubleshooting)

---

## Quick start

Requires **Node 22.13 or newer** (it uses the built-in `node:sqlite`).

```bash
npm install
npm run dev        # http://localhost:3000
```

1. Create an account.
2. Enter a website (or a company name) and click **Explore Brand**.
3. When asked, paste your two keys. Each dialog explains how to get its key:
   - **TinyFish**: https://agent.tinyfish.ai/api-keys (live exploration).
   - **Google Gemini**: create a free key in Google AI Studio at https://aistudio.google.com/apikey. Sign in with Google, click *Create API key*, copy the key (it starts with `AIza`).
4. Keys are asked for **once**. After that, exploring needs only a URL.

Each user brings their own keys, so there are no provider keys to configure on the server.

---

## How a user experiences it

| Step | What happens |
|---|---|
| **Home** | Headline, URL input, example buttons (Stripe, Linear, Notion; examples only, no special handling). Signed-in users see their latest brand in the hero and a list of recent brands. |
| **Sign up / in** | Email + password. The URL typed before signing up is kept. |
| **Key onboarding** | If a key is missing or rejected, a dialog explains why it is needed and how to get it, in these states: connect, connecting, connected, and invalid key. It never appears when a valid key exists. |
| **Exploration** | A live progress list driven by the real backend events: connect, homepage, discover pages, read pages, render in a browser, visual system, typography, voice, validate, compile. Nothing is faked. |
| **Brand guide** | Overview, logo, colour system, typography, visual style, voice (do and don't), messaging, and evidence. Click a swatch to copy its HEX. Every finding expands to show source pages and reasons. |
| **Preview** | Four sample sites (Product, Bold, Editorial, Kit) rendered from the brand's tokens and real copy, with Light/Dark canvas, Desktop/Mobile, and *Copy as CSS variables*. |
| **AI context** | Ready-to-paste context text, plus a structured block. Copy, download `.txt`, or download JSON. |
| **Brand DNA** | The full canonical JSON. Copy or download. |
| **History** (`/brands`) | Open, Re-run, Copy context, Export, Delete. Re-analysing a brand shows how many colour, typography and messaging findings changed. |
| **Settings** (`/settings`) | Both integrations show *Connected* and a masked key. Test connection, Replace, Delete (with a confirmation dialog). The full key is never shown again. |

Errors are written for people (invalid URL, site blocks automated access, login wall, TinyFish or Gemini auth failure, rate limit, timeout, extraction failure, partial result). Stack traces are never shown.

---

## How the extraction works

The pipeline lives in `src/lib/pipeline/` and runs in a background job whose events are persisted (`jobs.events`), which is what the progress page polls.

```
URL or company name
   │
   ▼  scout.ts          TinyFish Fetch + Search
 homepage + brand-relevant pages (text, links, image URLs, page metadata)
   │
   ▼  computed.ts       TinyFish Browser (remote Chromium over CDP)
 real computed styles measured on the rendered page
   │
   ├─▶ visualComputed.ts   colours, type, logo, patterns
   └─▶ voice.ts            tone, messaging, CTAs, terms, do/don't  (Gemini)
   │
   ▼  compile.ts        validator, then compiler
 canonical Brand DNA  ─▶  outputs.ts  ─▶  guide data, AI context, change summary
```

### 1. Site Scout (`scout.ts`, TinyFish Fetch and Search)

- Normalises the input. A company name is resolved with TinyFish Search; a URL is validated (public hosts only).
- Fetches the homepage **live** (`ttl: 0`) as `html` with `links`, `image_links` and `page_metadata` turned on.
- Scores same-site links by how much they say about a brand (about, product(s), platform, pricing, customers, blog, careers, contact) and reads up to **6** pages in one batch. It does not crawl everything.
- If the homepage yields too few usable links, it falls back to TinyFish Search (`site:domain`) and common paths such as `/about` and `/pricing`.
- Classifies each page (home, about, product, pricing, blog, careers, other) and keeps its text as evidence.

Important detail from the TinyFish docs: Fetch returns **semantic main-content HTML only**, so it contains no stylesheets, no `<head>`, and often no navigation. That is why the visual stage uses a real browser.

### 2. Renderer (`computed.ts`, TinyFish Browser)

Opens a TinyFish Browser session, connects over CDP (using Node's built-in WebSocket, no extra dependency), renders the home page plus up to two more (pricing, product, about), and runs one measurement script in the page. It records:

- background colour by painted **area**, text colour by amount of text, button and CTA backgrounds, design tokens named like `--brand-*`, `theme-color`;
- fonts per heading and body (weighted by text length), loaded web fonts, weights, and a size/weight hierarchy;
- border radii, shadows, uppercase and tight-tracking usage, gradients;
- the **logo**: only marks in the header or footer, inside a link to the homepage, or carrying the brand's own name. Marks inside customer, partner, integration or testimonial sections are skipped, so partner logos do not leak in;
- favicon, and real CTA buttons (filled and padded links or buttons).

If the Browser API is unavailable on the account (not enabled, no credits, error), the run still completes: visual findings are reported as unavailable, the result is flagged `partial`, and a warning explains why. It never guesses visuals.

### 3. Visual Identity (`visualComputed.ts`)

Turns the measurements into findings with evidence. Colour scoring rewards button backgrounds, brand tokens and theme-color, and caps the weight of large chromatic areas (those are often illustrations, not brand). Output: primary, secondary, accent, background and text colours, gradients, heading/body/mono fonts, weights, hierarchy, logo and variants, favicon, and visual patterns (corner style, shadows, canvas tone, uppercase labels, tight tracking, gradients).

`visual.ts` is a CSS-parsing fallback that works when raw CSS is available (it is used only if no browser measurement exists).

### 4. Voice and Messaging (`voice.ts`, Gemini)

- A deterministic evidence pass gathers headings, CTAs (page links plus rendered buttons), sentences and recurring terms, and computes writing statistics (sentence length, "you" versus "we", exclamation marks, superlatives, technical vocabulary).
- **Gemini** (`gemini-3.5-flash-lite` by default) interprets the pack of page excerpts into tagline, positioning, value propositions, pillars, tone, writing style and do/don't rules. It must use a **strict response schema** and quote the site verbatim for tagline, positioning and value propositions.
- If a Gemini call fails for a reason other than the key or a rate limit, a deterministic interpreter is used instead, and the result records `voice.interpreter: "heuristic"` (versus `"llm"`).

### 5. Brand Validator (`compile.ts`)

Before anything is returned it:

- removes colours with too little usage evidence;
- confirms fonts were actually measured or declared;
- checks that every tagline, positioning, value proposition and pillar **appears verbatim on the site**, and removes those that do not (LLM claims are never presented as facts);
- caps the confidence of interpretive rules (do/don't), since they are inferences, not quotes;
- resolves contradictory tone traits and flags suspicious colour results.

Every check is stored in `validation.checks`.

### 6. Brand Compiler (`compile.ts`, `outputs.ts`)

Combines everything into one canonical object with a stable schema (below), and derives from it the guide data, the AI context, and a change summary between two extractions.

---

## Brand DNA schema

The shape is identical for every company (`schema_version: "1.0"`). Every important finding is `{ value, confidence, evidence: [{ url, reason }] }`.

```jsonc
{
  "schema_version": "1.0",
  "brand":          { "name", "url", "domain", "positioning", "tagline", "favicon" },
  "visual_identity":{ "patterns": [ Finding ] },
  "colors": {
    "primary":    { "hex", "rgb", "usage", "confidence", "evidence": [ … ] },
    "secondary":  [ … ], "accent": [ … ], "background": [ … ], "text": [ … ],
    "gradients":  [ { "css", "confidence", "evidence" } ]
  },
  "typography":     { "heading", "body", "mono", "weights", "hierarchy": [ { "level", "size", "weight", "font" } ] },
  "logo":           { "primary", "variants": [ … ], "favicon" },
  "voice":          { "tone", "writing_style", "dos", "donts", "terminology", "interpreter" },
  "messaging":      { "tagline", "positioning", "value_propositions", "pillars", "ctas" },
  "design_tokens":  { "color.primary": "#…", "font.heading": "…", … },
  "evidence":       { "pages": [ { "url", "kind", "title" } ], "findings": [ { "property", "value", "confidence", "evidence" } ] },
  "confidence":     { "overall", "by_section": { "colors", "typography", "logo", "voice", "messaging" } },
  "validation":     { "checks": [ { "check", "status", "detail" } ], "warnings": [ … ] },
  "meta":           { "extracted_at", "source": "tinyfish-fetch", "pages_explored", "partial" }
}
```

`meta.partial` is `true` when some sources could not be read or visuals could not be measured.

---

## API

All endpoints require a signed-in session cookie and use the user's saved keys. They return JSON, and errors look like `{ "error": { "code", "message", "provider"? } }`.

### The three product endpoints

Each accepts `{ "url": "https://example.com", "refresh"?: true }` (a company name also works). A saved extraction is reused unless `refresh` is `true`. They return **different** outputs:

| Endpoint | Returns | For |
|---|---|---|
| `POST /api/extract` | The canonical Brand DNA JSON (plus `_meta: { cached, brand_id }`) | Apps, storage, diffing |
| `POST /api/guide` | Presentation-ready data: overview, logo, colour swatches with HEX/RGB/usage and "found in", typography, visual style, voice, messaging, grouped evidence, pages, warnings | Rendering a brand guide |
| `POST /api/context` | `{ brand, url, text, structured, confidence }`: a BRAND CONTEXT prompt block (personality, visual identity, tone, terminology, do/don't, messaging, tokens) and a structured version | Pasting into an agent or system prompt |

```bash
curl -X POST http://localhost:3000/api/context \
  -H "content-type: application/json" \
  -H "cookie: bm_session=…" \
  -d '{"url":"https://example.com"}'
```

### Internal endpoints (used by the UI)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup`, `signin`, `signout`; `GET /api/auth/me` | Accounts and session |
| `GET/POST/DELETE /api/credentials`, `POST /api/credentials/test` | Save, mask, test, delete a provider key (`provider: "tinyfish" \| "gemini"`) |
| `POST /api/explore`, `GET /api/jobs/:id` | Start an exploration and poll its real progress |
| `GET /api/brands`, `GET/DELETE /api/brands/:id` | History |
| `GET /api/health` | Health check |

---

## API keys and security

- **No hardcoded keys.** Each user supplies their own TinyFish and Gemini keys.
- Keys are **verified on submission** (TinyFish with a Fetch call, Gemini by listing models), then **encrypted at rest with AES-256-GCM** (`src/lib/crypto.ts`) and stored server-side.
- After saving, the browser only ever sees a mask such as `tf-••••••••••••9x4k`. The full key is never returned, never placed in localStorage, sessionStorage, URLs, client source or client env vars, and the input is cleared right after submission.
- Keys are never logged and never included in error messages. Unknown errors become a generic message.
- Deleting a key asks for confirmation. The dialog appears only when no key exists, the saved key is rejected, or the user chooses Replace.
- Passwords are hashed with scrypt. Sessions are random tokens stored hashed, delivered as `httpOnly`, `SameSite=Lax` cookies (`Secure` in production) and expire after 30 days.
- Rate limits: 5 sign-ups per 10 minutes and 10 sign-ins per minute per IP, and 30 explorations per hour per user.
- Security headers (`X-Frame-Options`, `nosniff`, referrer and permissions policies) are set in `next.config.mjs`.

---

## Data model

SQLite through Node's built-in `node:sqlite` (`<data dir>/brandmeld.db`). It was chosen for zero setup; the schema maps directly to Postgres/Supabase if you swap `src/lib/db.ts`.

| Table | Purpose |
|---|---|
| `users` | `id, email, password_hash, created_at` |
| `sessions` | Hashed session tokens with expiry |
| `api_credentials` | `user_id, provider, encrypted_key, last4, prefix, last_verified_at` (one row per provider per user) |
| `brands` | `user_id, name, url, favicon` (one row per site per user) |
| `brand_extractions` | `brand_id, version, brand_dna (JSON), status, created_at`: every analysis is kept, so history and diffs work |
| `brand_evidence` | One row per finding: `extraction_id, url, property, value, confidence, evidence` |
| `jobs` | Exploration progress events and outcome (added beyond the original spec, to power the live progress view) |

A job still `running` after 10 minutes is reported as interrupted (for example after a server restart).

---

## Project layout

```
src/
  app/
    page.tsx                  Landing page
    auth/ brands/ explore/ settings/   Pages
    api/…                     Route handlers (see API)
    icon.svg                  Site icon
  components/
    BrandView.tsx             Guide, AI context and JSON tabs
    BrandPreview.tsx          Preview tab (sample sites from tokens)
    KeyDialog.tsx             Reusable key dialog (TinyFish and Gemini)
    KeySettings.tsx           Settings: test / replace / delete
    ExploreForm.tsx, useExplorer.tsx   Start an exploration, handle key prompts
    HeroArt.tsx, Reveal.tsx, Nav.tsx, Footer.tsx, Logo.tsx, BrandList.tsx
  lib/
    db.ts crypto.ts auth.ts credentials.ts http.ts   Storage, encryption, auth, errors, rate limit
    tinyfish.ts gemini.ts                            Provider clients
    pipeline/
      scout.ts computed.ts visual.ts visualComputed.ts voice.ts
      compile.ts outputs.ts run.ts types.ts
scripts/                      Dev tools (see Testing)
DEPLOY.md                     Deployment steps
```

---

## Configuration

See `.env.example`.

| Variable | Use |
|---|---|
| `BRANDMELD_DATA_DIR` | Folder for `brandmeld.db` and the generated key. Put it on a persistent disk in production. Default `./.data`. |
| `BRANDMELD_SECRET` | Encrypts stored keys. **Set it explicitly in production and keep it**; if it changes, saved keys cannot be decrypted and users must re-enter them. If unset, a random secret is generated in the data dir. |
| `BRANDMELD_MODEL` | Gemini model. Default `gemini-3.5-flash-lite`. |
| `TINYFISH_FETCH_URL`, `TINYFISH_SEARCH_URL`, `TINYFISH_BROWSER_URL`, `GEMINI_API_BASE` | **Development only.** Redirect the app to the local stand-ins. Leave unset in production. |

---

## Testing without real keys

`npm run mock` starts local stand-ins that follow the documented TinyFish behaviour:

- **:4010** Fetch (returns stripped "semantic" content plus `links`, `image_links`, `page_metadata`), Search, and a Gemini key-check endpoint. Generation is intentionally not implemented, so voice falls back to the deterministic interpreter.
- **:4011** Browser API, handing out a CDP URL for a local headless Chrome or Edge (set `CHROME_PATH` if it is not found).

Start the app against them:

```bash
npm run mock          # terminal 1
TINYFISH_FETCH_URL=http://localhost:4010 TINYFISH_SEARCH_URL=http://localhost:4010 \
TINYFISH_BROWSER_URL=http://localhost:4011 GEMINI_API_BASE=http://localhost:4010/v1beta \
npm run dev           # terminal 2
```

Use TinyFish key `tf-mock-key-0000000000` and Gemini key `AIzaMockKey0000000000`. The mocks fetch real public pages, so they exercise the real pipeline.

| Script | What it does |
|---|---|
| `node scripts/e2e.mjs <tinyfishKey> <geminiKey> <url…>` | Signup, key onboarding (including invalid and missing keys), explore, extract/guide/context, invalid URL, against a running server |
| `node scripts/seed-demo.mjs <url…>` | Signs in as a local demo user, saves the mock keys, explores the URLs |
| `TINYFISH_API_KEY=… node scripts/probe.mjs <url>` | Against **real** TinyFish: shows what Fetch returns (links, images, metadata) and whether your account can create a Browser session |

Run `probe.mjs` first on a new account. The mocks are a reading of the docs, not TinyFish itself.

---

## Deployment

One Node process plus a SQLite file. Use a host with a **persistent disk** and a long-lived process (a VPS, Railway, Render, or Fly with a volume), not serverless: explorations run in the background for a minute or two.

```bash
npm ci
npm run build
BRANDMELD_SECRET=<long random string> BRANDMELD_DATA_DIR=/var/lib/brandmeld PORT=3000 npm start
```

Details, including HTTPS, proxies and single-instance notes, are in [DEPLOY.md](DEPLOY.md).

---

## Design system

The UI follows `DESIGN.md`: a quiet editorial look with a near-black primary pill button, hairline dividers, uppercase eyebrows over regular-weight display headings with tight tracking, flat surfaces with no card shadows (depth comes from tone), and a dark hero band. The site sans is Inter (the closest open match to the spec's `abcNormal`); monospace is used for JSON, hex values and evidence metadata. A single small coral accent marks the active step on the exploration screen.

Where the original brief and `DESIGN.md` differed (cream canvas, coral accent and serif display headings versus a white canvas, black-only actions and one sans family), `DESIGN.md` was followed.

---

## Known limits

- **Browser API required for visuals.** Colours, fonts and logo come from rendering the page in a TinyFish Browser session. It may need enabling on your account and can use credits. Without it, those sections are reported as unavailable (never guessed) and the result is `partial`.
- **Brand-colour choice is heuristic.** Measured styles are accurate, but deciding which colour is "the brand" is a judgement; a site whose homepage is dominated by illustration colour can yield an unexpected primary.
- **Pages read are capped** (home plus up to 6, with up to 2 extra rendered). Very large or heavily client-rendered sites may need a re-run.
- **Sites that block bots or require login** return a clear error instead of a result.
- **Single instance.** Running jobs and rate-limit counters live in process memory; a restart interrupts a job in progress. For several instances, move the DB to Postgres and the limiter to Redis.
- **Preview** shows tokens and tone in generic layouts, not the site's real design. Brand fonts load from Google Fonts when available there, otherwise a system sans is used.
- **Re-analyse diff** is a simple count (colours, typography, messaging) over a structure that can support a richer diff.
- Only an SVG site icon is provided (no `.ico` or Apple touch icon).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Result has no colours or fonts, and a "partial" notice | The TinyFish Browser API is unavailable for the account. Run `scripts/probe.mjs`. |
| Dialog says a key could not be authenticated | The key is wrong or inactive. Replace it in the dialog or in Settings. |
| "Rate limited" from Gemini | Free-tier quota. Wait a minute, or enable billing in Google AI Studio. |
| "Your TinyFish daily free allowance is used up" | Fetch is free up to 1,000 URLs a day; add wallet balance or wait for the reset at 00:00 UTC. |
| An exploration seems stuck, then says it didn't finish | The server restarted mid-run. Run it again. |
| Saved keys stopped working after a redeploy | `BRANDMELD_SECRET` changed or the data dir moved. Restore them, or re-enter the keys. |
| "database is locked" during the first build | Transient while build workers open the DB together; a busy timeout is set, and re-running the build clears it. |
