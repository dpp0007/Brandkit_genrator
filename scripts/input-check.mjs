// Quick self-check for src/lib/input.ts. Run: node --experimental-strip-types scripts/input-check.mjs
import { cleanInput } from "../src/lib/input.ts";
const ok = (i, exp) => { const r = cleanInput(i); const got = r.error ? "ERR" : r.value; const pass = exp === "ERR" ? !!r.error : got === exp; console.log(pass ? "ok  " : "FAIL", JSON.stringify(i), "->", r.error ? "ERR: " + r.error : r.value + (r.note ? "  [" + r.note + "]" : "")); if (!pass) process.exitCode = 1; };
ok("stripe", "stripe"); ok("Stripe Payments", "Stripe Payments"); ok("IBM", "IBM"); ok("Nvidia", "Nvidia"); ok("Tumblr", "Tumblr"); ok("Spotify", "Spotify"); ok("3M", "3M"); ok("H&M", "H&M"); ok("Procter & Gamble", "Procter & Gamble");
ok("stripe.com", "https://stripe.com"); ok("https://www.Stripe.com/pricing", "https://www.stripe.com/pricing"); ok("  stripe.com.  ", "https://stripe.com");
ok("stripe.con", "https://stripe.com"); ok("stripe.cmo", "https://stripe.com"); ok("linear.app", "https://linear.app");
ok("htp://stripe.com", "https://stripe.com"); ok("http//stripe.com", "https://stripe.com"); ok("https:/stripe.com", "https://stripe.com"); ok("htttps://stripe.com", "https://stripe.com"); ok("https://https://stripe.com", "https://stripe.com");
ok("stripe . com", "https://stripe.com"); ok("www,stripe,com", "https://www.stripe.com"); ok("stripe..com", "https://stripe.com"); ok('"stripe.com"', "https://stripe.com");
ok("asdfghjkl", "ERR"); ok("qwertyuiop", "ERR"); ok("aaaaaaaa", "ERR"); ok("xkcdjskdjfh", "ERR"); ok("zzzzzz", "ERR"); ok("1234567", "ERR"); ok("!!!???", "ERR"); ok("", "ERR"); ok("....", "ERR"); ok("bcdfghjklm", "ERR"); ok("stripe.", "stripe");
ok("<script>alert(1)</script>", "ERR"); ok("localhost", "localhost"); ok("a b c d e f g h", "ERR"); ok("🙂🙂🙂", "ERR"); ok("stripe.c", "ERR"); ok("-stripe-.com", "ERR");
