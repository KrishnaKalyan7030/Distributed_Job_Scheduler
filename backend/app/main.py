import uuid
from datetime import datetime,timezone
from fastapi import FastAPI,Depends,HTTPException,Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select,func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import *
from app.schemas import *
from app.auth import hash_password,verify_password,create_token,current_user

app=FastAPI(title="Distributed Job Scheduler",version="1.0.0")

# Allows the React dashboard (running on a different port, e.g. :5173) to
# call this API from the browser. Locked to localhost dev ports; widen the
# list if you deploy the frontend elsewhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health(): return {"status":"ok"}

@app.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"id":user.id,"email":user.email}

@app.post("/auth/register",response_model=TokenOut)
async def register(data:RegisterIn,db:AsyncSession=Depends(get_db)):
    if await db.scalar(select(User).where(User.email==data.email)): raise HTTPException(409,"Email already registered")
    user=User(email=data.email,password_hash=hash_password(data.password)); org=Organization(name=data.organization_name)
    db.add_all([user,org]); await db.flush(); db.add(OrganizationMember(user_id=user.id,organization_id=org.id)); await db.commit()
    return TokenOut(access_token=create_token(user.id))

@app.post("/auth/login",response_model=TokenOut)
async def login(form:OAuth2PasswordRequestForm=Depends(),db:AsyncSession=Depends(get_db)):
    user=await db.scalar(select(User).where(User.email==form.username))
    if not user or not verify_password(form.password,user.password_hash): raise HTTPException(401,"Incorrect email or password")
    return TokenOut(access_token=create_token(user.id))

def org_ids(user_id): return select(OrganizationMember.organization_id).where(OrganizationMember.user_id==user_id)

