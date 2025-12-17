"""
FastAPI Backend for Shared Home Expense Tracker
Optimized for Vercel deployment
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, timedelta
import os
import jwt
from jwt.exceptions import InvalidTokenError

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
# ========== Database Models ==========

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(20), default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    expenses = relationship("Expense", back_populates="paid_by_user")
    to_buy_items_created = relationship("ToBuyItem", foreign_keys="ToBuyItem.created_by", back_populates="creator")
    to_buy_items_purchased = relationship("ToBuyItem", foreign_keys="ToBuyItem.purchased_by", back_populates="purchaser")

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(7), default="#3498db")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    expenses = relationship("Expense", back_populates="category")

class Expense(Base):
    __tablename__ = "expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    payment_mode = Column(String(20), nullable=False)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(String(10), nullable=False)
    time = Column(String(8), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    category = relationship("Category", back_populates="expenses")
    paid_by_user = relationship("User", back_populates="expenses")

class ToBuyItem(Base):
    __tablename__ = "to_buy_items"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    quantity = Column(String(50))
    target_date = Column(String(10), nullable=False)
    priority = Column(String(20), default="medium")
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    purchased = Column(Boolean, default=False)
    purchased_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    purchase_amount = Column(Float, nullable=True)
    purchase_payment_mode = Column(String(20), nullable=True)
    purchase_date = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    creator = relationship("User", foreign_keys=[created_by], back_populates="to_buy_items_created")
    purchaser = relationship("User", foreign_keys=[purchased_by], back_populates="to_buy_items_purchased")

class Settings(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, nullable=False)
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ========== Pydantic Schemas ==========

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "user"

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class CategoryCreate(BaseModel):
    name: str
    color: str = "#3498db"

class CategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    
    model_config = ConfigDict(from_attributes=True)

class ExpenseCreate(BaseModel):
    amount: float
    category_id: int
    payment_mode: str
    paid_by: int
    date: str
    time: str
    description: Optional[str] = None

class ExpenseResponse(BaseModel):
    id: int
    amount: float
    category_id: int
    payment_mode: str
    paid_by: int
    date: str
    time: str
    description: Optional[str]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ToBuyItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    target_date: str
    priority: str = "medium"
    notes: Optional[str] = None

class ToBuyItemPurchase(BaseModel):
    purchased_by: int
    purchase_amount: float
    purchase_payment_mode: str
    purchase_date: str

class ToBuyItemResponse(BaseModel):
    id: int
    name: str
    quantity: Optional[str]
    target_date: str
    priority: str
    notes: Optional[str]
    created_by: int
    purchased: bool
    purchased_by: Optional[int]
    purchase_amount: Optional[float]
    purchase_payment_mode: Optional[str]
    purchase_date: Optional[str]
    
    model_config = ConfigDict(from_attributes=True)

class SettingsUpdate(BaseModel):
    currency_symbol: str
    home_name: str

# ========== JWT Helper Functions ==========

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        return username
    except InvalidTokenError:
        return None

# ========== FastAPI App ==========

app = FastAPI(
    title="Shared Home Expense Tracker API",
    description="Backend API for managing shared household expenses",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ========== Database Dependency ==========

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ========== Authentication with JWT ==========

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current user from JWT token"""
    token = credentials.credentials
    username = decode_access_token(token)
    
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Verify user has admin role"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

# ========== Startup Event ==========

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                password="admin",
                full_name="Home Admin",
                role="admin"
            )
            user1 = User(
                username="user1",
                password="user1",
                full_name="User One",
                role="user"
            )
            user2 = User(
                username="user2",
                password="user2",
                full_name="User Two",
                role="user"
            )
            db.add_all([admin, user1, user2])
            db.commit()
        
        if db.query(Category).count() == 0:
            categories = [
                Category(name="Groceries", color="#22c55e"),
                Category(name="Rent", color="#3b82f6"),
                Category(name="Utilities", color="#f97316"),
                Category(name="Transportation", color="#8b5cf6"),
                Category(name="Entertainment", color="#ec4899"),
            ]
            db.add_all(categories)
            db.commit()
        
        if db.query(Settings).count() == 0:
            settings = [
                Settings(key="currency_symbol", value="₹"),
                Settings(key="home_name", value="Shared Home")
            ]
            db.add_all(settings)
            db.commit()
    
    finally:
        db.close()

# ========== API Endpoints ==========

