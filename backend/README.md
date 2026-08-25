# Distributed Job Scheduler — Backend

FastAPI + PostgreSQL (async SQLAlchemy) backend for the distributed job scheduling platform.

## Architecture at a glance

```
Client (React dashboard)
        |
        v
   FastAPI (app/main.py)  <-- REST API, auth, CRUD, stats
        |
        v
   PostgreSQL  <---------------- Worker process (app/worker.py)
        ^                             |
        |                             +-- polls queues every 0.5s
        |                             +-- claims jobs via SELECT ... FOR UPDATE SKIP LOCKED
        |                             +-- executes jobs concurrently (asyncio.Semaphore per queue)
        |                             +-- sends heartbeats every 5s
        +-----------------------------+-- scheduler_loop (app/scheduler.py):
                                            - respawns recurring (cron) jobs
                                            - reaps stale workers & requeues their stranded jobs
```

You can run **multiple worker processes** against the same database — that's
what makes this "distributed." They will never double-claim the same job
because of Postgres row-level locking (`FOR UPDATE SKIP LOCKED`).

## Setup (no Docker needed)

1. In pgAdmin, create a database named `job_scheduler`.
2. Copy `.env.example` to `.env` and fill in your Postgres password:
   ```
   DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/job_scheduler
   ```
3. Create a virtual environment and install dependencies:
   ```
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   source .venv/bin/activate     # Mac/Linux
   pip install -r requirements.txt
   ```
4. Create the tables — open pgAdmin's Query Tool on the `job_scheduler`
   database and run the contents of `schema.sql`.
5. Start the API:
   ```
   uvicorn app.main:app --reload
   ```
   Open http://127.0.0.1:8000/docs to see and try every endpoint (Swagger UI —
   this doubles as your API documentation deliverable).
6. In a **second terminal** (venv activated), start a worker:
   ```
   python -m app.worker
   ```
   You can open a third terminal and run this again to simulate a second
   distributed worker — watch the logs to see jobs split between them.

## Trying it end-to-end

1. `POST /auth/register` with `{"email":"you@test.com","password":"secret123","organization_name":"MyOrg"}` -> copy the `access_token`.
2. Click **Authorize** in `/docs` and paste the token.
3. `POST /projects` -> `{"name":"Demo Project"}`
4. `POST /projects/{project_id}/queues` -> `{"name":"default","concurrency_limit":4}`
5. `POST /jobs` -> `{"queue_id":1,"job_type":"immediate","payload":{"type":"print","message":"hello world"}}`
6. Watch your worker terminal print the job executing within ~1 second.
7. Try `{"payload":{"type":"fail","message":"boom"}}` to watch it retry with
   exponential backoff and eventually land in `GET /dlq`.

## Demo job payload types (handled by app/worker.py execute())

- `{"type":"print","message":"..."}` — logs a message, succeeds instantly
- `{"type":"sleep","seconds":3}` — simulates a slow job
- `{"type":"fail","message":"..."}` — always fails, to demo retries/DLQ

## Job lifecycle

```
queued/scheduled -> claimed -> running -> completed
                                       -> failed --(retries left?)--> queued (after backoff delay)
                                                  -(no retries left)-> dead (moved to dead_letter_jobs)
```

## Reliability features implemented

- **Atomic claiming**: `FOR UPDATE SKIP LOCKED` — the Postgres-native way to
  let N workers pull from one queue without duplicate execution or blocking
  each other while claiming.
- **Retry strategies**: fixed / linear / exponential, configurable per queue
  via `retry_policies`, capped at `max_delay_seconds`.
- **Dead Letter Queue**: jobs that exhaust `max_attempts` move to
  `dead_letter_jobs` and can be inspected (`GET /dlq`) or replayed
  (`POST /dlq/{job_id}/replay`).
- **Heartbeats + stale worker reaping**: if a worker crashes without a clean
  shutdown, `scheduler.py`'s `reap_stale_workers()` detects the missed
  heartbeat, marks it offline, and requeues any job it had claimed —
  otherwise that job would be stranded in `running` forever.
- **Graceful shutdown**: worker traps `SIGINT`/`SIGTERM`, stops claiming new
  jobs, waits for in-flight jobs to finish, then marks itself offline.
- **Recurring jobs**: `scheduler.py`'s `respawn_recurring_jobs()` reads
  `scheduled_jobs` cron definitions and spawns fresh `Job` occurrences on
  schedule using `croniter`.

## Running tests

```
pip install pytest pytest-asyncio
pytest tests/test_retry.py -v                       # pure unit tests, no DB needed

# concurrency test needs a real Postgres scratch DB (SKIP LOCKED can't be
# tested against SQLite/mocks -- it's a real row-locking feature):
createdb job_scheduler_test   # or create it via pgAdmin
export TEST_DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@localhost:5432/job_scheduler_test
pytest tests/test_concurrency.py -v
```

## Database schema

See `schema.sql` for the full DDL. Summary of tables: `users`,
`organizations`, `organization_members`, `projects`, `retry_policies`,
`queues`, `jobs`, `scheduled_jobs`, `workers`, `worker_heartbeats`,
`job_executions`, `job_logs`, `dead_letter_jobs`.

Key design decisions:
- **Unified `jobs` table** for all 5 job types (immediate/delayed/scheduled/
  recurring/batch) via a `job_type` discriminator column, instead of 5
  separate tables — keeps the worker's claim query (the hottest query in the
  system) simple and avoids duplicating retry/execution/log logic 5 times.
- **Composite index** `ix_jobs_claim(queue_id, status, priority, run_at, created_at)`
  matches the exact shape of the claim query so Postgres can use an index
  scan instead of a sequential scan even with a large `jobs` table.
- **`job_executions`** is append-only (one row per attempt) rather than
  overwriting a single "last result" column — this preserves full retry
  history for the dashboard and for debugging flaky jobs.
- **Cascade rules**: deleting a project cascades to its queues -> jobs
  (orphaned queues/jobs have no meaning). Deleting a shared `retry_policy`
  uses `SET NULL` on queues instead of cascading — a queue shouldn't vanish
  just because someone deleted a retry policy it referenced.
