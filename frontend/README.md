# Pulse — Job Scheduler Dashboard (Frontend)

React + Vite dashboard for the Distributed Job Scheduler backend.

## What's inside

- **Overview** — live job-status breakdown and worker count (polls every 3s)
- **Queues** — create projects/queues, view config, pause/resume
- **Jobs** — explorer with status filters, job creation (immediate/delayed/scheduled/recurring/batch), a detail drawer showing full execution/retry history, and one-click retry
- **Workers** — every registered worker with heartbeat freshness
- **Dead Letters** — every permanently-failed job, each with an automated **failure analysis** (see below) and a one-click replay

## Setup

1. Make sure the backend is running first (`uvicorn app.main:app --reload` on `http://127.0.0.1:8000`).
2. Install dependencies:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open `http://localhost:5173`. Register an account (this calls the backend directly), then use the sidebar to navigate.

If your backend runs on a different port, change `API_URL` at the top of `src/api.js`.

## Live updates

The dashboard uses polling (every 2.5–4s depending on the page) rather than WebSockets. This was a deliberate trade-off for the project's time budget — polling requires no extra server-side connection state and is visually indistinguishable from push-based updates at this interval. See the design-decisions doc for the fuller reasoning; swapping in a `WebSocket`/`EventSource` connection to a `/ws/jobs` endpoint would be the natural next iteration.

## The "AI-generated failure summary" feature

On the Dead Letters page, each failed job gets an automated diagnosis (`src/failureInsight.js`). This is a **deterministic, rule-based analyzer** — it pattern-matches the error text against common failure categories (timeouts, network errors, permission issues, bad input data, rate limiting, missing resources, memory exhaustion) and returns a plain-English diagnosis plus a suggested fix.

This is a conscious design choice, documented honestly rather than dressed up: it needs no API key, has zero latency and zero cost, and is fully explainable — you can point to exactly which rule matched. The function signature (`analyzeFailure(dlqEntry) -> {category, summary, suggestion}`) is intentionally the same shape a real LLM-backed version would have, so swapping in an actual call to an LLM API (e.g. a new backend endpoint that forwards the error text to Claude/GPT and returns a generated summary) would be a drop-in replacement with zero changes needed elsewhere in the UI.

## Design notes

- Dark, data-dense theme intentional for an operational dashboard (not a marketing page) — monospace for IDs/timestamps/data, sans-serif for UI chrome, semantic color coding per job/worker status (green=healthy, amber=in-progress, red=failed, violet=dead-lettered).
- No component library — plain Tailwind utility classes (via CDN, no build step needed) for full control and a small bundle.
- JWT stored in `localStorage`; every API call in `src/api.js` attaches it automatically.