@app.get("/")
def root():
    return {"message": "Shared Home Expense Tracker API", "status": "active"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# --- Authentication ---

@app.post("/api/login", response_model=TokenResponse)
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """Login and get JWT token"""
    user = db.query(User).filter(
        User.username == user_login.username,
        User.password == user_login.password
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Create access token
    access_token = create_access_token(
        data={"sub": user.username}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@app.get("/api/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info (validates token)"""
    return current_user

# --- Users ---

@app.get("/api/users", response_model=List[UserResponse])
def get_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(User).all()

@app.post("/api/users", response_model=UserResponse)
def create_user(
    user: UserCreate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    new_user = User(**user.dict())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

# --- Categories ---

@app.get("/api/categories", response_model=List[CategoryResponse])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Category).all()

@app.post("/api/categories", response_model=CategoryResponse)
def create_category(
    category: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(Category).filter(Category.name == category.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category already exists"
        )
    
    new_category = Category(**category.dict())
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category

@app.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}

# --- Expenses ---

@app.get("/api/expenses", response_model=List[ExpenseResponse])
def get_expenses(
    category_id: Optional[int] = None,
    paid_by: Optional[int] = None,
    payment_mode: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Expense)
    
    if category_id:
        query = query.filter(Expense.category_id == category_id)
    if paid_by:
        query = query.filter(Expense.paid_by == paid_by)
    if payment_mode:
        query = query.filter(Expense.payment_mode == payment_mode)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    
    return query.order_by(Expense.date.desc(), Expense.time.desc()).all()

@app.post("/api/expenses", response_model=ExpenseResponse)
def create_expense(
    expense: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_expense = Expense(**expense.dict())
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    return new_expense

@app.delete("/api/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted successfully"}

# --- To-Buy Items ---

@app.get("/api/to-buy", response_model=List[ToBuyItemResponse])
def get_to_buy_items(
    purchased: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ToBuyItem)
    
    if purchased is not None:
        query = query.filter(ToBuyItem.purchased == purchased)
    
    return query.order_by(ToBuyItem.target_date).all()

@app.post("/api/to-buy", response_model=ToBuyItemResponse)
def create_to_buy_item(
    item: ToBuyItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_item = ToBuyItem(
        **item.dict(),
        created_by=current_user.id
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.patch("/api/to-buy/{item_id}/purchase", response_model=ToBuyItemResponse)
def mark_item_purchased(
    item_id: int,
    purchase_info: ToBuyItemPurchase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(ToBuyItem).filter(ToBuyItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item.purchased = True
    item.purchased_by = purchase_info.purchased_by
    item.purchase_amount = purchase_info.purchase_amount
    item.purchase_payment_mode = purchase_info.purchase_payment_mode
    item.purchase_date = purchase_info.purchase_date
    
    # Also create an expense entry
    category = db.query(Category).filter(Category.name == "To-Buy Items").first()
    if not category:
        category = Category(name="To-Buy Items", color="#6366f1")
        db.add(category)
        db.commit()
        db.refresh(category)
    
    expense = Expense(
        amount=purchase_info.purchase_amount,
        category_id=category.id,
        payment_mode=purchase_info.purchase_payment_mode,
        paid_by=purchase_info.purchased_by,
        date=purchase_info.purchase_date,
        time="12:00",
        description=f"Purchase: {item.name}"
    )
    db.add(expense)
    
    db.commit()
    db.refresh(item)
    return item

@app.delete("/api/to-buy/{item_id}")
def delete_to_buy_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(ToBuyItem).filter(ToBuyItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    return {"message": "Item deleted successfully"}

# --- Settings ---

@app.get("/api/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings = db.query(Settings).all()
    return {s.key: s.value for s in settings}

@app.put("/api/settings")
def update_settings(
    settings_update: SettingsUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    # Update currency symbol
    currency_setting = db.query(Settings).filter(Settings.key == "currency_symbol").first()
    if currency_setting:
        currency_setting.value = settings_update.currency_symbol
    else:
        db.add(Settings(key="currency_symbol", value=settings_update.currency_symbol))
    
    # Update home name
    home_setting = db.query(Settings).filter(Settings.key == "home_name").first()
    if home_setting:
        home_setting.value = settings_update.home_name
    else:
        db.add(Settings(key="home_name", value=settings_update.home_name))
    
    db.commit()
    return {"message": "Settings updated successfully"}

# ========== Run Server ==========

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
