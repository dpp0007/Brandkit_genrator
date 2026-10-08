// Forgiving input handling, shared by the browser (instant feedback) and the server (the real check).
// Fixes common typos in web addresses and rejects entries that can't be a company or a website.

export type Cleaned = { value: string; note?: string } | { error: string };

const TLD_FIXES: Record<string, string> = {
  con: "com", cmo: "com", ocm: "com", vom: "com", xom: "com", cim: "com", coom: "com", comm: "com", c0m: "com", cm: "com", om: "com", comn: "com", copm: "com",
  ogr: "org", orgg: "org", rog: "org", nte: "net", ent: "net", nett: "net", cpm: "com",
};

// Keyboard rows, runs of which signal mashing rather than a name.
const MASH = ["qwert", "werty", "ertyu", "rtyui", "tyuio", "yuiop", "asdfg", "sdfgh", "dfghj", "fghjk", "ghjkl", "zxcvb", "xcvbn", "cvbnm", "qazws", "1234", "abcde"];

export function looksGibberish(raw: string): boolean {
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s.length < 5) return false; // short names and acronyms (IBM, HBO, SNCF) are fine
  if (/^\d+$/.test(s)) return true;
  if (/(.)\1{3,}/.test(s)) return true; // aaaaa
  if (/(.{2,3})\1{2,}/.test(s)) return true; // ababab, abcabcabc
  if (MASH.some((m) => s.includes(m))) return true;
  const letters = s.replace(/[0-9]/g, "");
  if (letters.length < 3) return true;
  const vowels = (letters.match(/[aeiouy]/g) ?? []).length;
  if (letters.length >= 6 && vowels / letters.length < 0.15) return true;
  if (/[^aeiouy0-9]{6,}/.test(s)) return true; // long consonant runs
  return false;
}

// Turns whatever was typed into either a normalised address (https://host/path) or a company name.
export function cleanInput(raw: string): Cleaned {
  let s = (raw ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { error: "Enter a website address or a company name." };
  if (s.length > 200) return { error: "That's too long to be a website or company name." };
  s = s.replace(/^[<("'“‘\[]+|[>)"'”’\]]+$/g, "").replace(/[.,;:!?]+$/g, "").trim();
  const notes: string[] = [];
  if (/\w\.{2,}\w/.test(s)) s = s.replace(/\.{2,}/g, ".");

  // Broken schemes: htp://, htttps://, http//, https:/, http:\\ , https;//
  const sch = s.match(/^(h+t+p+s*|h+t+p*s+|ht+ps?|t+ps?|https?)\s*[:;]?\s*(?:\/{1,3}|\\{1,2})\s*/i);
  if (sch) { const fixed = "https://"; if (!/^https?:\/\//i.test(s)) notes.push("fixed the address prefix"); s = fixed + s.slice(sch[0].length); }
  s = s.replace(/^(https?:\/\/)(https?:\/\/)+/i, "$1");

  const hasScheme = /^https?:\/\//i.test(s);
  const rest = hasScheme ? s.replace(/^https?:\/\//i, "") : s;
  const hostPart = rest.split(/[/?#]/)[0];

  // Address-like: "stripe . com", "stripe,com", "www stripe com"
  const spacedDot = /^[\w-]+(\s*[.,]\s*[\w-]+)+$/.test(hostPart.replace(/\s+/g, " "));
  const dotted = /\./.test(hostPart) && !/\s/.test(hostPart);
  if (!hasScheme && !dotted && spacedDot) {
    const fixedHost = hostPart.replace(/\s*[.,]\s*/g, ".");
    s = fixedHost + rest.slice(hostPart.length);
    notes.push("closed up the dots");
  }

  const urlish = hasScheme || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.split(/[?#]/)[0].replace(/\s+/g, "") ) || spacedDot;
  if (urlish) {
    let candidate = s.replace(/^https?:\/\//i, "").replace(/\s+/g, "").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
    const [hostRaw, ...tail] = candidate.split(/(?=[/?#])/);
    let host = hostRaw.replace(/[,;]+/g, ".").replace(/\.+$/, "").toLowerCase();
    if (!host.includes(".")) return { error: `"${raw.trim()}" doesn't look like a web address. Try something like company.com, or type the company name.` };
    const parts = host.split(".");
    const tld = parts[parts.length - 1];
    if (TLD_FIXES[tld]) { notes.push(`corrected .${tld} to .${TLD_FIXES[tld]}`); parts[parts.length - 1] = TLD_FIXES[tld]; host = parts.join("."); }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.split(".").some((p) => !p || p.startsWith("-") || p.endsWith("-")) || !/^[a-z]{2,24}$/.test(host.split(".").pop()!)) {
      return { error: `"${raw.trim()}" isn't a valid web address. Check it for typos, or type the company name.` };
    }
    const stem = host.replace(/^www\./, "").split(".").slice(0, -1).join("");
    if (looksGibberish(stem) && stem.length >= 8) return { error: `"${host}" doesn't look like a real website. Check the spelling.` };
    return { value: `https://${host}${tail.join("")}`, note: notes.length ? `Using ${host} (${notes.join(", ")})` : undefined };
  }

  // A company name.
  if (!/[a-z]/i.test(s)) return { error: "Enter a company name or a website address, for example Stripe or stripe.com." };
  if (/[<>{}|\\^`~]/.test(s) || /(https?|ftp):/i.test(s)) return { error: "That doesn't look like a company name or a website address." };
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  if (letters < 1 || (letters < 2 && s.replace(/\s/g, "").length > 4) || letters / s.replace(/\s/g, "").length < 0.4) return { error: "Enter a company name or a website address, for example Stripe or stripe.com." };
  if (s.split(" ").length > 6) return { error: "Enter just the company name, for example Stripe, or its website address." };
  if (s.split(" ").some((w) => looksGibberish(w)) || looksGibberish(s)) return { error: `"${s}" doesn't look like a company name. Check the spelling, or enter the website address.` };
  return { value: s };
}
