"""
Two independent reliability loops that run alongside the worker's main
claim/execute loop:

1. respawn_recurring_jobs:
   Reads `scheduled_jobs` rows whose next_run_at has arrived, creates a new
   `Job` occurrence (job_type='recurring') in the target queue, and advances
   next_run_at using croniter. This is what actually makes RECURRING jobs
   recur — a Job row on its own only ever runs once.

2. reap_stale_workers:
   If a worker's last_heartbeat is older than STALE_WORKER_SECONDS, we
   assume it crashed or was killed without a clean shutdown. Any job it had
   CLAIMED or RUNNING is requeued (status -> 'queued') so another worker can
   pick it up, and the worker itself is marked 'offline'. Without this, a
   killed worker process silently strands jobs forever in 'running' state —
   this is the single most important failure mode for a distributed system
   to handle correctly.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from croniter import croniter
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import ScheduledJob, Job, Worker


def utcnow():
    return datetime.now(timezone.utc)


async def respawn_recurring_jobs():
    async with SessionLocal() as db:
        now = utcnow()
        due = (await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.is_active.is_(True),
                ScheduledJob.next_run_at <= now,
            )
        )).scalars().all()

        for sched in due:
            template_job = await db.get(Job, sched.job_id)
            if not template_job:
                sched.is_active = False
                continue

            new_job = Job(
                queue_id=template_job.queue_id,
                job_type="recurring",
                status="queued",
                payload=template_job.payload,
                priority=template_job.priority,
                run_at=now,
                cron_expr=sched.cron_expr,
                max_attempts=template_job.max_attempts,
            )
            db.add(new_job)

            # advance to the next occurrence so we don't fire again immediately
            sched.next_run_at = croniter(sched.cron_expr, now).get_next(datetime)

        if due:
            await db.commit()


async def reap_stale_workers():
    async with SessionLocal() as db:
        cutoff = utcnow() - timedelta(seconds=settings.stale_worker_seconds)

        stale_workers = (await db.execute(
            select(Worker).where(Worker.status == "online", Worker.last_heartbeat < cutoff)
        )).scalars().all()

        for worker in stale_workers:
            worker.status = "offline"

            stranded_jobs = (await db.execute(
                select(Job).where(
                    Job.claimed_by == worker.id,
                    Job.status.in_(["claimed", "running"]),
                )
            )).scalars().all()

            for job in stranded_jobs:
                job.status = "queued"
                job.last_error = f"Requeued: worker {worker.id} missed heartbeat and was reaped"
                job.claimed_by = None
                job.claimed_at = None

        if stale_workers:
            await db.commit()


async def scheduler_loop(stop_event: asyncio.Event, interval_seconds: int = 5):
    """Runs both reliability checks on a fixed interval until stop_event is set."""
    while not stop_event.is_set():
        try:
            await respawn_recurring_jobs()
            await reap_stale_workers()
        except Exception as e:
            print(f"[scheduler] error: {e}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass
