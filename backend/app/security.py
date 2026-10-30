from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import Retailer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def create_token(shop_id: str) -> str:
    expiry = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": shop_id, "exp": expiry}, settings.secret_key, algorithm=ALGORITHM)

def current_retailer(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Retailer:
    if not credentials:
        raise HTTPException(status_code=401, detail="Please sign in with your shop ID and password.")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[ALGORITHM])
        shop_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    retailer = db.query(Retailer).filter_by(shop_id=shop_id, active=True).first()
    if not retailer:
        raise HTTPException(status_code=401, detail="Retailer account not found or inactive.")
    return retailer
