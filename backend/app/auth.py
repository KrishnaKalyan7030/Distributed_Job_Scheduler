from datetime import datetime,timedelta,timezone
from jose import jwt,JWTError
from passlib.context import CryptContext
from fastapi import Depends,HTTPException,status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db import get_db
from app.models import User

pwd_context=CryptContext(schemes=["bcrypt"],deprecated="auto")
oauth2_scheme=OAuth2PasswordBearer(tokenUrl="/auth/login")

def hash_password(password): return pwd_context.hash(password)
def verify_password(password,hashed): return pwd_context.verify(password,hashed)
def create_token(user_id):
    exp=datetime.now(timezone.utc)+timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub":str(user_id),"exp":exp},settings.secret_key,algorithm="HS256")

async def current_user(token=Depends(oauth2_scheme),db:AsyncSession=Depends(get_db)):
    exc=HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="Invalid authentication credentials")
    try:
        payload=jwt.decode(token,settings.secret_key,algorithms=["HS256"])
        user_id=int(payload.get("sub"))
    except (JWTError,TypeError,ValueError): raise exc
    user=await db.get(User,user_id)
    if not user or not user.is_active: raise exc
    return user
