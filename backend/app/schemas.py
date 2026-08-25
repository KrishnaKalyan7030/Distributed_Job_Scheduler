from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    organization_name: str = Field(min_length=2, max_length=200)

class TokenOut(BaseModel):
    access_token: str
    token_type: str="bearer"

class ProjectCreate(BaseModel):
    name: str
    description: str|None=None

class ProjectOut(ProjectCreate):
    id:int; organization_id:int; created_at:datetime
    model_config={"from_attributes":True}

class RetryPolicyCreate(BaseModel):
    strategy:Literal["fixed","linear","exponential"]="exponential"
    max_retries:int=Field(3,ge=0,le=20)
    base_delay_seconds:int=Field(5,ge=0)
    max_delay_seconds:int=Field(300,ge=0)

class RetryPolicyOut(RetryPolicyCreate):
    id:int
    model_config={"from_attributes":True}

class QueueCreate(BaseModel):
    name:str
    priority:int=0
    concurrency_limit:int=Field(4,ge=1,le=100)
    retry_policy_id:int|None=None

class QueueOut(QueueCreate):
    id:int; project_id:int; is_paused:bool; created_at:datetime
    model_config={"from_attributes":True}

class JobCreate(BaseModel):
    queue_id:int
    job_type:Literal["immediate","delayed","scheduled","recurring","batch"]="immediate"
    payload:dict[str,Any]={}
    priority:int=0
    run_at:datetime|None=None
    cron_expr:str|None=None
    batch_id:str|None=None
    max_attempts:int=Field(4,ge=1,le=50)

class BatchJobCreate(BaseModel):
    queue_id:int
    payloads:list[dict[str,Any]]=Field(min_length=1,max_length=1000)
    priority:int=0
    max_attempts:int=Field(4,ge=1,le=50)

class JobOut(BaseModel):
    id:int; queue_id:int; job_type:str; status:str; payload:dict[str,Any]; priority:int
    run_at:datetime|None; cron_expr:str|None; batch_id:str|None; attempt_count:int; max_attempts:int
    last_error:str|None; claimed_by:str|None; claimed_at:datetime|None
    started_at:datetime|None; completed_at:datetime|None; created_at:datetime
    model_config={"from_attributes":True}

class WorkerOut(BaseModel):
    id:str; status:str; started_at:datetime; last_heartbeat:datetime; current_jobs:int; hostname:str|None
    model_config={"from_attributes":True}
