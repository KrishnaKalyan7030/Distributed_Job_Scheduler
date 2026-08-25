import asyncio,socket,signal
from contextlib import suppress
from datetime import timedelta
from sqlalchemy import select
from app.config import settings
from app.db import SessionLocal
from app.models import Worker,WorkerHeartbeat,Job,Queue,RetryPolicy,JobExecution
from app.services import claim_jobs,retry_or_dlq,write_log,utcnow
from app.scheduler import scheduler_loop

STOP=asyncio.Event()

async def heartbeat(worker_id):
    while not STOP.is_set():
        async with SessionLocal() as db:
            w=await db.get(Worker,worker_id)
            if w:
                w.last_heartbeat=utcnow(); db.add(WorkerHeartbeat(worker_id=worker_id)); await db.commit()
        try: await asyncio.wait_for(STOP.wait(),timeout=settings.heartbeat_interval_seconds)
        except asyncio.TimeoutError: pass

async def execute(job_id,worker_id,sem):
    async with sem:
        async with SessionLocal() as db:
            job=await db.get(Job,job_id)
            if not job:return
            job.status="running"; job.started_at=utcnow(); job.attempt_count+=1
            ex=JobExecution(job_id=job.id,worker_id=worker_id,attempt_number=job.attempt_count,status="running",started_at=job.started_at)
            db.add(ex); await db.commit(); payload=job.payload or {}
        try:
            kind=payload.get("type","print")
            if kind=="sleep": await asyncio.sleep(float(payload.get("seconds",1))); result={"message":"sleep completed"}
            elif kind=="print": print(f"[{worker_id}] JOB {job_id}: {payload.get('message','hello')}"); result={"message":payload.get("message","hello")}
            elif kind=="fail": raise RuntimeError(payload.get("message","intentional failure"))
            else: await asyncio.sleep(float(payload.get("duration_seconds",0.1))); result={"message":"generic job completed"}
            async with SessionLocal() as db:
                job=await db.get(Job,job_id); ex=(await db.execute(select(JobExecution).where(JobExecution.job_id==job_id,JobExecution.attempt_number==job.attempt_count).order_by(JobExecution.id.desc()))).scalars().first()
                job.status="completed"; job.completed_at=utcnow()
                if ex: ex.status="completed"; ex.finished_at=utcnow(); ex.result=result
                await db.commit()
        except Exception as e:
            async with SessionLocal() as db:
                job=await db.get(Job,job_id); ex=(await db.execute(select(JobExecution).where(JobExecution.job_id==job_id,JobExecution.attempt_number==job.attempt_count).order_by(JobExecution.id.desc()))).scalars().first()
                if ex: ex.status="failed"; ex.finished_at=utcnow(); ex.error=str(e)
                q=await db.get(Queue,job.queue_id); policy=await db.get(RetryPolicy,q.retry_policy_id) if q and q.retry_policy_id else None
                await retry_or_dlq(db,job,policy,str(e)); await write_log(db,job.id,f"Execution failed: {e}","ERROR")

async def run():
    wid=settings.worker_id
    stop_event=asyncio.Event()

    # Register graceful shutdown on both SIGINT (Ctrl+C) and SIGTERM (what
    # `docker stop` / process managers / `kill` send). Without a SIGTERM
    # handler, an orchestrator killing the worker leaves in-flight jobs
    # abruptly severed instead of finishing their current attempt.
    loop=asyncio.get_running_loop()
    def _request_shutdown():
        print(f"\nWorker {wid} received shutdown signal, finishing in-flight jobs...")
        stop_event.set()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, _request_shutdown)

    async with SessionLocal() as db:
        w=await db.get(Worker,wid)
        if not w: w=Worker(id=wid,hostname=socket.gethostname())
        w.status="online"; w.last_heartbeat=utcnow(); db.add(w); await db.commit()

    hb=asyncio.create_task(heartbeat(wid))
    sched=asyncio.create_task(scheduler_loop(stop_event, interval_seconds=settings.heartbeat_interval_seconds))
    sems={}; tasks=set()
    print(f"Worker {wid} started. Ctrl+C to stop gracefully.")
    try:
        while not stop_event.is_set():
            async with SessionLocal() as db:
                qs=(await db.execute(select(Queue).where(Queue.is_paused.is_(False)))).scalars().all()
                for q in qs:
                    sem=sems.setdefault(q.id,asyncio.Semaphore(q.concurrency_limit))
                    jobs=await claim_jobs(db,wid,q.concurrency_limit)
                    for j in jobs:
                        tasks.add(asyncio.create_task(execute(j.id,wid,sem)))
            tasks={t for t in tasks if not t.done()}
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=.5)
            except asyncio.TimeoutError:
                pass
    except (KeyboardInterrupt,asyncio.CancelledError):
        pass
    finally:
        hb.cancel(); sched.cancel()
        with suppress(asyncio.CancelledError): await hb
        with suppress(asyncio.CancelledError): await sched
        # Graceful shutdown: wait for whatever jobs are currently executing
        # to actually finish (they already hold DB transactions mid-flight)
        # rather than killing the process out from under them.
        if tasks:
            print(f"Waiting for {len(tasks)} in-flight job(s) to finish...")
            await asyncio.gather(*tasks,return_exceptions=True)
        async with SessionLocal() as db:
            w=await db.get(Worker,wid)
            if w: w.status="offline"; await db.commit()
        print("Worker stopped cleanly.")

if __name__=="__main__": asyncio.run(run())
