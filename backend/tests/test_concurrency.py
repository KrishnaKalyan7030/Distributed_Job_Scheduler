"""
These tests hit a real Postgres database (SKIP LOCKED behavior cannot be
meaningfully tested against SQLite or a mock — it's a Postgres row-locking
feature). Point TEST_DATABASE_URL at a scratch database before running:

    export TEST_DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@localhost:5432/job_scheduler_test
    pytest tests/test_concurrency.py -v

The test database is created/torn down automatically by the fixtures below.
"""
import os
import asyncio
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.db import Base
from app.models import Organization, Project, Queue, Job
from app.services import claim_jobs

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/job_scheduler_test",
)


@pytest.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_only_one_worker_claims_a_single_job(db_session):
    """
    The core correctness guarantee of the whole system: if 10 workers race
    to claim from a queue containing exactly 1 job, exactly 1 worker must
    win. This is what FOR UPDATE SKIP LOCKED in claim_jobs() guarantees.
    """
    org = Organization(name="TestOrg")
    db_session.add(org)
    await db_session.flush()

    project = Project(organization_id=org.id, name="TestProject")
    db_session.add(project)
    await db_session.flush()

    queue = Queue(project_id=project.id, name="test-queue", concurrency_limit=10)
    db_session.add(queue)
    await db_session.flush()

    job = Job(queue_id=queue.id, job_type="immediate", status="queued", payload={"type": "print"})
    db_session.add(job)
    await db_session.commit()

    engine = db_session.bind
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async def try_claim(worker_id: str):
        async with SessionLocal() as session:
            return await claim_jobs(session, worker_id, batch_size=1)

    results = await asyncio.gather(*[try_claim(f"worker-{i}") for i in range(10)])

    winners = [r for r in results if len(r) > 0]
    assert len(winners) == 1, f"Expected exactly 1 worker to claim the job, got {len(winners)}"


@pytest.mark.asyncio
async def test_paused_queue_is_never_claimed_from(db_session):
    org = Organization(name="TestOrg2")
    db_session.add(org)
    await db_session.flush()
    project = Project(organization_id=org.id, name="P2")
    db_session.add(project)
    await db_session.flush()
    queue = Queue(project_id=project.id, name="paused-queue", is_paused=True)
    db_session.add(queue)
    await db_session.flush()
    job = Job(queue_id=queue.id, job_type="immediate", status="queued", payload={})
    db_session.add(job)
    await db_session.commit()

    claimed = await claim_jobs(db_session, "worker-x", batch_size=10)
    assert claimed == []
