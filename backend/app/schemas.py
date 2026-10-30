from pydantic import BaseModel, Field
from typing import Literal

class LoginRequest(BaseModel):
    shop_id: str
    password: str

class RetailerOut(BaseModel):
    shop_id: str
    name: str
    shop_name: str
    city: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    retailer: RetailerOut

class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    unit: str
    unit_price: float
    stock_qty: int | None
    description: str
    scheme_name: str | None = None
    scheme_details: str | None = None
    scheme_discount_percent: float = 0
    scheme_min_qty: int = 1

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "hi"] = "en"
    draft_items: list[dict] = []
    session_context: list[dict] = []

class ProposedItem(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=10000)

class ValidateDraftRequest(BaseModel):
    items: list[ProposedItem]
    negotiated_discounts: dict[str, float] = {}

class ChatResponse(BaseModel):
    reply: str
    language: Literal["en", "hi"]
    suggested_items: list[dict] = []
    missing_info: list[str] = []
