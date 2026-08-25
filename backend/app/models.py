from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, Integer, BigInteger, DateTime, ForeignKey, JSON, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def now(): return datetime.now(timezone.utc)

class User(Base):
    __tablename__="users"
    id: Mapped[int]=mapped_column(primary_key=True)
    email: Mapped[str]=mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str]=mapped_column(String(255))
    is_active: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class Organization(Base):
    __tablename__="organizations"
    id: Mapped[int]=mapped_column(primary_key=True)
    name: Mapped[str]=mapped_column(String(200))
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class OrganizationMember(Base):
    __tablename__="organization_members"
    organization_id: Mapped[int]=mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

class Project(Base):
    __tablename__="projects"
    id: Mapped[int]=mapped_column(primary_key=True)
    organization_id: Mapped[int]=mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    name: Mapped[str]=mapped_column(String(200))
    description: Mapped[str|None]=mapped_column(Text())
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class RetryPolicy(Base):
    __tablename__="retry_policies"
    id: Mapped[int]=mapped_column(primary_key=True)
    strategy: Mapped[str]=mapped_column(String(30), default="exponential")
    max_retries: Mapped[int]=mapped_column(default=3)
    base_delay_seconds: Mapped[int]=mapped_column(default=5)
    max_delay_seconds: Mapped[int]=mapped_column(default=300)

class Queue(Base):
    __tablename__="queues"
    id: Mapped[int]=mapped_column(primary_key=True)
    project_id: Mapped[int]=mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str]=mapped_column(String(200))
    priority: Mapped[int]=mapped_column(default=0)
    concurrency_limit: Mapped[int]=mapped_column(default=4)
    retry_policy_id: Mapped[int|None]=mapped_column(ForeignKey("retry_policies.id", ondelete="SET NULL"))
    is_paused: Mapped[bool]=mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
    __table_args__=(UniqueConstraint("project_id","name",name="uq_queue_project_name"),)

class Job(Base):
    __tablename__="jobs"
    id: Mapped[int]=mapped_column(BigInteger, primary_key=True, autoincrement=True)
    queue_id: Mapped[int]=mapped_column(ForeignKey("queues.id", ondelete="CASCADE"))
    job_type: Mapped[str]=mapped_column(String(20))
    status: Mapped[str]=mapped_column(String(20), default="queued", index=True)
    payload: Mapped[dict]=mapped_column(JSON)
    priority: Mapped[int]=mapped_column(default=0)
    run_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), index=True)
    cron_expr: Mapped[str|None]=mapped_column(String(120))
    batch_id: Mapped[str|None]=mapped_column(String(100), index=True)
    attempt_count: Mapped[int]=mapped_column(default=0)
    max_attempts: Mapped[int]=mapped_column(default=4)
    last_error: Mapped[str|None]=mapped_column(Text())
    claimed_by: Mapped[str|None]=mapped_column(String(200))
    claimed_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    __table_args__=(Index("ix_jobs_claim","queue_id","status","priority","run_at","created_at"),)

class ScheduledJob(Base):
    __tablename__="scheduled_jobs"
    id: Mapped[int]=mapped_column(primary_key=True)
    job_id: Mapped[int]=mapped_column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    cron_expr: Mapped[str]=mapped_column(String(120))
    next_run_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool]=mapped_column(Boolean, default=True)

class Worker(Base):
    __tablename__="workers"
    id: Mapped[str]=mapped_column(String(200), primary_key=True)
    status: Mapped[str]=mapped_column(String(20), default="online")
    started_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
    last_heartbeat: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
    current_jobs: Mapped[int]=mapped_column(default=0)
    hostname: Mapped[str|None]=mapped_column(String(255))

class WorkerHeartbeat(Base):
    __tablename__="worker_heartbeats"
    id: Mapped[int]=mapped_column(BigInteger, primary_key=True, autoincrement=True)
    worker_id: Mapped[str]=mapped_column(ForeignKey("workers.id", ondelete="CASCADE"))
    recorded_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class JobExecution(Base):
    __tablename__="job_executions"
    id: Mapped[int]=mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[int]=mapped_column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"))
    worker_id: Mapped[str|None]=mapped_column(ForeignKey("workers.id", ondelete="SET NULL"))
    attempt_number: Mapped[int]=mapped_column()
    status: Mapped[str]=mapped_column(String(20))
    started_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    result: Mapped[dict|None]=mapped_column(JSON)
    error: Mapped[str|None]=mapped_column(Text())
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class JobLog(Base):
    __tablename__="job_logs"
    id: Mapped[int]=mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[int]=mapped_column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"))
    level: Mapped[str]=mapped_column(String(20), default="INFO")
    message: Mapped[str]=mapped_column(Text())
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)

class DeadLetterJob(Base):
    __tablename__="dead_letter_jobs"
    id: Mapped[int]=mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[int]=mapped_column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    final_error: Mapped[str|None]=mapped_column(Text())
    moved_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
