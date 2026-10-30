import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Mic,
  Send,
  ShoppingBasket,
  Package,
  LogOut,
  Volume2,
  FileDown,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Languages,
  Sparkles,
  RotateCcw,
  Search,
} from "lucide-react";
import { jsPDF } from "jspdf";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const currency = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
const hindiScript = (text) => /[\u0900-\u097F]/.test(text);

function App() {
  const [token, setToken] = useState(""),
    [retailer, setRetailer] = useState(null);
  const [shopId, setShopId] = useState("SHOP1001"),
    [password, setPassword] = useState("Retailer@123"),
    [loginError, setLoginError] = useState(""),
    [busyLogin, setBusyLogin] = useState(false);
  const [products, setProducts] = useState([]),
    [catalogError, setCatalogError] = useState(""),
    [search, setSearch] = useState("");
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [speechError, setSpeechError] = useState("");
  const [language, setLanguage] = useState("en"),
    [draft, setDraft] = useState([]),
    [discounts, setDiscounts] = useState({}),
    [quote, setQuote] = useState(null),
    [quoteErrors, setQuoteErrors] = useState([]),
    [confirmed, setConfirmed] = useState(false),
    [tab, setTab] = useState("conversation");
  const [followups, setFollowups] = useState([]),
    [outcome, setOutcome] = useState("Draft order prepared; not submitted"),
    [summaryOpen, setSummaryOpen] = useState(false);
  const bottomRef = useRef(null),
    recognitionRef = useRef(null),
    messagesRef = useRef([]);
  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(
    () => () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });
  async function login(e) {
    e.preventDefault();
    setBusyLogin(true);
    setLoginError("");
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: shopId, password }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || "Login failed");
      setToken(d.access_token);
      setRetailer(d.retailer);
      setMessages([
        {
          role: "assistant",
          content: `Welcome ${d.retailer.name}! I can help with products, verified prices, schemes, stock and draft orders. Aap Hindi ya English mein baat kar sakte hain.`,
        },
      ]);
      setOutcome("Conversation started");
      setDraft([]);
      setFollowups([]);
      setQuote(null);
      setConfirmed(false);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setBusyLogin(false);
    }
  }
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/products`, { headers: headers() })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load product catalogue");
        return r.json();
      })
      .then(setProducts)
      .catch((e) => setCatalogError(e.message));
  }, [token]);
  function logout() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    window.speechSynthesis?.cancel();
    setToken("");
    setRetailer(null);
    setProducts([]);
    setMessages([]);
    setDraft([]);
    setDiscounts({});
    setQuote(null);
    setFollowups([]);
    setConfirmed(false);
    setSummaryOpen(false);
    setInput("");
    setOutcome("Session ended");
    setSpeechError("");
  }
  function speak(text, lang = language) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang === "hi" ? "hi-IN" : "en-IN";
    utter.rate = 0.96;
    window.speechSynthesis.speak(utter);
  }
  function startSpeech() {
    setSpeechError("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSpeechError(
        "Speech recognition is not supported in this browser. Text input is ready.",
      );
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = language === "hi" ? "hi-IN" : "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onerror = () => {
        setListening(false);
        setSpeechError(
          "Speech recognition failed. Switched to text input—please type your request.",
        );
        document.getElementById("chat-input")?.focus();
      };
      rec.onend = () => setListening(false);
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript || "";
        if (!text) {
          setSpeechError("No speech detected. Please type your request.");
          return;
        }
        const detected = hindiScript(text) ? "hi" : language;
        setLanguage(detected);
        setInput(text);
        setTimeout(() => sendMessage(text, detected), 50);
      };
      rec.start();
    } catch {
      setListening(false);
      setSpeechError(
        "Speech recognition failed. Please type your request instead.",
      );
    }
  }
  async function sendMessage(text = input, lang = language) {
    const clean = text.trim();
    if (!clean || busy) return;
    setInput("");
    setBusy(true);
    setSpeechError("");
    const next = [...messagesRef.current, { role: "user", content: clean }];
    setMessages(next);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          message: clean,
          language: lang,
          draft_items: draft,
          session_context: next
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || "Assistant request failed");
      let added = [];
      for (const p of d.suggested_items || []) {
        const current = draft.find((x) => x.product_id === p.product_id);
        const existingQty = current?.quantity || 0;
        if (p.quantity + existingQty > p.stock_qty) {
          added.push(
            `${p.product_name}: requested quantity exceeds verified stock (${p.stock_qty}).`,
          );
          continue;
        }
        setDraft((prev) => {
          const old = prev.find((x) => x.product_id === p.product_id);
          return old
            ? prev.map((x) =>
                x.product_id === p.product_id
                  ? { ...x, quantity: x.quantity + p.quantity }
                  : x,
              )
            : [
                ...prev,
                {
                  ...p,
                  negotiated_discount_percent:
                    discounts[String(p.product_id)] || 0,
                },
              ];
        });
      }
      const assistantText = [d.reply, ...added].filter(Boolean).join("\n");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);
      setOutcome("Conversation in progress");
      setQuote(null);
      setConfirmed(false);
      if (added.length) setQuoteErrors(added);
      speak(assistantText, lang);
    } catch (e) {
      const msg = `I couldn't reach the assistant service: ${e.message}. You can keep using the product catalogue and draft order.`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      setSpeechError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function addProduct(p) {
    if (p.stock_qty === null) {
      setCatalogError(
        `${p.name}: stock is unverified and cannot be added as confirmed availability.`,
      );
      return;
    }
    if (p.stock_qty <= 0) {
      setCatalogError(
        `${p.name} is out of stock. Ask the agent for similar in-stock alternatives.`,
      );
      return;
    }
    setCatalogError("");
    setDraft((prev) => {
      const old = prev.find((x) => x.product_id === p.id);
      if (old) {
        if (old.quantity >= p.stock_qty) {
          setCatalogError(
            `Maximum verified stock for ${p.name} is ${p.stock_qty}.`,
          );
          return prev;
        }
        return prev.map((x) =>
          x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          quantity: 1,
          unit_price: p.unit_price,
          stock_qty: p.stock_qty,
          negotiated_discount_percent: discounts[String(p.id)] || 0,
        },
      ];
    });
    setQuote(null);
    setConfirmed(false);
  }
  function changeQty(id, delta) {
    setDraft((prev) =>
      prev.map((x) =>
        x.product_id !== id
          ? x
          : {
              ...x,
              quantity: Math.max(1, Math.min(x.stock_qty, x.quantity + delta)),
            },
      ),
    );
    setQuote(null);
    setConfirmed(false);
  }
  function removeItem(id) {
    setDraft((prev) => prev.filter((x) => x.product_id !== id));
    setQuote(null);
    setConfirmed(false);
  }
  function setDiscount(id, value) {
    const n = Number(value);
    if (n < 0 || n > 5) return;
    setDiscounts((prev) => ({ ...prev, [String(id)]: n }));
    setDraft((prev) =>
      prev.map((x) =>
        x.product_id === id ? { ...x, negotiated_discount_percent: n } : x,
      ),
    );
    setQuote(null);
    setConfirmed(false);
  }
  async function validateDraft() {
    if (!draft.length) {
      setQuoteErrors(["Add at least one product to the draft."]);
      return;
    }
    try {
      const r = await fetch(`${API}/api/draft/validate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          items: draft.map((x) => ({
            product_id: x.product_id,
            quantity: x.quantity,
          })),
          negotiated_discounts: Object.fromEntries(
            draft.map((x) => [
              String(x.product_id),
              Number(
                discounts[String(x.product_id)] ??
                  x.negotiated_discount_percent ??
                  0,
              ),
            ]),
          ),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.detail || "Validation failed");
      setQuote(d);
      setQuoteErrors(d.errors || []);
      setConfirmed(false);
      if (d.valid) {
        setOutcome("Draft order reviewed; awaiting retailer confirmation");
      }
    } catch (e) {
      setQuoteErrors([e.message]);
    }
  }
  function confirmDraft() {
    if (!quote?.valid) return;
    setConfirmed(true);
    setOutcome(
      "Draft order confirmed by retailer; not submitted to any ordering system",
    );
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          language === "hi"
            ? "धन्यवाद। आपका ड्राफ्ट ऑर्डर पुष्टि हो गया है। कोई वास्तविक ऑर्डर नहीं भेजा गया है।"
            : "Thank you. Your draft order is confirmed for this session. No actual order has been placed.",
      },
    ]);
    speak(
      language === "hi"
        ? "धन्यवाद। आपका ड्राफ्ट ऑर्डर पुष्टि हो गया है। कोई वास्तविक ऑर्डर नहीं भेजा गया है।"
        : "Thank you. Your draft order is confirmed for this session. No actual order has been placed.",
    );
  }
  const filtered = useMemo(
    () =>
      products.filter((p) =>
        `${p.name} ${p.category} ${p.sku}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [products, search],
  );
  function buildSummary() {
    return [
      `RETAILVOICE — SESSION SUMMARY`,
      `Retailer: ${retailer?.name} (${retailer?.shop_id})`,
      `Shop: ${retailer?.shop_name}, ${retailer?.city}`,
      `Date: ${new Date().toLocaleString()}`,
      `Language: ${language === "hi" ? "Hindi" : "English"}`,
      `Outcome: ${outcome}`,
      ``,
      `CONVERSATION`,
      ...messages.map(
        (m) => `${m.role === "user" ? "Retailer" : "Agent"}: ${m.content}`,
      ),
      ``,
      `DRAFT ORDER`,
      ...(quote?.items?.length
        ? quote.items.map(
            (i) =>
              `${i.name} | Qty: ${i.quantity} ${i.unit} | Unit: ${currency(i.unit_price)} | Scheme: ${i.scheme_name || "None"} (${i.scheme_discount_percent}%) | Negotiated discount: ${i.negotiated_discount_percent}% | Estimated line total: ${currency(i.line_total_estimate)}`,
          )
        : draft.map(
            (i) =>
              `${i.product_name} | Qty: ${i.quantity} | Unit: ${currency(i.unit_price)} | Negotiated discount: ${discounts[String(i.product_id)] ?? 0}%`,
          )),
      `Estimated total: ${currency(quote?.estimated_total || 0)}`,
      ``,
      `FOLLOW-UPS`,
      ...(followups.length
        ? followups.map(
            (f) => `${f.date} | ${f.product} | Qty: ${f.quantity} | ${f.notes}`,
          )
        : ["None recorded"]),
      ``,
      `Note: Session-only data. Draft only; no real order was submitted.`,
    ].join("\n");
  }
  function downloadText() {
    const blob = new Blob([buildSummary()], {
      type: "text/plain;charset=utf-8",
    });
    downloadBlob(
      blob,
      `retailvoice-summary-${retailer?.shop_id || "session"}.txt`,
    );
  }
  function downloadPDF() {
    const pdf = new jsPDF();
    const lines = pdf.splitTextToSize(buildSummary(), 175);
    let y = 15;
    for (const line of lines) {
      if (y > 280) {
        pdf.addPage();
        y = 15;
      }
      pdf.text(line, 15, y);
      y += 6;
    }
    pdf.save(`retailvoice-summary-${retailer?.shop_id || "session"}.pdf`);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function addFollowup() {
    const date = document.getElementById("follow-date")?.value,
      product = document.getElementById("follow-product")?.value,
      quantity = document.getElementById("follow-qty")?.value,
      notes = document.getElementById("follow-notes")?.value;
    if (!product?.trim() || !date) {
      setCatalogError("Enter a follow-up date and product.");
      return;
    }
    setFollowups((prev) => [
      ...prev,
      {
        date,
        product,
        quantity: quantity || "Not specified",
        notes: notes || "",
      },
    ]);
    setCatalogError("");
    document.getElementById("follow-product").value = "";
    document.getElementById("follow-qty").value = "";
    document.getElementById("follow-notes").value = "";
  }
  if (!retailer)
    return (
      <main className="login-shell">
        <div className="login-art">
          <div className="brand">
            <span className="brand-mark">
              <ShoppingBasket size={23} />
            </span>
            <span>
              RetailVoice<span className="brand-dot">.</span>
            </span>
          </div>
          <div className="art-copy">
            <div className="eyebrow">
              <Sparkles size={15} /> FMCG RETAILER ENGAGEMENT
            </div>
            <h1>
              Your business,
              <br />
              <em>in conversation.</em>
            </h1>
            <p>
              A bilingual AI sales assistant for product discovery, verified
              pricing, schemes and draft orders.
            </p>
            <div className="art-stats">
              <div>
                <b>EN / HI</b>
                <span>Bilingual voice</span>
              </div>
              <div>
                <b>5%</b>
                <span>Discount cap</span>
              </div>
              <div>
                <b>24/7</b>
                <span>Prototype demo</span>
              </div>
            </div>
          </div>
          <div className="art-foot">VOICE COMMERCE · BUILT FOR RETAIL</div>
        </div>
        <div className="login-panel">
          <div className="login-card">
            <div className="mobile-brand">
              <span className="brand-mark">
                <ShoppingBasket size={21} />
              </span>{" "}
              RetailVoice<span className="brand-dot">.</span>
            </div>
            <div className="eyebrow">RETAILER PORTAL</div>
            <h2>Welcome back</h2>
            <p className="muted">
              Sign in with your sample retailer credentials to start a session.
            </p>
            <form onSubmit={login} className="login-form">
              <label>
                Shop ID
                <input
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              {loginError && (
                <div className="error">
                  <AlertCircle size={16} />
                  {loginError}
                </div>
              )}
              <button className="primary full" disabled={busyLogin}>
                {busyLogin ? "Signing in…" : "Sign in"} <span>→</span>
              </button>
            </form>
            <div className="demo-box">
              <div className="demo-head">
                <span className="demo-dot" /> DEMO ACCOUNTS
              </div>
              <button
                className="demo-account"
                onClick={() => {
                  setShopId("SHOP1001");
                  setPassword("Retailer@123");
                }}
              >
                <span>
                  <b>SHOP1001</b>
                  <small>Ravi General Store · Patna</small>
                </span>
                <span>Use ↗</span>
              </button>
              <button
                className="demo-account"
                onClick={() => {
                  setShopId("SHOP1002");
                  setPassword("Retailer@123");
                }}
              >
                <span>
                  <b>SHOP1002</b>
                  <small>Sana Mini Mart · Gaya</small>
                </span>
                <span>Use ↗</span>
              </button>
              <button
                className="demo-account"
                onClick={() => {
                  setShopId("SHOP1003");
                  setPassword("Retailer@123");
                }}
              >
                <span>
                  <b>SHOP1003</b>
                  <small>Singh Kirana Store · Muzaffarpur</small>
                </span>
                <span>Use ↗</span>
              </button>
              <p className="hint">
                Demo password for all accounts: <code>Retailer@123</code>
              </p>
            </div>
            <div className="privacy-note">
              🔒 Each session is temporary. Conversation history is not stored
              in PostgreSQL.
            </div>
          </div>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <ShoppingBasket size={22} />
          </span>
          <span>
            RetailVoice<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="side-caption">WORKSPACE</div>
        <button
          className={`nav-link ${tab === "conversation" ? "active" : ""}`}
          onClick={() => setTab("conversation")}
        >
          <Mic size={18} /> Voice assistant
        </button>
        <button
          className={`nav-link ${tab === "catalog" ? "active" : ""}`}
          onClick={() => setTab("catalog")}
        >
          <Package size={18} /> Product catalogue{" "}
          <span className="nav-count">{products.length}</span>
        </button>
        <button
          className={`nav-link ${tab === "followups" ? "active" : ""}`}
          onClick={() => setTab("followups")}
        >
          {" "}
          <RotateCcw size={18} /> Follow-ups{" "}
          <span className="nav-count">{followups.length}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="session-chip">
            <span className="online-dot" />
            <span>
              <b>Session active</b>
              <small>Temporary workspace</small>
            </span>
          </div>
          <div className="profile">
            <div className="avatar">
              {retailer.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="profile-copy">
              <b>{retailer.name}</b>
              <small>{retailer.shop_id}</small>
            </div>
            <button className="icon-btn" title="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="crumb">
              WORKSPACE <span>/</span>{" "}
              {tab === "conversation"
                ? "VOICE ASSISTANT"
                : tab === "catalog"
                  ? "PRODUCT CATALOGUE"
                  : "FOLLOW-UPS"}
            </div>
            <h2>
              {tab === "conversation"
                ? "Retailer conversation"
                : tab === "catalog"
                  ? "Product catalogue"
                  : "Follow-up tracker"}
            </h2>
          </div>
          <div className="top-actions">
            <span className="live-pill">
              <span className="online-dot" /> SESSION LIVE
            </span>
            <label className="language-select">
              <Languages size={16} />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Language for voice response"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>
            <button
              className="icon-btn logout-btn"
              onClick={logout}
              title="End session"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {tab === "conversation" && (
          <div className="workspace-grid">
            <section className="conversation-card">
              <div className="card-head">
                <div className="agent-avatar">
                  <Sparkles size={20} />
                </div>
                <div>
                  <b>RetailVoice assistant</b>
                  <small>
                    <span className="online-dot" /> Ready to help ·{" "}
                    {language === "hi" ? "हिन्दी" : "English"}
                  </small>
                </div>
                <div className="head-right">
                  <span className="ai-badge">AI ASSISTED</span>
                </div>
              </div>
              <div className="conversation-body">
                <div className="conversation-date">
                  <span />
                  SESSION TRANSCRIPT
                  <span />
                </div>
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`message-row ${m.role === "user" ? "user-row" : ""}`}
                  >
                    <div
                      className={`message-avatar ${m.role === "user" ? "retailer-avatar" : ""}`}
                    >
                      {m.role === "user" ? (
                        retailer.name[0]
                      ) : (
                        <Sparkles size={16} />
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-meta">
                        <b>{m.role === "user" ? "You" : "RetailVoice"}</b>
                        <span>
                          {m.role === "user" ? "Retailer" : "Assistant"}
                        </span>
                        {m.role === "assistant" && (
                          <button
                            className="speak-btn"
                            title="Speak response"
                            onClick={() => speak(m.content)}
                          >
                            <Volume2 size={14} />
                          </button>
                        )}
                      </div>
                      <div
                        className={`bubble ${m.role === "user" ? "user-bubble" : "assistant-bubble"}`}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="message-row">
                    <div className="message-avatar">
                      <Sparkles size={16} />
                    </div>
                    <div className="bubble assistant-bubble typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="chat-footer">
                {speechError && (
                  <div className="error speech-error">
                    <AlertCircle size={15} />
                    {speechError}
                  </div>
                )}
                <div className="quick-prompts">
                  <button
                    onClick={() =>
                      sendMessage(
                        language === "hi"
                          ? "आज कौन से उत्पाद उपलब्ध हैं?"
                          : "What products are available today?",
                      )
                    }
                  >
                    Check availability
                  </button>
                  <button
                    onClick={() =>
                      sendMessage(
                        language === "hi"
                          ? "बिस्कुट की कीमत और स्कीम बताएं।"
                          : "Tell me biscuit prices and schemes.",
                      )
                    }
                  >
                    Prices & schemes
                  </button>
                  <button
                    onClick={() =>
                      sendMessage(
                        language === "hi"
                          ? "मेरा ड्राफ्ट ऑर्डर बताएं।"
                          : "Review my draft order.",
                      )
                    }
                  >
                    Review draft
                  </button>
                </div>
                <form
                  className="chat-input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                >
                  <button
                    type="button"
                    className={`mic-btn ${listening ? "recording" : ""}`}
                    onClick={
                      listening
                        ? () => recognitionRef.current?.stop()
                        : startSpeech
                    }
                    title={listening ? "Stop listening" : "Speak"}
                  >
                    <Mic size={19} />
                  </button>
                  <input
                    id="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      language === "hi"
                        ? "अपना संदेश लिखें या बोलें…"
                        : "Ask about products, prices, schemes…"
                    }
                    disabled={busy}
                  />
                  <button
                    className="send-btn"
                    disabled={busy || !input.trim()}
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                </form>
                <div className="input-hint">
                  <span>↵ Enter to send</span>
                  <span>
                    <Volume2 size={12} /> Voice replies enabled
                  </span>
                </div>
              </div>
            </section>
            <aside className="order-column">
              <div className="order-card">
                <div className="order-head">
                  <div>
                    <div className="section-label">LIVE DRAFT</div>
                    <h3>
                      Draft order{" "}
                      <span className="order-number">
                        #{retailer.shop_id.slice(-4)}-D
                      </span>
                    </h3>
                  </div>
                  <div className="order-icon">
                    <ShoppingBasket size={19} />
                  </div>
                </div>
                <div className="order-retailer">
                  <div className="avatar small-avatar">
                    {retailer.name
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <b>{retailer.shop_name}</b>
                    <small>
                      {retailer.city} · {retailer.shop_id}
                    </small>
                  </div>
                </div>
                <div className="order-items-head">
                  <span>ITEMS ({draft.length})</span>
                  <span>UNIT PRICE</span>
                </div>
                <div className="order-items">
                  {draft.length === 0 ? (
                    <div className="empty-order">
                      <div className="empty-icon">
                        <ShoppingBasket size={22} />
                      </div>
                      <b>Your draft is empty</b>
                      <p>
                        Ask the assistant to add products, or browse the
                        catalogue.
                      </p>
                      <button onClick={() => setTab("catalog")}>
                        Browse products <span>→</span>
                      </button>
                    </div>
                  ) : (
                    draft.map((item) => (
                      <div className="order-item" key={item.product_id}>
                        <div className="product-initial">
                          {item.product_name
                            .split(" ")
                            .map((x) => x[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div className="order-item-info">
                          <b>{item.product_name}</b>
                          <small>{currency(item.unit_price)} / unit</small>
                          <div className="qty-controls">
                            <button
                              onClick={() =>
                                item.quantity === 1
                                  ? removeItem(item.product_id)
                                  : changeQty(item.product_id, -1)
                              }
                            >
                              <Minus size={12} />
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              onClick={() => changeQty(item.product_id, 1)}
                            >
                              <Plus size={12} />
                            </button>
                            <small>{item.stock_qty} in stock</small>
                          </div>
                          <label className="discount-field">
                            Negotiated discount{" "}
                            <select
                              value={
                                discounts[String(item.product_id)] ??
                                item.negotiated_discount_percent ??
                                0
                              }
                              onChange={(e) =>
                                setDiscount(item.product_id, e.target.value)
                              }
                            >
                              <option value="0">0%</option>
                              <option value="1">1%</option>
                              <option value="2">2%</option>
                              <option value="3">3%</option>
                              <option value="4">4%</option>
                              <option value="5">5% (max)</option>
                            </select>
                          </label>
                        </div>
                        <div className="item-price">
                          {currency(
                            item.unit_price *
                              item.quantity *
                              (1 -
                                Number(
                                  discounts[String(item.product_id)] ??
                                    item.negotiated_discount_percent ??
                                    0,
                                ) /
                                  100),
                          )}
                        </div>
                        <button
                          className="remove-item"
                          onClick={() => removeItem(item.product_id)}
                          title="Remove item"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="order-total">
                  <span>Estimated subtotal</span>
                  <b>
                    {currency(
                      draft.reduce((s, i) => s + i.unit_price * i.quantity, 0),
                    )}
                  </b>
                </div>
                <button
                  className="primary full validate-btn"
                  onClick={validateDraft}
                  disabled={!draft.length}
                >
                  Validate & review order <span>→</span>
                </button>
                {quote && (
                  <div
                    className={`quote-result ${quote.valid ? "quote-ok" : "quote-bad"}`}
                  >
                    <div className="quote-title">
                      {quote.valid ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}{" "}
                      {quote.valid
                        ? "Verified estimate"
                        : "Please resolve issues"}
                    </div>
                    {quote.items?.map((i) => (
                      <div className="quote-line" key={i.product_id}>
                        <span>
                          {i.name} × {i.quantity}
                          <small>
                            Unit {currency(i.unit_price)} · Scheme{" "}
                            {i.scheme_discount_percent}% · Negotiated{" "}
                            {i.negotiated_discount_percent}%
                          </small>
                        </span>
                        <b>{currency(i.line_total_estimate)}</b>
                      </div>
                    ))}
                    {quote.valid && (
                      <div className="quote-total">
                        <span>Estimated total</span>
                        <b>{currency(quote.estimated_total)}</b>
                      </div>
                    )}
                    {quote.errors?.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                    {quote.valid && !confirmed && (
                      <button className="primary full" onClick={confirmDraft}>
                        Confirm draft order
                      </button>
                    )}
                    {confirmed && (
                      <div className="confirmed-label">
                        <CheckCircle2 size={15} /> Draft confirmed · not
                        submitted
                      </div>
                    )}
                  </div>
                )}
                {quoteErrors.length > 0 && !quote && (
                  <div className="error quote-errors">
                    {quoteErrors.join(" ")}
                  </div>
                )}
                <div className="order-disclaimer">
                  Prices and stock are verified against the sample catalogue.
                  This is a draft only; no order is placed.
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-title">
                  <div>
                    <div className="section-label">SESSION TOOLS</div>
                    <h3>Wrap up session</h3>
                  </div>
                  <FileDown size={19} />
                </div>
                <p>
                  Review the conversation and download a summary before ending
                  your session.
                </p>
                <button
                  className="secondary full"
                  onClick={() => setSummaryOpen((v) => !v)}
                >
                  {summaryOpen
                    ? "Hide session summary"
                    : "Preview session summary"}
                </button>
                {summaryOpen && (
                  <div className="summary-preview">
                    <b>Session overview</b>
                    <p>
                      Messages: {messages.length} · Draft items: {draft.length}{" "}
                      · Follow-ups: {followups.length}
                    </p>
                    <p>Outcome: {outcome}</p>
                    <div className="download-row">
                      <button onClick={downloadText}>Text file</button>
                      <button onClick={downloadPDF}>PDF file</button>
                    </div>
                  </div>
                )}
                <button
                  className="text-btn"
                  onClick={() => setTab("followups")}
                >
                  Manage follow-ups <span>→</span>
                </button>
              </div>
            </aside>
          </div>
        )}
        {tab === "catalog" && (
          <section className="page-card">
            <div className="catalog-heading">
              <div>
                <div className="section-label">VERIFIED DATA</div>
                <h3>Product catalogue</h3>
                <p>
                  Prices, schemes and stock status are sourced from PostgreSQL.
                </p>
              </div>
              <div className="catalog-count">{products.length} products</div>
            </div>
            <div className="catalog-search">
              <Search size={18} />
              <input
                placeholder="Search products, categories or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {catalogError && (
              <div className="error catalog-error">
                <AlertCircle size={15} />
                {catalogError}
                <button onClick={() => setCatalogError("")}>×</button>
              </div>
            )}
            <div className="product-grid">
              {filtered.map((p) => (
                <article className="catalog-product" key={p.id}>
                  <div className="catalog-product-top">
                    <span className="catalog-symbol">
                      <Package size={20} />
                    </span>
                    <span
                      className={`stock-badge ${p.stock_qty === null ? "unknown" : p.stock_qty === 0 ? "out" : "in"}`}
                    >
                      {p.stock_qty === null
                        ? "Unverified"
                        : p.stock_qty === 0
                          ? "Out of stock"
                          : `${p.stock_qty} in stock`}
                    </span>
                  </div>
                  <span className="category-tag">{p.category}</span>
                  <h4>{p.name}</h4>
                  <p className="sku">
                    SKU · {p.sku} · per {p.unit}
                  </p>
                  <div className="catalog-price">
                    {currency(p.unit_price)}
                    <small> / {p.unit}</small>
                  </div>
                  {p.scheme_name && (
                    <div className="scheme-tag">
                      <Sparkles size={13} />
                      <span>
                        {p.scheme_name}
                        <small>{p.scheme_details}</small>
                      </span>
                    </div>
                  )}
                  <button
                    className="secondary full add-product-btn"
                    disabled={p.stock_qty === null || p.stock_qty <= 0}
                    onClick={() => addProduct(p)}
                  >
                    <Plus size={15} /> Add to draft
                  </button>
                </article>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="empty-catalog">
                No products match your search.
              </div>
            )}
          </section>
        )}
        {tab === "followups" && (
          <section className="page-card followup-page">
            <div className="catalog-heading">
              <div>
                <div className="section-label">SESSION ONLY</div>
                <h3>Follow-up tracker</h3>
                <p>
                  Record follow-up dates and product requests for this session.
                  No reminders are sent.
                </p>
              </div>
              <div className="catalog-count">{followups.length} records</div>
            </div>
            <form
              className="followup-form"
              onSubmit={(e) => {
                e.preventDefault();
                addFollowup();
              }}
            >
              <label>
                Follow-up date
                <input id="follow-date" type="date" required />
              </label>
              <label>
                Product / request
                <input
                  id="follow-product"
                  placeholder="e.g. Butter Cookies"
                  required
                />
              </label>
              <label>
                Quantity
                <input
                  id="follow-qty"
                  type="number"
                  min="1"
                  placeholder="Optional"
                />
              </label>
              <label>
                Notes
                <input
                  id="follow-notes"
                  placeholder="Retailer preference or context"
                />
              </label>
              <button className="primary">
                <Plus size={16} /> Add follow-up
              </button>
            </form>
            {followups.length === 0 ? (
              <div className="empty-followups">
                <RotateCcw size={28} />
                <b>No follow-ups recorded</b>
                <p>
                  Use the form above to record a retailer's follow-up request.
                </p>
              </div>
            ) : (
              <div className="followup-list">
                {followups.map((f, i) => (
                  <div className="followup-row" key={i}>
                    <div className="follow-date-box">
                      <b>{new Date(f.date + "T12:00:00").getDate()}</b>
                      <small>
                        {new Date(f.date + "T12:00:00").toLocaleDateString(
                          "en-IN",
                          { month: "short" },
                        )}
                      </small>
                    </div>
                    <div className="followup-copy">
                      <b>{f.product}</b>
                      <p>
                        Quantity: {f.quantity} ·{" "}
                        {f.notes || "No additional notes"}
                      </p>
                    </div>
                    <button
                      className="remove-item"
                      onClick={() =>
                        setFollowups((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="summary-download-card">
              <div>
                <b>Export session summary</b>
                <p>
                  Includes conversation, draft order, discounts and follow-ups.
                </p>
              </div>
              <div className="download-row">
                <button onClick={downloadText}>
                  <FileDown size={15} /> Text
                </button>
                <button onClick={downloadPDF}>
                  <FileDown size={15} /> PDF
                </button>
              </div>
            </div>
          </section>
        )}
        <footer className="app-footer">
          <span>
            RETAILVOICE <span>·</span> PROTOTYPE
          </span>
          <span>
            Data-grounded AI <span>·</span> Session-only conversations{" "}
            <span>·</span> Drafts only
          </span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
