# Deploying BrandMeld

BrandMeld stores its data in **MongoDB Atlas**, so it runs on serverless hosts such as Vercel as well as on a normal server. There is no local database file to worry about.

## 1. Set up MongoDB Atlas

1. Create a free cluster at https://cloud.mongodb.com.
2. **Database Access** → add a database user (username and password).
3. **Network Access** → add an IP access entry. Vercel and most serverless hosts have no fixed IPs, so use `0.0.0.0/0` (allow from anywhere); the database user's password is what protects it. On a server with a fixed IP, allow only that IP.
4. **Connect** → *Drivers* → copy the connection string and add your database name before the `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/brandmeld?retryWrites=true&w=majority
   ```
   (URL-encode special characters in the password.) Collections and indexes are created automatically on the first request.

## 2. Environment variables

| Variable | Value |
|---|---|
| `MONGODB_URI` | the connection string above |
| `BRANDMELD_SECRET` | a long random string (`openssl rand -hex 32`). **Required in production.** Keep it: if it changes, saved API keys can't be decrypted. |

Do **not** set `TINYFISH_*_URL` or `GEMINI_API_BASE` (development-only overrides).

## 3a. Vercel

1. Import the repository in Vercel (framework: Next.js; no build settings needed).
2. Add the two environment variables above (Production, and Preview if you use it).
3. Deploy, then open `https://<your-app>/api/health`. It should return `{"ok":true}`.

Explorations run in the background after the request returns. The explore route sets `maxDuration = 300` seconds and uses Next's `after()` to keep the function alive until the run finishes, while progress is written to MongoDB so any instance can serve the progress page. If your Vercel plan caps function duration below what a run needs (often 30 to 90 seconds), long explorations are cut off and show "didn't finish"; use a plan with longer limits, or the server option below.

Rate limits are counted per serverless instance, so they are weaker there than on a single server.

## 3b. Any Node server (VPS, Railway, Render, Fly)

Requires Node 22 or newer.

```bash
npm ci
npm run build
MONGODB_URI="…" BRANDMELD_SECRET="…" PORT=3000 npm start
```

Put HTTPS in front (the session cookie is `Secure` in production) and forward `X-Forwarded-For` so rate limiting sees client IPs. Use your host's process manager to keep it running.

## Local development

```bash
cp .env.example .env.local      # fill in MONGODB_URI (an Atlas free cluster is fine)
npm install
npm run dev
```

## Securing Atlas

- Create the database user with the **`readWrite` role on the `brandmeld` database only** (Database Access → Edit → Built-in role → "Only read and write to any database" is too broad; choose *Specific privileges*), never an admin user.
- Use a long random password (letters and numbers avoid URL-encoding problems). Rotate it if it was ever pasted into chat, email or a ticket.
- Network Access has to allow `0.0.0.0/0` for Vercel, so that password is the lock. Optionally use Vercel's static-IP or Atlas PrivateLink options on paid plans to narrow it.
- Never commit `.env` files (they are ignored in this repo).

## Speed

Match your **Vercel function region** to your **Atlas cluster region** (Vercel → Settings → Functions → Region; for example a Mumbai Atlas cluster pairs with `bom1`). Every database call crosses that distance, and a mismatch (functions in Washington, database in Mumbai) adds a few hundred milliseconds to each one.

## Notes

- Health check: `GET /api/health` (it pings the database).
- Users bring their own TinyFish and Gemini keys; no provider keys are configured on the server.
- The TinyFish Browser API must be enabled on each user's account for colours, fonts and logo.
- The TinyFish browser is driven with Node's built-in WebSocket, so Node 22 is required.
