from app.database import Base, engine, SessionLocal
from app.models import Retailer, Product, Scheme
from app.security import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()
try:
    retailers = [
        ("SHOP1001", "Ravi Kumar", "Ravi General Store", "Patna", "Retailer@123"),
        ("SHOP1002", "Sana Khan", "Sana Mini Mart", "Gaya", "Retailer@123"),
        ("SHOP1003", "Amit Singh", "Singh Kirana Store", "Muzaffarpur", "Retailer@123"),
    ]
    for shop_id, name, shop_name, city, password in retailers:
        if not db.query(Retailer).filter_by(shop_id=shop_id).first():
            db.add(Retailer(shop_id=shop_id, name=name, shop_name=shop_name, city=city, password_hash=hash_password(password)))
    db.flush()
    products = [
        ("BIS100", "Classic Marie Biscuits", "Biscuits and cookies", "carton", 240, 36, "Everyday tea-time biscuit carton"),
        ("BIS101", "Chocolate Cream Biscuits", "Biscuits and cookies", "carton", 360, 18, "Chocolate cream-filled biscuits"),
        ("BIS102", "Butter Cookies", "Biscuits and cookies", "carton", 420, 0, "Butter-flavoured cookies; currently out of stock"),
        ("SNK200", "Masala Potato Chips", "Chips and snacks", "case", 300, 25, "Classic masala potato chips"),
        ("SNK201", "Salted Potato Chips", "Chips and snacks", "case", 280, 14, "Salted potato chips"),
        ("SNK202", "Spicy Namkeen Mix", "Chips and snacks", "case", 250, 12, "Spicy savoury snack mix"),
        ("BEV300", "Mango Drink 200ml", "Beverages", "case", 480, 20, "Mango-flavoured beverage, 200ml packs"),
        ("BEV301", "Lemon Drink 250ml", "Beverages", "case", 520, 11, "Lemon-flavoured beverage, 250ml packs"),
        ("BEV302", "Orange Drink 200ml", "Beverages", "case", 460, None, "Stock count currently unverified"),
        ("STP400", "Premium Rice 25kg", "Staples", "bag", 1450, 16, "Premium rice, 25kg bag"),
        ("STP401", "Wheat Flour 10kg", "Staples", "bag", 420, 30, "Wheat flour, 10kg bag"),
        ("STP402", "Refined Cooking Oil 5L", "Staples", "tin", 780, 9, "Refined cooking oil, 5 litre tin"),
    ]
    for sku, name, category, unit, price, stock, description in products:
        if not db.query(Product).filter_by(sku=sku).first():
            db.add(Product(sku=sku, name=name, category=category, unit=unit, unit_price=price, stock_qty=stock, description=description))
    db.flush()
    schemes = [
        ("BIS100", "Marie carton offer", "2% catalogue scheme on orders of 5 cartons or more", 2, 5),
        ("SNK200", "Snack case scheme", "3% catalogue scheme on orders of 4 cases or more", 3, 4),
        ("BEV300", "Mango case offer", "2% catalogue scheme on orders of 3 cases or more", 2, 3),
        ("STP400", "Rice volume scheme", "1.5% catalogue scheme on orders of 5 bags or more", 1.5, 5),
    ]
    for sku, name, details, pct, min_qty in schemes:
        p = db.query(Product).filter_by(sku=sku).first()
        if p and not db.query(Scheme).filter_by(product_id=p.id, name=name).first():
            db.add(Scheme(product_id=p.id, name=name, details=details, discount_percent=pct, min_qty=min_qty))
    db.commit()
    print("Seed complete. Demo logins use password Retailer@123.")
    for row in retailers: print(f"{row[0]} / {row[4]} — {row[3]} — {row[2]}")
finally:
    db.close()
