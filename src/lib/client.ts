export const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  const u: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [2592000, "month"]];
  let best: [number, string] = [1, "second"];
  for (const x of u) if (s >= x[0]) best = x;
  const n = Math.floor(s / best[0]);
  return `${n} ${best[1]}${n > 1 ? "s" : ""} ago`;
};
export function download(name: string, data: string, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
