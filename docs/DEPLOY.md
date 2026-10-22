# Deploying to Vercel

**Start keyless.** The first public deploy should have no environment variables at all. It then serves the recorded demo
faces only: nothing can reach the YouCam API, nothing can spend a unit, and there is no key to leak. Turn live analysis on
later, only when you are ready (section 3).

## 1. Import

1. Push the repo to GitHub, then Vercel: **Add New, Project**, import it. The framework (Next.js), install (`npm ci`) and
   build (`npm run build`) settings are detected. Leave the environment variables empty. Click **Deploy**.
2. **Settings, Functions:** keep **Fluid compute** on (the default for new projects). Live analysis is allowed 120 s per
   request; Fluid allows 300 s on Hobby and 800 s on Pro. A project without Fluid caps Hobby at 60 s, and the deploy then
   fails on the 120 s routes.
3. **Settings, Deployment Protection:** if the site should be open to anyone, switch protection off for Production.
4. Check the deploy (spends no units):

   ```
   npx tsx scripts/smoke/deployed.ts https://YOUR-APP.vercel.app --keyless
   ```

   It loads `/`, `/try`, `/try/p2b`, the demo assets, `/api/youcam/status` (must say `replay_only`), `/api/visibility`,
   and asks for a recorded analysis and a recorded render. All eleven checks should pass. Drop `--keyless` once live is on.

## 2. Environment variables

Set them under **Settings, Environment Variables** (mark keys and codes **Sensitive**). A change reaches only new
deployments: redeploy after editing.