@app.post("/projects",response_model=ProjectOut)
async def create_project(data:ProjectCreate,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    oid=await db.scalar(org_ids(user.id).limit(1))
    if not oid: raise HTTPException(400,"No organization")
    p=Project(organization_id=oid,**data.model_dump()); db.add(p); await db.commit(); await db.refresh(p); return p

@app.get("/projects",response_model=list[ProjectOut])
async def projects(user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    r=await db.execute(select(Project).where(Project.organization_id.in_(org_ids(user.id))).order_by(Project.id.desc())); return r.scalars().all()

@app.post("/retry-policies",response_model=RetryPolicyOut)
async def retry_policy(data:RetryPolicyCreate,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    p=RetryPolicy(**data.model_dump()); db.add(p); await db.commit(); await db.refresh(p); return p

async def owned_project(db,pid,uid):
    p=await db.scalar(select(Project).where(Project.id==pid,Project.organization_id.in_(org_ids(uid))))
    if not p: raise HTTPException(404,"Project not found")
    return p

@app.post("/projects/{project_id}/queues",response_model=QueueOut)
async def create_queue(project_id:int,data:QueueCreate,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    await owned_project(db,project_id,user.id)
    q=Queue(project_id=project_id,**data.model_dump()); db.add(q); await db.commit(); await db.refresh(q); return q

@app.get("/projects/{project_id}/queues",response_model=list[QueueOut])
async def queues(project_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    await owned_project(db,project_id,user.id)
    r=await db.execute(select(Queue).where(Queue.project_id==project_id)); return r.scalars().all()

async def owned_queue(db,qid,uid):
    q=await db.scalar(select(Queue).join(Project).where(Queue.id==qid,Project.organization_id.in_(org_ids(uid))))
    if not q: raise HTTPException(404,"Queue not found")
    return q

@app.post("/queues/{queue_id}/pause",response_model=QueueOut)
async def pause(queue_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    q=await owned_queue(db,queue_id,user.id); q.is_paused=True; await db.commit(); await db.refresh(q); return q

@app.post("/queues/{queue_id}/resume",response_model=QueueOut)
async def resume(queue_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    q=await owned_queue(db,queue_id,user.id); q.is_paused=False; await db.commit(); await db.refresh(q); return q

@app.post("/jobs",response_model=JobOut)
async def create_job(data:JobCreate,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    await owned_queue(db,data.queue_id,user.id)
    if data.job_type in ("delayed","scheduled","recurring") and not data.run_at: raise HTTPException(422,"run_at required")
    if data.job_type=="recurring" and not data.cron_expr: raise HTTPException(422,"cron_expr required")
    status="scheduled" if data.run_at and data.run_at>datetime.now(timezone.utc) else "queued"
    j=Job(**data.model_dump(),status=status); db.add(j); await db.commit(); await db.refresh(j); return j

@app.post("/jobs/batch",response_model=list[JobOut])
async def create_batch_jobs(data:BatchJobCreate,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    """
    Creates N jobs that share one batch_id, so they can be tracked/filtered
    together (e.g. "resize these 50 uploaded images"). This is what makes
    BATCH a real distinct job type rather than just a manually-set string.
    """
    await owned_queue(db,data.queue_id,user.id)
    batch_id=str(uuid.uuid4())
    created=[]
    for item_payload in data.payloads:
        j=Job(queue_id=data.queue_id,job_type="batch",status="queued",payload=item_payload,
              priority=data.priority,batch_id=batch_id,max_attempts=data.max_attempts)
        db.add(j); created.append(j)
    await db.commit()
    for j in created: await db.refresh(j)
    return created

@app.get("/jobs",response_model=list[JobOut])
async def jobs(status:str|None=None,queue_id:int|None=None,job_type:str|None=None,batch_id:str|None=None,
               limit:int=Query(50,ge=1,le=200),offset:int=0,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    s=select(Job).join(Queue).join(Project).where(Project.organization_id.in_(org_ids(user.id)))
    if status: s=s.where(Job.status==status)
    if queue_id: s=s.where(Job.queue_id==queue_id)
    if job_type: s=s.where(Job.job_type==job_type)
    if batch_id: s=s.where(Job.batch_id==batch_id)
    r=await db.execute(s.order_by(Job.created_at.desc()).offset(offset).limit(limit)); return r.scalars().all()

@app.get("/jobs/{job_id}",response_model=JobOut)
async def get_job(job_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    j=await db.scalar(select(Job).join(Queue).join(Project).where(Job.id==job_id,Project.organization_id.in_(org_ids(user.id))))
    if not j: raise HTTPException(404,"Job not found")
    return j

@app.post("/jobs/{job_id}/retry",response_model=JobOut)
async def retry_job(job_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    j=await get_job(job_id,user,db); j.status="queued"; j.run_at=datetime.now(timezone.utc); j.last_error=None
    await db.commit(); await db.refresh(j); return j

@app.get("/jobs/{job_id}/executions")
async def executions(job_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    await get_job(job_id,user,db)
    r=await db.execute(select(JobExecution).where(JobExecution.job_id==job_id).order_by(JobExecution.id.desc())); return r.scalars().all()

@app.post("/jobs/{job_id}/schedule-recurring",response_model=JobOut)
async def make_recurring(job_id:int,cron_expr:str,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    """
    Turns an existing job into the template for a recurring schedule: the
    scheduler_loop background task (see app/scheduler.py) will read this
    ScheduledJob row and spawn a fresh occurrence every time cron_expr fires.
    """
    from croniter import croniter
    j=await get_job(job_id,user,db)
    if not croniter.is_valid(cron_expr): raise HTTPException(422,"Invalid cron expression")
    j.job_type="recurring"; j.cron_expr=cron_expr
    next_run=croniter(cron_expr,datetime.now(timezone.utc)).get_next(datetime)
    db.add(ScheduledJob(job_id=j.id,cron_expr=cron_expr,next_run_at=next_run,is_active=True))
    await db.commit(); await db.refresh(j); return j

@app.get("/dlq")
async def list_dlq(user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    """Lists all permanently-failed jobs (Dead Letter Queue) for inspection/replay in the dashboard."""
    r=await db.execute(
        select(DeadLetterJob,Job).join(Job,DeadLetterJob.job_id==Job.id)
        .join(Queue).join(Project).where(Project.organization_id.in_(org_ids(user.id)))
        .order_by(DeadLetterJob.moved_at.desc())
    )
    return [{"dlq_id":d.id,"job_id":j.id,"queue_id":j.queue_id,"payload":j.payload,
             "final_error":d.final_error,"moved_at":d.moved_at,"total_attempts":j.attempt_count}
            for d,j in r.all()]

@app.post("/dlq/{job_id}/replay",response_model=JobOut)
async def replay_from_dlq(job_id:int,user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    """Requeues a dead job for another attempt, resetting its attempt counter."""
    j=await get_job(job_id,user,db)
    j.status="queued"; j.run_at=datetime.now(timezone.utc); j.last_error=None; j.attempt_count=0
    await db.commit(); await db.refresh(j); return j

@app.get("/workers",response_model=list[WorkerOut])
async def workers(user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    r=await db.execute(select(Worker).order_by(Worker.id)); return r.scalars().all()

@app.get("/stats")
async def stats(user=Depends(current_user),db:AsyncSession=Depends(get_db)):
    r=await db.execute(select(Job.status,func.count(Job.id)).join(Queue).join(Project).where(Project.organization_id.in_(org_ids(user.id))).group_by(Job.status))
    by_status=dict(r.all())
    workers_online=await db.scalar(select(func.count(Worker.id)).where(Worker.status=="online"))
    dlq_count=await db.scalar(
        select(func.count(DeadLetterJob.id)).join(Job,DeadLetterJob.job_id==Job.id)
        .join(Queue).join(Project).where(Project.organization_id.in_(org_ids(user.id)))
    )
    return {"jobs_by_status":by_status,"workers_online":workers_online or 0,"dead_letter_count":dlq_count or 0}
