import { AppError } from "./http";

export const GEMINI_MODEL = () => process.env.BRANDMELD_MODEL || "gemini-3.5-flash-lite";
const BASE = () => process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

const bad = () => new AppError("INVALID_KEY", "Google rejected this Gemini API key.", 401, { provider: "gemini" });

async function check(res: Response) {
  if (res.status === 401 || res.status === 403) throw bad();
  if (res.status === 400) { const t = await res.text().catch(() => ""); if (/API_KEY_INVALID|API key not valid/i.test(t)) throw bad(); throw new AppError("GEMINI_ERROR", "Gemini couldn't process the request. Please try again.", 502, { provider: "gemini" }); }
  if (res.status === 429) throw new AppError("RATE_LIMITED", "Gemini is rate limiting requests (free-tier quota). Wait a minute and try again.", 429, { provider: "gemini" });
  if (!res.ok) throw new AppError("GEMINI_ERROR", "Gemini returned an unexpected response. Please try again.", 502, { provider: "gemini" });
  return res.json();
}

// Lists models: a cheap authenticated call that fails fast on a bad key.
export async function verifyGeminiKey(key: string) {
  let res: Response;
  try { res = await fetch(`${BASE()}/models?pageSize=1`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new AppError("GEMINI_UNREACHABLE", "We couldn't reach Google. Check your connection and try again.", 502, { provider: "gemini" }); }
  await check(res);
}

// Structured JSON generation. `schema` is an OpenAPI-style response schema.
export async function geminiJSON(key: string, system: string, prompt: string, schema: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BASE()}/models/${GEMINI_MODEL()}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } }),
    });
  } catch (e: any) {
    throw new AppError(e?.name === "TimeoutError" ? "TIMEOUT" : "GEMINI_UNREACHABLE", "Gemini took too long or couldn't be reached. Please try again.", 504, { provider: "gemini" });
  }
  const j = await check(res);
  const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  try { return JSON.parse(text); } catch { throw new AppError("GEMINI_ERROR", "Gemini returned an invalid response. Please try again.", 502, { provider: "gemini" }); }
}
