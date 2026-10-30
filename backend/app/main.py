import json, re
from decimal import Decimal, ROUND_HALF_UP
from difflib import SequenceMatcher
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from groq import Groq
from .config import settings
from .database import Base, engine, get_db
from .models import Retailer, Product, Scheme
from .schemas import LoginRequest, TokenOut, RetailerOut, ProductOut, ChatRequest, ChatResponse, ValidateDraftRequest
from .security import verify_password, create_token, current_retailer

Base.metadata.create_all(bind=engine)
app = FastAPI(title="FMCG Voice Agent API", version="1.0.0", description="Bilingual retailer engagement prototype")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health():
    return {"status": "ok", "groq_configured": bool(settings.groq_api_key)}

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    retailer = db.query(Retailer).filter_by(shop_id=payload.shop_id.strip().upper(), active=True).first()
    if not retailer or not verify_password(payload.password, retailer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid shop ID or password.")
    return {"access_token": create_token(retailer.shop_id), "retailer": {"shop_id": retailer.shop_id, "name": retailer.name, "shop_name": retailer.shop_name, "city": retailer.city}}

@app.get("/api/auth/me", response_model=RetailerOut)
def me(retailer: Retailer = Depends(current_retailer)):
    return {"shop_id": retailer.shop_id, "name": retailer.name, "shop_name": retailer.shop_name, "city": retailer.city}

def product_payload(p: Product, scheme: Scheme | None = None):
    return {"id": p.id, "sku": p.sku, "name": p.name, "category": p.category, "unit": p.unit, "unit_price": float(p.unit_price), "stock_qty": p.stock_qty, "description": p.description, "scheme_name": scheme.name if scheme else None, "scheme_details": scheme.details if scheme else None, "scheme_discount_percent": float(scheme.discount_percent) if scheme else 0, "scheme_min_qty": scheme.min_qty if scheme else 1}

def products_with_schemes(db: Session):
    products = db.query(Product).filter_by(active=True).order_by(Product.category, Product.name).all()
    output = []
    for p in products:
        scheme = db.query(Scheme).filter_by(product_id=p.id, active=True).order_by(Scheme.discount_percent.desc()).first()
        output.append(product_payload(p, scheme))
    return output

@app.get("/api/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db), _: Retailer = Depends(current_retailer)):
    return products_with_schemes(db)

@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db), retailer: Retailer = Depends(current_retailer)):
    print("--------->",payload)
    catalog = products_with_schemes(db)
    lang = payload.language
    if not settings.groq_api_key:
        return ChatResponse(reply=("मैं अभी AI सेवा से कनेक्ट नहीं हूँ। आप प्रोडक्ट कैटलॉग से उत्पाद चुन सकते हैं।" if lang == "hi" else "The AI service is not configured yet. You can still browse the verified product catalogue and build a draft order."), language=lang, missing_info=["GROQ_API_KEY is not configured"])
    
    system = f'''You are a careful FMCG retailer voice agent for {retailer.shop_name}. Respond in {"Hindi" if lang == "hi" else "English"}. Scope: FMCG products, verified prices, schemes, stock, follow-ups and draft orders only. Do not invent data. Use only the supplied PostgreSQL catalogue. Maximum negotiated discount is 5%; scheme discount is separate and only applicable if the listed minimum quantity is met. Do not claim stock availability if stock_qty is null. If requested product is out of stock, suggest similar products that have known stock greater than zero; never add alternatives without retailer agreement. Ask clarification for ambiguous product or quantity. Do not place real orders; only draft orders. Return ONLY valid JSON with keys: reply (string), items (array of objects {{product_name:string, quantity:integer}}), missing_info (array of strings). items should contain only clearly requested product/quantity pairs in the latest user message; do not include items from previous context. If no explicit item request, items=[].
    VERIFIED CATALOGUE JSON: {json.dumps(catalog, ensure_ascii=False)}
    CURRENT DRAFT JSON: {json.dumps(payload.draft_items, ensure_ascii=False)}
    SESSION CONTEXT (ephemeral): {json.dumps(payload.session_context[-8:], ensure_ascii=False)}'''

    try:
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(model=settings.groq_model, messages=[{"role":"system","content":system},{"role":"user","content":payload.message}], temperature=0.2, response_format={"type":"json_object"})
        data = json.loads(completion.choices[0].message.content or "{}")
    except Exception as e:
        print("---------------->Exception",e)
        return ChatResponse(reply=("माफ़ कीजिए, अभी AI जवाब उपलब्ध नहीं है। कृपया फिर कोशिश करें या टेक्स्ट में लिखें।" if lang == "hi" else "Sorry, I could not generate a response right now. Please try again or use text input."), language=lang, missing_info=["AI request failed"])
    
    proposed, missing = [], list(data.get("missing_info", []))

    for item in data.get("items", []):
        name = str(item.get("product_name", "")).strip()
        try: 
            qty = int(item.get("quantity", 0))
        except (TypeError, ValueError): 
            qty = 0
            
        if not name or qty <= 0 or qty > 10000:
            missing.append(f"Clarify product and quantity: {name or 'unknown'}")
            continue
        normalized = re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()
        matches = [(SequenceMatcher(None, normalized, re.sub(r"[^a-z0-9 ]", "", p['name'].lower())).ratio(), p) for p in catalog]
        score, match = max(matches, default=(0, None), key=lambda x: x[0])

        if not match or score < 0.58:
            missing.append(f"Product not matched in catalogue: {name}")
            continue
        if match["stock_qty"] is None:
            missing.append(f"Stock quantity unverified for {match['name']}")
            continue
        if match["stock_qty"] <= 0:
            alternatives = [p["name"] for p in catalog if p["category"] == match["category"] and p["stock_qty"] is not None and p["stock_qty"] > 0 and p["id"] != match["id"]][:3]
            note = f"{match['name']} is out of stock. Similar available options: {', '.join(alternatives)}." if alternatives else f"{match['name']} is out of stock and no verified similar alternative was found."
            missing.append(note)
            continue
        proposed.append({"product_id": match["id"], "product_name": match["name"], "quantity": qty, "unit_price": match["unit_price"], "stock_qty": match["stock_qty"]})
    reply = str(data.get("reply", ""))[:4000] or ("कृपया बताएं कि आपको किस उत्पाद और कितनी मात्रा की आवश्यकता है।" if lang == "hi" else "Please tell me which product and quantity you need.")
    if missing:
        reply += "\n\n" + ("ध्यान दें: " if lang == "hi" else "Please note: ") + " ".join(missing)
    return ChatResponse(reply=reply, language=lang, suggested_items=proposed, missing_info=missing)

