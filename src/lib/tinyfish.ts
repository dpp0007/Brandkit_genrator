import { AppError } from "./http";

const FETCH_URL = () => process.env.TINYFISH_FETCH_URL || "https://api.fetch.tinyfish.ai";
const SEARCH_URL = () => process.env.TINYFISH_SEARCH_URL || "https://api.search.tinyfish.ai";
const BROWSER_URL = () => process.env.TINYFISH_BROWSER_URL || "https://api.browser.tinyfish.ai";

export type TFResult = {
  url: string; final_url?: string; title?: string; description?: string; text: string;
  links?: string[]; image_links?: string[]; page_metadata?: Record<string, any>;
};
export type TFResponse = { results: TFResult[]; errors: { url: string; error: string; status?: number }[] };

// Request-level errors per the TinyFish docs: 401 key, 402 credits, 429 rate limit.
async function parse(res: Response) {
  if (res.status === 401 || res.status === 403) throw new AppError("INVALID_KEY", "TinyFish rejected this API key.", 401, { provider: "tinyfish" });
  if (res.status === 402) throw new AppError("TINYFISH_CREDITS", "Your TinyFish daily free allowance is used up and the wallet balance is empty. Top up in the TinyFish dashboard.", 402);
  if (res.status === 429) throw new AppError("RATE_LIMITED", "TinyFish is rate limiting requests. Wait a minute and try again.", 429);
  if (!res.ok) throw new AppError("TINYFISH_ERROR", "TinyFish returned an unexpected response. Please try again.", 502);
  try { return await res.json(); } catch { throw new AppError("TINYFISH_ERROR", "TinyFish returned an invalid response.", 502); }
}

export type FetchOpts = { format?: "html" | "markdown"; links?: boolean; imageLinks?: boolean; pageMetadata?: boolean };

// Live fetch through TinyFish Fetch. ttl:0 prefers a live fetch. Client timeout >=150s per the docs.
export async function tfFetch(key: string, urls: string[], o: FetchOpts = {}): Promise<TFResponse> {
  let res: Response;
  try {
    res = await fetch(FETCH_URL(), {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: urls.slice(0, 10), format: o.format ?? "html", ttl: 0, per_url_timeout_ms: 60_000,
        ...(o.links ? { links: true } : {}), ...(o.imageLinks ? { image_links: true } : {}), ...(o.pageMetadata ? { page_metadata: true } : {}),
        purpose: "Brand identity analysis (colors, typography, voice)",
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError") throw new AppError("TIMEOUT", "TinyFish took too long to respond. Try again in a moment.", 504);
    throw new AppError("TINYFISH_UNREACHABLE", "We couldn't reach TinyFish. Check your connection and try again.", 502);
  }
  const j = await parse(res);
  return { results: Array.isArray(j.results) ? j.results : [], errors: Array.isArray(j.errors) ? j.errors : [] };
}

export async function verifyKey(key: string) {
  await tfFetch(key, ["https://example.com"], { format: "markdown" });
}

// Used only to resolve a company name to a website, or to find pages when links are unavailable.
export async function tfSearch(key: string, query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const res = await fetch(`${SEARCH_URL()}?query=${encodeURIComponent(query)}`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(30_000) });
    const j = await parse(res);
    return Array.isArray(j.results) ? j.results : [];
  } catch (e) {
    if (e instanceof AppError && e.code === "INVALID_KEY") throw e;
    return [];
  }
}

// TinyFish Browser API: a remote Chromium you drive over CDP. Returns null when the account can't use it.
export async function createBrowserSession(key: string, url: string): Promise<{ session_id: string; cdp_url: string } | null> {
  try {
    const res = await fetch(BROWSER_URL(), { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ url, timeout_seconds: 300 }), signal: AbortSignal.timeout(90_000) });
    if (res.status === 401) throw new AppError("INVALID_KEY", "TinyFish rejected this API key.", 401, { provider: "tinyfish" });
    if (!res.ok) return null; // 402 / 404 (not enabled) / 5xx: caller degrades gracefully
    const j = await res.json();
    return j.cdp_url ? { session_id: j.session_id, cdp_url: j.cdp_url } : null;
  } catch (e) {
    if (e instanceof AppError) throw e;
    return null;
  }
}
export async function endBrowserSession(key: string, id: string) {
  try { await fetch(`${BROWSER_URL()}/${id}`, { method: "DELETE", headers: { "X-API-Key": key }, signal: AbortSignal.timeout(15_000) }); } catch {}
}
