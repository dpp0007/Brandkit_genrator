# Deploying BrandMeld

One Node process (Next.js) plus a SQLite file. Use a host with a **persistent disk** and a long-lived process (a VPS, Railway, Render or Fly with a volume). Not Vercel-style serverless: explorations run in the background for a minute or two and SQLite needs the disk.

Requires Node 22.13 or newer (built-in `node:sqlite`).

```bash
npm ci
npm run build
BRANDMELD_SECRET=<long random string> \
BRANDMELD_DATA_DIR=/var/lib/brandmeld \
PORT=3000 npm start
```

- `BRANDMELD_SECRET` encrypts stored API keys. Set it and keep it: if it changes, saved keys can't be decrypted and users must re-enter them. Generate one with `openssl rand -hex 32`.
- `BRANDMELD_DATA_DIR` holds `brandmeld.db`. Keep it on the persistent disk and back it up.
- Put HTTPS in front (the session cookie is `Secure` in production) and forward `X-Forwarded-For` so rate limiting sees client IPs.
- Health check: `GET /api/health`.
- Run a single instance: running jobs and rate limits live in process memory.
- Keep it alive with your host's process manager (systemd, pm2, or the platform's default).
- Leave `TINYFISH_*_URL` and `GEMINI_API_BASE` unset; they are dev-only overrides.

Users bring their own TinyFish and Gemini keys, so no provider keys are configured on the server. The TinyFish Browser API must be enabled on each user's account for colours, fonts and logo.