@app.post("/api/draft/validate")
def validate_draft(payload: ValidateDraftRequest, db: Session = Depends(get_db), _: Retailer = Depends(current_retailer)):
    result, errors, total = [], [], Decimal("0.00")
    for item in payload.items:
        product = db.query(Product).filter_by(id=item.product_id, active=True).first()
        if not product:
            errors.append(f"Product ID {item.product_id} is not in the active catalogue.")
            continue
        if product.stock_qty is None:
            errors.append(f"Stock quantity for {product.name} is unverified; it cannot be included as confirmed availability.")
            continue
        if item.quantity > product.stock_qty:
            errors.append(f"Only {product.stock_qty} {product.unit}(s) of {product.name} are shown in stock.")
            continue
        discount = float(payload.negotiated_discounts.get(str(product.id), 0))
        if discount < 0 or discount > 5:
            errors.append(f"Discount for {product.name} must be between 0% and 5%.")
            continue
        
        unit_price = Decimal(str(product.unit_price))
        scheme = db.query(Scheme).filter_by(product_id=product.id, active=True).order_by(Scheme.discount_percent.desc()).first()
        scheme_pct = Decimal(str(scheme.discount_percent)) if scheme and item.quantity >= scheme.min_qty else Decimal("0")
        final_pct = min(Decimal("100"), Decimal(str(discount)) + scheme_pct)
        line_total = (unit_price * item.quantity * (Decimal("100") - final_pct) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total += line_total
        result.append({"product_id": product.id, "sku": product.sku, "name": product.name, "quantity": item.quantity, "unit": product.unit, "unit_price": float(unit_price), "scheme_name": scheme.name if scheme and scheme_pct else None, "scheme_discount_percent": float(scheme_pct), "negotiated_discount_percent": discount, "final_unit_price_estimate": float((unit_price * (Decimal("100") - final_pct) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)), "line_total_estimate": float(line_total)})
    return {"valid": not errors, "items": result, "estimated_total": float(total), "errors": errors, "note": "Draft estimate only. No order is placed. Verify all terms before fulfilment."}
