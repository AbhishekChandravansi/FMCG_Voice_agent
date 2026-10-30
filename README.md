# RetailVoice — AI-Powered FMCG Retailer Engagement

A full-stack prototype with React + Vite, FastAPI, PostgreSQL, Groq, browser speech recognition and browser text-to-speech. It demonstrates a bilingual English/Hindi sales assistant for retailers, catalogue-grounded product answers, stock-aware alternative suggestions, discount-limited draft orders, follow-ups, and downloadable session summaries.

## Implemented requirements

- Shop ID + password authentication with three seeded demo retailers.
- English/Hindi interface and responses. The speech transcript is checked for Devanagari text to switch response language; the user can also change language manually.
- Browser speech input with automatic text-input fallback on failure; spoken AI replies through browser text-to-speech.
- Product categories: biscuits/cookies, chips/snacks, beverages, and staples (rice, flour, oil).
- PostgreSQL-backed products, prices, schemes and stock. The AI receives the verified catalogue in its system context; missing details are not to be invented.
- Stock-aware draft validation; unknown stock cannot be treated as confirmed availability. Out-of-stock requests can prompt similar in-stock alternatives.
- Negotiated discount validation capped at 5%, plus quantity-based sample schemes.
- Draft orders only. The final step reads back an itemized estimate and asks the retailer to confirm; no external order is placed.
- Session-only conversation, draft, and follow-up state in the browser. No conversation logs or summaries are persisted to PostgreSQL. The retailer can download a text or PDF summary before ending the session.
- Follow-up date, product, quantity, and notes are recorded for the current session only.

## Requirements

- Python 3.11+ (3.12 recommended)
- Node.js 20+ and npm
- Docker Desktop / Docker Engine for PostgreSQL, or an existing PostgreSQL 15+ database
- A free Groq API key for AI responses: https://console.groq.com/keys
- Chrome or Edge recommended for browser speech recognition. Browser speech recognition requires microphone permission and usually HTTPS or localhost. Text entry remains available if unsupported.

## Quick start

### 1. Start PostgreSQL

From the project root:

```bash
docker compose up -d db
```

The local database is `fmcg_voice`, user `fmcg_user`, password `fmcg_dev_password`, port `5432`. These are development credentials only.

### 2. Configure the FastAPI backend

```bash
cd backend
python -m venv .venv
```

Activate it:

- Windows PowerShell: `\.venv\Scripts\Activate.ps1`
- macOS/Linux: `source .venv/bin/activate`

Then:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env`, then set `GROQ_API_KEY` to your own key and replace `SECRET_KEY` with a long random value. The default Groq model can be changed with `GROQ_MODEL` if it is not available on your account.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

macOS/Linux:

```bash
cp .env.example .env
nano .env
```

Seed sample retailers, products and schemes (run from `backend` with the virtual environment active):

```bash
python -m scripts.seed
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

API health: http://localhost:8000/api/health  
Interactive API docs: http://localhost:8000/docs

### 3. Start the React frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. If the API runs somewhere other than `http://localhost:8000`, create `frontend/.env` containing:

```env
VITE_API_URL=http://localhost:8000
```

Restart Vite after changing environment variables.

## Demo logins

All three accounts use the demo password `Retailer@123`.

| Shop ID | Retailer | Shop |
|---|---|---|
| `SHOP1001` | Ravi Kumar | Ravi General Store, Patna |
| `SHOP1002` | Sana Khan | Sana Mini Mart, Gaya |
| `SHOP1003` | Amit Singh | Singh Kirana Store, Muzaffarpur |

The login screen pre-fills `SHOP1001` and the demo password. Change credentials to try another retailer.

## Demo walkthrough

1. Sign in with `SHOP1001` / `Retailer@123`.
2. Ask: “What biscuits are available and what schemes apply?”
3. Ask: “Add 5 cartons of Classic Marie Biscuits.” The AI can propose a product and quantity; verify the draft card.
4. Ask for `Butter Cookies` to see the out-of-stock handling and similar-product suggestions.
5. Use the catalogue to add a product manually if desired. Manual selection and natural conversation update the same draft.
6. Set a negotiated discount from 0–5%, then select **Validate & review order**. The API checks stock, schemes and discount bounds against PostgreSQL.
7. Review the itemized quote and select **Confirm draft order**. This confirms only the local draft; it does not place an order.
8. Record a follow-up, preview the summary, and download it as PDF or text.
9. Sign out to clear the current browser session. Do not rely on browser state as durable storage.

## Data model

- `retailers`: shop ID, retailer/shop name, city, password hash, active flag.
- `products`: SKU, name, category, unit, unit price, stock quantity (nullable means unverified), active flag, description.
- `schemes`: product, scheme details, percentage, minimum quantity, active flag.

Conversation messages, draft state and follow-ups live only in React state. The backend does not create conversation-history tables or store chat request/response logs.

## API endpoints

- `GET /api/health` — service status and whether Groq is configured.
- `POST /api/auth/login` — shop ID/password authentication, returns JWT.
- `GET /api/auth/me` — current retailer from JWT.
- `GET /api/products` — active catalogue with applicable sample scheme metadata.
- `POST /api/chat` — catalogue-grounded Groq response and proposed product/quantity items; server validates product match and stock before returning additions.
- `POST /api/draft/validate` — checks item IDs, stock quantities, negotiated discount cap, applicable schemes and estimated totals.

## Important prototype limitations / safety

- Demo credentials and PostgreSQL credentials are intentionally simple. Change all secrets before deployment; add rate limiting, TLS, account lockout, audit controls, and secure secret management before production.
- Groq API calls send the current user message, recent ephemeral context, draft items and sample product catalogue to the selected model provider. Do not place real customer or commercially sensitive information in this demo without an approved privacy review.
- Browser speech recognition availability and language handling vary by browser. The app attempts English/Hindi selection based on the current language and recognizes Devanagari transcripts to switch response language. This is not a guarantee of automatic speech-language detection in every browser. The language selector and text fallback are provided.
- The frontend creates the PDF locally from the session summary. jsPDF's built-in font may not render all Devanagari characters perfectly in PDF; the UTF-8 text download is a safer Hindi export. A production-quality Hindi PDF should embed a Unicode font.
- Sample product prices, stock levels, schemes and retailers are fictional test data. No live inventory/ERP integration exists.
- Scheme discount and negotiated discount are displayed separately. The prototype calculates the estimate by applying their percentages additively to the unit price with the combined percentage capped at 100%; adjust this to the business's actual scheme/discount stacking policy before production.
- The current chat parser uses an LLM to extract clear product/quantity requests, then matches against the database catalogue. Always review the generated draft and validated estimate. It does not place or transmit orders.
- Product alternatives are suggestions only. The retailer must explicitly request/add an alternative before it enters the draft.
- The session summary is not saved to PostgreSQL. Download it before signing out or refreshing the page.

## Troubleshooting

- **Database connection failed:** verify `docker compose ps`, database credentials and that port 5432 is free.
- **No catalogue:** run `python -m scripts.seed` from `backend`.
- **AI says not configured:** set `GROQ_API_KEY` in `backend/.env`, then restart Uvicorn.
- **CORS error:** set `CORS_ORIGINS=http://localhost:5173` in `backend/.env` and restart the API.
- **Microphone not available:** allow microphone permission in the browser or use the text input.
- **PDF Hindi glyphs look incorrect:** use the UTF-8 text summary or embed a Devanagari font for a production PDF export.
