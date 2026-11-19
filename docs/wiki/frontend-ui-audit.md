# Frontend UI Audit — Docker Runtime Branch

Date: 2026-08-05
Branch: `local/benchmark-eval-work` (pushed as `docker-runtime`)
Audited via: automated browser agent (DOM / computed-style / console / network inspection; screenshot capture was unavailable in that session).

## Background

The `docker-runtime` branch cherry-picked 9 upstream hardening commits instead of merging `origin/main` (which swapped Docker for a Node.js orchestrator runtime). Commit `3485855` ("Harden YouTube live source flow") brought the upstream `App.jsx` wholesale, but `styles.css` was auto-merged by git, silently mixing the old local stylesheet with upstream changes.

## Findings (audit on the pre-fix build)

### 🔴 Major: SVG icons rendered as broken black silhouettes

- The `Icon` component renders Lucide-style **stroke-based** paths, but the
  `.icon` CSS rule (`fill: none; stroke: currentColor; stroke-width: 1.8;`)
  was **missing** from our merged `styles.css`.
- Computed styles: `stroke: none; fill: rgb(0,0,0)` → open paths invisible,
  closed shapes solid black blobs.
- Scope: 22 icons on the home page alone (brand mark, sidebar nav, module
  cards, buttons); app-wide impact.
- Root cause: upstream `3485855:frontend/src/styles.css` contains the full
  `.icon` rule set; the cherry-pick auto-merge dropped it because the file
  was not flagged as a conflict.

### 🟠 Undefined CSS custom properties

- `--warning` — used by `.dashboard-data-alert` and pending/processing/queued
  task status chips. `:root` defined `--success` and `--danger` but not
  `--warning` → these elements fall back to inherited text color (latent:
  only a "completed" task existed at audit time).
- `--shadow-sm` — used by `.report-card`; only `--shadow` was defined, so
  report cards rendered without shadow.
- Same root cause: stylesheet fragments lost in the auto-merge.

### 🟡 Dead weight

- Google Fonts `Material Symbols Outlined` was loaded on every page but
  referenced by zero elements (icons are inline SVG). Pure bandwidth waste.

### 🟢 Minor

- Sidebar showed `VEHICLES COUNTED: --` while the dashboard showed `0`
  (placeholder inconsistency with no active source).
- Workflow step badges differ per section (`01–04` vs single badges) — likely
  intentional, noted for consistency review.

## Verified clean

- Console: **0 errors / 0 warnings** — no `VITE_API_BASE_URL` errors after
  the same-origin `client.js` patch (commit `4879f61`), no failed fetches.
- Network: all CSS/JS/font/API requests 200/304, no asset 404s.
- Fonts: Inter body + JetBrains Mono telemetry applied correctly.
- Responsive CSS: breakpoints at 1080/1100/980/720/640px collapse layout
  sensibly; no horizontal overflow or clipping.

## Fix applied (pending user review — currently UNCOMMITTED)

Because the local frontend contained **no local-only customization** (only
upstream `3485855` content plus the same-origin patch), the whole upstream
frontend was adopted at once — this also picks up all later visual polish
commits (`a43492e`, `2abf890`, `d662dcd`, `6e7e753`, `1e92d70`, `167af19`,
`f5dda86`) that the cherry-pick plan had skipped:

```bash
git checkout origin/main -- frontend/
# then re-applied the same-origin patch in frontend/src/api/client.js
# (assertApiConfiguration is a no-op; see [[Local DB Fallback]] sibling note on same-origin serving)
```

Brought in: `App.jsx` (updated), `LandingPage.jsx` (new), full `styles.css`
rewrite, `favicon.svg`, `vite.config.js`, `frontend/.env.example`,
`public/assets/traffic-camera-fallback.png`.

### Backend endpoint compatibility check

All endpoints the new frontend calls exist in our backend (verified via
`/openapi.json`):

| Frontend call | Backend | Note |
|---|---|---|
| `GET /api/v1/dashboard/stats` | ✅ 200 | |
| `GET /ready` | ✅ 200 | |
| `POST /videos` | ✅ | upload; 404 on GET is expected (POST-only) |
| `POST /tasks` | ✅ | task creation; POST-only |
| `POST /api/v1/lanes/config` | ✅ | POST-only |
| `/live/*` (resolve, validate-config, sessions) | ✅ | compat router mounted at `/live` |

Docker images were rebuilt with the new frontend (`docker compose up -d --build`);
`/health`, `/ready`, dashboard stats all healthy.

## Outstanding items

1. **Visual re-verification** — confirm icons/typography render correctly in
   a real browser session (the audit agent's screenshot tool was broken).
2. **Commit & push decision** — the frontend sync is staged but uncommitted;
   commit message suggestion: `feat(frontend): adopt upstream frontend wholesale for docker-runtime`.
3. If any upstream frontend commit is cherry-picked again later, remember:
   - preserve the same-origin `client.js` patch (no `VITE_API_BASE_URL` required);
   - prefer `git checkout origin/main -- frontend/` over per-commit picks since the frontend has no local customization.

## Answer to the strategy question

The UI "dirtiness" was **not** caused by choosing cherry-pick over the
Node.js runtime. It was a merge artifact: a non-conflicted auto-merge of
`styles.css` dropped upstream CSS. The runtime decision (keep Docker, skip
the Node orchestrator) remains valid — the Node orchestrator hardcodes
`.venv/bin/python` Linux paths and does not run on Windows. The fix is to
adopt upstream frontend files wholesale, which is independent of runtime.
