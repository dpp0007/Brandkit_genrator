import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const headers = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Not a full script policy (Next inlines scripts), but it blocks framing, base-tag and form hijacking, and plugins.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

// `next dev` and `next build` used to share .next and corrupt each other (a build during dev made routes-manifest.json
// vanish). Dev now has its own folder, so building while the dev server runs is safe. Builds still go to .next (Vercel expects it).
export default (phase) => ({
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
  poweredByHeader: false,
  async headers() { return [{ source: "/(.*)", headers }]; },
});
