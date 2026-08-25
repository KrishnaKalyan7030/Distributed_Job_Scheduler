from datetime import datetime,timezone,timedelta
from sqlalchemy import select
from app.models import Job,Queue,RetryPolicy,JobLog,DeadLetterJob

def utcnow(): return datetime.now(timezone.utc)

def retry_delay(policy,attempt):
    strategy=policy.strategy
    if strategy=="fixed": value=policy.base_delay_seconds
    elif strategy=="linear": value=policy.base_delay_seconds*attempt
    else: value=policy.base_delay_seconds*(2**max(attempt-1,0))
    return min(value,policy.max_delay_seconds)

async def claim_jobs(db,worker_id,batch_size=10):
    now=utcnow()
    stmt=(select(Job).join(Queue)
      .where(Job.status.in_(["queued","scheduled"]),Queue.is_paused.is_(False),
               (Job.run_at.is_(None))|(Job.run_at<=now))
        .order_by(Job.priority.desc(),Job.created_at)
        .with_for_update(skip_locked=True).limit(batch_size))
    jobs=list((await db.execute(stmt)).scalars().all())
    for job in jobs:
        job.status="claimed"; job.claimed_by=worker_id; job.claimed_at=now
    await db.commit()
    return jobs

async def write_log(db,job_id,message,level="INFO"):
    db.add(JobLog(job_id=job_id,message=message,level=level)); await db.commit()

async def move_to_dlq(db,job,error):
    job.status="dead"; job.last_error=error
    db.add(DeadLetterJob(job_id=job.id,final_error=error)); await db.commit()

async def retry_or_dlq(db,job,policy,error):
    job.last_error=error
    if job.attempt_count>=job.max_attempts:
        await move_to_dlq(db,job,error); return "dead"
    delay=retry_delay(policy or RetryPolicy(),job.attempt_count)
    job.status="queued"; job.run_at=utcnow()+timedelta(seconds=delay)
    job.claimed_by=None; job.claimed_at=None
    await db.commit(); return "retry"