| Variable | What it does | Safe default |
|---|---|---|
| `YOUCAM_API_KEY` | Your YouCam API key. Server side only. **Without it the app is replay-only**, whatever `YOUCAM_MODE` says. | empty |
| `YOUCAM_SECRET_KEY` | Not read by the app today (the API authenticates with the key alone). Leave empty. | empty |
| `YOUCAM_MODE` | `replay` forces recorded answers even with a key. `live` or unset: live when a key exists. | unset |
| `REPLAY_UPLOADS` | Dev and test only (Playwright sets it). In replay mode, answers an uploaded photo with a recorded face. **Leave unset on a public deploy**, so uploads are refused. | unset |
| `LIVE_ACCESS_CODES` | Comma-separated codes that unlock live analysis on the project key. Empty means no codes. | empty |
| `LIVE_OPEN` | Anything but empty, `0`, `false`, `no` or `off` opens live: a visitor with no code uses the project key, held by the floor and the caps. Needs `YOUCAM_API_KEY`. | off |
| `LIVE_OPEN_DAILY_CAP` | Live analyses per day across **all** open visitors together (16 units each in HD, about 22 with a session's renders). | `8` |
| `UNIT_FLOOR` | Live refuses a call that would leave the balance at or under this. Can raise the floor, never lower it under 100. The judging deploy uses `300`. | `100` |
| `KILL_SWITCH` | Anything but empty, `0`, `false`, `no` or `off` refuses every paid call, a visitor's own key included. | off |
| `LIVE_DAILY_CAP` | Live analyses per day, per access code or (open mode) per address (16 units each in HD). | `3` |
| `LIVE_RENDER_DAILY_CAP` | Live makeup and simulation renders per day, per code or per address (1 to 4 units each). | `20` |
| `TASK_TOKEN_SECRET` | Signs the tokens that let a browser ask for its YouCam tasks to be deleted when the visitor leaves. Any long random string. Falls back to `YOUCAM_API_KEY`; **with neither, no tokens are issued and clean-up is refused**. | falls back to the key |
| `YOUCAM_ENGINE` | `hd` (16 units) or `sd` (12 units, the budget fallback). | `hd` |
| `YOUCAM_DELETE_TASKS` | `0` stops the browser asking YouCam to delete a visitor's tasks when they leave. | on |

No `.env` file is needed or read in production. `.env.example` lists the same names for local work.

## 3. Turn on live

Only when you are ready, and after a keyless deploy has passed the smoke test. A request runs as one of three callers, in
this order:

1. **Their own YouCam key** (header `x-youcam-key`). The visitor pastes it under **Have a YouCam API key? Use your own**
   on `/try`. The server uses it for that request's YouCam calls only: it is never stored, logged or echoed, the project's
   floor and caps do not apply (these are the visitor's units), and the per-address rate limits and the kill switch still
   do. `/api/youcam/status` checks it with one free `credit()` call. It works on a keyless deploy too; only
   `YOUCAM_MODE=replay` or the kill switch turn it away.
2. **An access code** (header `x-access-code`), from `LIVE_ACCESS_CODES`. Unchanged.
3. **Nobody**, when `LIVE_OPEN=1`: the project key, with the floor, the per-address daily caps and `LIVE_OPEN_DAILY_CAP`.

### Judging deploy

The recipe for the deploy the contest links to. Judges click the link, then **Use my photo**, and get a real result with
no code. If the credits are spent they paste their own YouCam key, or use a demo face.

1. **Name the project with a random suffix**, for example `arms-length-k7m2xq` (six random characters), so that
   `arms-length.vercel.app` is not guessable. Under **Settings, General** the project name sets the `*.vercel.app` domain.
2. Set these under **Settings, Environment Variables** (mark them **Sensitive**):

   ```
   YOUCAM_API_KEY=<the project key>
   LIVE_OPEN=1
   UNIT_FLOOR=300
   LIVE_DAILY_CAP=3
   LIVE_OPEN_DAILY_CAP=8
   TASK_TOKEN_SECRET=<random, for example: openssl rand -base64 24>
   ```

   Leave `LIVE_ACCESS_CODES` empty unless you also want codes. `UNIT_FLOOR=300` switches open live off by itself when the
   balance falls near 300; `LIVE_OPEN_DAILY_CAP=8` limits what a leaked link can burn to about 180 units a day. Redeploy.
3. Open `/try`, tick the 18+ box and press **Use my photo**; run one analysis yourself. Then run the smoke test without
   `--keyless`. Also try the own-key path: paste a key under **Have a YouCam API key? Use your own**.
4. **Never post the URL outside the Devpost submission.** Not in the README, the repo, the video description or an end card.
   The site also sends `noindex, nofollow` and a `robots.txt` that disallows everything, so search engines do not list it.
5. Watch the balance. Every paid call writes one JSON log line (`"type":"ledger"`) with the action, the units and `who`:
   `open`, `byok`, or a short hash of the access code (never the code or a key). Vercel, Logs, search for `ledger`.

### Access codes only

For a private deploy: set `YOUCAM_API_KEY` and `LIVE_ACCESS_CODES` (codes that are long and random, for example
`openssl rand -base64 18`), leave `LIVE_OPEN` off, redeploy. Open `/try`, open **Have a YouCam API key? Use your own**,
enter a code in the access-code field there, and run one analysis yourself.

Visitors without a code still get the demo faces. Live also stays shut if the balance cannot be read.

## 4. Rotate or disable

- **Stop all spending now:** set `KILL_SWITCH=1`, redeploy. Or use Vercel's **Instant Rollback** to the keyless deploy.
- **Close open live but keep codes:** set `LIVE_OPEN=0`, redeploy.
- **Rotate a judge code:** edit `LIVE_ACCESS_CODES` (add the new one, remove the old), redeploy.
- **Rotate the API key:** create a new key in the YouCam console, replace `YOUCAM_API_KEY`, redeploy, delete the old key.
  Sessions that were open lose their end-of-session clean-up, which is harmless. Changing `TASK_TOKEN_SECRET` does the same.
- **Back to demo only:** delete `YOUCAM_API_KEY` (or set `YOUCAM_MODE=replay`), redeploy.

## 5. What protects the deploy

| Guard | Setting |
|---|---|
| Request body | 4 MB for a photo (Vercel's own limit is 4.5 MB), 64 KB for renders, 16 KB for clean-up. Read as a stream, so an oversized body is refused early. |
| Requests per address, per 10 minutes | status 60, analysis 30, renders 120, clean-up 60, `/api/visibility` 20. Over the limit: HTTP 429 with `Retry-After`. |
| Wrong access codes | 8 per address per 10 minutes, then requests that carry a code are refused. Demo faces keep working. A refused own key is not a wrong code. |
| Access code compare | Hashed, then compared in constant time against every configured code. |
| Daily caps, balance floor, kill switch | Section 2. A failed call hands its daily slot back. In open mode the caps are per address (hashed) plus `LIVE_OPEN_DAILY_CAP` for everyone. |
| Own YouCam keys | Sent in a header (or the clean-up body), used for that request, never stored. Not subject to the floor or the daily caps. |
| Errors and logs | Plain-language messages only; no stack traces or paths in responses. Every log line is scrubbed of the project key, the visitor's key and any bearer token before it is written. |
| Search engines | `noindex, nofollow` on every page and a `robots.txt` that disallows everything. |

Limits and daily caps live in each server instance's memory. Vercel can run several instances, so count on them as best
effort. The balance floor (read from YouCam, shared by all instances) and the kill switch are the firm limits.

## 6. Size and time

Measured from the build's file traces (`next build`, uncompressed; Vercel allows 250 MB per function).

| Function | Size | Why | `maxDuration` |
|---|---|---|---|
| `/api/youcam/analysis` | about 9 MB | recorded analyses and masks (7 MB) | 120 s |
| `/api/youcam/makeup`, `/simulate` | about 64 MB each | recorded renders (62 MB) | 90 s |
| `/api/youcam/status` | about 2 MB | none | default |
| `/api/youcam/cleanup` | about 2 MB | none | 60 s |
| `/api/visibility` | about 22 MB on Linux | `sharp` and its native libraries (19 MB) | 60 s |

`next.config.ts` trims each function to the recordings it reads (`outputFileTracingExcludes`). Left alone, tracing pulls
all of `fixtures/` (65 MB) into every function that replays. The demo pages read `public/demo`, which is static and served
by the CDN.

Vercel also caps a response at 4.5 MB. The largest answer here is a recorded render sent as a data URL (about 2.8 MB); an
analysis with all its masks is about 1.8 MB.

`sharp` is a normal dependency: the lockfile lists its Linux x64 binaries, so `npm ci` on Vercel installs them. Nothing
extra to configure. A live analysis takes 10 to 30 s (the client gives up polling after 60 s); a render under 10 s.
