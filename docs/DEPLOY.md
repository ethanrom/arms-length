# Deploying to Vercel

**Start keyless.** The first public deploy should have no environment variables at all. It then serves the recorded demo
faces only: nothing can reach the YouCam API, nothing can spend a unit, and there is no key to leak. Turn live analysis on
later, with a judge access code, only when you are ready (section 3).

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
| `LIVE_ACCESS_CODES` | Comma-separated codes that unlock live analysis. **Empty means live is off**, even with a key. | empty |
| `UNIT_FLOOR` | Live refuses a call that would leave the balance at or under this. Can raise the floor, never lower it under 100. | `100` |
| `KILL_SWITCH` | Anything but empty, `0`, `false`, `no` or `off` refuses every paid call. | off |
| `LIVE_DAILY_CAP` | Live analyses per access code per day (16 units each in HD). | `3` |
| `LIVE_RENDER_DAILY_CAP` | Live makeup and simulation renders per code per day (1 to 4 units each). | `20` |
| `YOUCAM_ENGINE` | `hd` (16 units) or `sd` (12 units, the budget fallback). | `hd` |
| `YOUCAM_DELETE_TASKS` | `0` stops the browser asking YouCam to delete a visitor's tasks when they leave. | on |

No `.env` file is needed or read in production. `.env.example` lists the same names for local work.

## 3. Turn on live for judges

Only when you are ready, and after a keyless deploy has passed the smoke test.

1. Make codes that are long and random, for example `openssl rand -base64 18`, one per judge or one for all.
2. Add `YOUCAM_API_KEY` and `LIVE_ACCESS_CODES` (and, if you like, the caps). Leave `UNIT_FLOOR` alone. Redeploy.
3. Open `/try`, enter a code under **Check mine**, run one analysis yourself. Then run the smoke test without `--keyless`.
4. Watch the balance. Every paid call writes one JSON log line (`"type":"ledger"`) with the action, units and a short hash
   of the code (never the code). Vercel, Logs, search for `ledger`.

Visitors without a code still get the demo faces. Live also stays shut if the balance cannot be read.

## 4. Rotate or disable

- **Stop all spending now:** set `KILL_SWITCH=1`, redeploy. Or use Vercel's **Instant Rollback** to the keyless deploy.
- **Rotate a judge code:** edit `LIVE_ACCESS_CODES` (add the new one, remove the old), redeploy.
- **Rotate the API key:** create a new key in the YouCam console, replace `YOUCAM_API_KEY`, redeploy, delete the old key.
  Sessions that were open lose their end-of-session clean-up, which is harmless.
- **Back to demo only:** delete `YOUCAM_API_KEY` (or set `YOUCAM_MODE=replay`), redeploy.

## 5. What protects the deploy

| Guard | Setting |
|---|---|
| Request body | 4 MB for a photo (Vercel's own limit is 4.5 MB), 64 KB for renders, 16 KB for clean-up. Read as a stream, so an oversized body is refused early. |
| Requests per address, per 10 minutes | status 60, analysis 30, renders 120, clean-up 60, `/api/visibility` 20. Over the limit: HTTP 429 with `Retry-After`. |
| Wrong access codes | 8 per address per 10 minutes, then requests that carry a code are refused. Demo faces keep working. |
| Access code compare | Hashed, then compared in constant time against every configured code. |
| Daily caps, balance floor, kill switch | Section 2. A failed call hands its daily slot back. |
| Errors | Plain-language messages only; no stack traces, paths or keys in responses or logs. |

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
