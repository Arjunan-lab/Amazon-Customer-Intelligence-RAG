import React, { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import { sendMessage, submitChatFeedback } from "../api";

function compactText(value = "", maxLen = 62) {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

const AmazonIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '65%', height: '65%', display: 'block', margin: 'auto' }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" fill="#FF9900" />
    <path d="M5 3v4M3 5h4M19 17v4M17 19h4" stroke="#1a1a1b" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════
   Chat History Helpers (localStorage)
   ═══════════════════════════════════════════════════════════════ */
const HISTORY_KEY = "amazon_copilot_chat_history";
const MAX_HISTORY = 50;

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(sessions) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser) {
    const text = firstUser.content.replace(/\s+/g, " ").trim();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  }
  return "New conversation";
}

function formatHistoryDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ═══════════════════════════════════════════════════════════════
   Export Helpers
   ═══════════════════════════════════════════════════════════════ */
function exportAsText(messages) {
  const lines = messages.map((m) => {
    const role = m.role === "user" ? "You" : "Amazon Copilot";
    const time = new Date(m.timestamp || Date.now()).toLocaleString();
    return `[${time}] ${role}:\n${m.content}\n`;
  });
  const blob = new Blob([lines.join("\n---\n\n")], { type: "text/plain" });
  downloadBlob(blob, `chat-export-${Date.now()}.txt`);
}

function exportAsJSON(messages) {
  const data = messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    sources: m.sources || [],
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, `chat-export-${Date.now()}.json`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyAllMessages(messages) {
  const text = messages
    .map((m) => `${m.role === "user" ? "You" : "Copilot"}: ${m.content}`)
    .join("\n\n");
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Sentiment Dashboard Data Extraction
   ═══════════════════════════════════════════════════════════════ */
function aggregateSentiment(messages) {
  let totalPositive = 0, totalNeutral = 0, totalNegative = 0, count = 0;
  const allStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const positiveKeywords = {};
  const negativeKeywords = {};

  const positiveWordList = ['great', 'excellent', 'good', 'love', 'amazing', 'fantastic', 'perfect', 'best', 'happy', 'satisfied', 'recommend', 'quality', 'comfortable', 'impressive', 'smooth', 'fast', 'reliable', 'durable', 'premium', 'beautiful'];
  const negativeWordList = ['bad', 'poor', 'terrible', 'awful', 'worst', 'hate', 'disappointing', 'broken', 'defective', 'complaint', 'issue', 'problem', 'slow', 'expensive', 'cheap', 'flimsy', 'unreliable', 'overheating', 'laggy', 'scratches'];

  for (const msg of messages) {
    if (msg.role !== "bot" || msg.isError || !msg.content) continue;
    const lower = msg.content.toLowerCase();

    // Check if this is a sentiment-relevant response
    const isSentimentResponse =
      (lower.includes('positive') && lower.includes('negative')) ||
      lower.includes('sentiment') || lower.includes('rating') ||
      lower.includes('complaints') || lower.includes('strengths') ||
      lower.includes('weaknesses') || lower.includes('review');

    if (!isSentimentResponse) continue;

    // Extract sentiment
    let positive = 0, neutral = 0, negative = 0;
    const pctMatch = lower.match(/(\d+)%?\s*(?:positive|good|favorable|happy|satisfied)/);
    const negMatch = lower.match(/(\d+)%?\s*(?:negative|bad|unfavorable|unhappy|dissatisfied|complaint)/);
    const neuMatch = lower.match(/(\d+)%?\s*(?:neutral|mixed|moderate)/);

    if (pctMatch) positive = parseInt(pctMatch[1], 10);
    if (negMatch) negative = parseInt(negMatch[1], 10);
    if (neuMatch) neutral = parseInt(neuMatch[1], 10);

    if (positive === 0 && negative === 0 && neutral === 0) {
      const pWords = (lower.match(/\b(great|excellent|good|love|amazing|fantastic|perfect|best|happy|satisfied|recommend|quality)\b/g) || []).length;
      const nWords = (lower.match(/\b(bad|poor|terrible|awful|worst|hate|disappointing|broken|defective|complaint|issue|problem)\b/g) || []).length;
      if (pWords + nWords >= 2) {
        positive = Math.round((pWords / (pWords + nWords + 2)) * 100);
        negative = Math.round((nWords / (pWords + nWords + 2)) * 100);
        neutral = 100 - positive - negative;
      }
    }

    if (positive + negative + neutral > 0) {
      totalPositive += positive;
      totalNeutral += neutral;
      totalNegative += negative;
      count++;
    }

    // Extract star distribution
    const starMatches = msg.content.match(/(\d)\s*(?:star|★|⭐)[^\d]*?(\d+)/gi);
    if (starMatches) {
      starMatches.forEach(m => {
        const parts = m.match(/(\d)\s*(?:star|★|⭐)[^\d]*?(\d+)/i);
        if (parts) allStars[parseInt(parts[1])] = (allStars[parseInt(parts[1])] || 0) + parseInt(parts[2]);
      });
    }

    // Extract keywords
    positiveWordList.forEach(w => {
      const regex = new RegExp(`\\b${w}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) positiveKeywords[w] = (positiveKeywords[w] || 0) + matches.length;
    });
    negativeWordList.forEach(w => {
      const regex = new RegExp(`\\b${w}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) negativeKeywords[w] = (negativeKeywords[w] || 0) + matches.length;
    });
  }

  if (count === 0) return null;

  const avgPositive = Math.round(totalPositive / count);
  const avgNegative = Math.round(totalNegative / count);
  const avgNeutral = 100 - avgPositive - avgNegative;

  const topPositive = Object.entries(positiveKeywords).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topNegative = Object.entries(negativeKeywords).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const hasStars = Object.values(allStars).some(v => v > 0);

  return {
    positive: avgPositive,
    neutral: avgNeutral,
    negative: avgNegative,
    count,
    stars: hasStars ? allStars : null,
    topPositive,
    topNegative,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Keyboard Shortcuts Modal
   ═══════════════════════════════════════════════════════════════ */
function ShortcutsModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <h2>⌨️ Keyboard Shortcuts</h2>
        <p className="shortcuts-subtitle">Navigate faster with these shortcuts</p>

        <div className="shortcuts-group">
          <h3>Chat</h3>
          <div className="shortcut-item">
            <span className="shortcut-label">Send message</span>
            <div className="shortcut-keys"><kbd>Enter</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">New line</span>
            <div className="shortcut-keys"><kbd>Shift</kbd><kbd>Enter</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Clear chat</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>L</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Focus input</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>I</kbd></div>
          </div>
        </div>

        <div className="shortcuts-group">
          <h3>Export & Copy</h3>
          <div className="shortcut-item">
            <span className="shortcut-label">Copy all messages</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>C</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Export as text</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>E</kbd></div>
          </div>
        </div>

        <div className="shortcuts-group">
          <h3>Navigation</h3>
          <div className="shortcut-item">
            <span className="shortcut-label">Chat history</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>H</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Sentiment dashboard</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>D</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Show shortcuts</span>
            <div className="shortcut-keys"><kbd>Ctrl</kbd><kbd>/</kbd></div>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-label">Close modal</span>
            <div className="shortcut-keys"><kbd>Esc</kbd></div>
          </div>
        </div>

        <button className="shortcuts-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Chat History Panel
   ═══════════════════════════════════════════════════════════════ */
function HistoryPanel({ isOpen, onClose, history, activeSessionId, onSelectSession, onDeleteSession, onNewChat }) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? history.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : history;

  return (
    <>
      <div className={`history-panel-overlay ${isOpen ? "open" : ""}`} onClick={onClose} />
      <aside className={`history-panel ${isOpen ? "open" : ""}`} aria-label="Chat history">
        <div className="history-header">
          <h2>Chat History</h2>
          <div className="history-header-actions">
            <button className="history-new-btn" onClick={onNewChat} title="New chat" aria-label="Start new chat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button className="history-close-btn" onClick={onClose} aria-label="Close history">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="history-search">
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="history-list custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="history-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p>{search ? "No matching conversations" : "No chat history yet.\nStart a conversation!"}</p>
            </div>
          ) : (
            filtered.map((session) => (
              <div
                key={session.id}
                className={`history-item ${session.id === activeSessionId ? "active" : ""}`}
                onClick={() => { onSelectSession(session.id); onClose(); }}
              >
                <div className="history-item-icon">💬</div>
                <div className="history-item-content">
                  <div className="history-item-title">{session.title}</div>
                  <div className="history-item-meta">
                    {session.messageCount} messages · {formatHistoryDate(session.updatedAt)}
                  </div>
                </div>
                <div className="history-item-actions">
                  <button
                    className="history-item-action-btn delete"
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sentiment Dashboard Modal
   ═══════════════════════════════════════════════════════════════ */
function SentimentDashboard({ data, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!data) {
    return (
      <div className="sentiment-dashboard-overlay" onClick={onClose}>
        <div className="sentiment-dashboard" onClick={(e) => e.stopPropagation()}>
          <div className="sentiment-dashboard-header">
            <div>
              <h2>Sentiment Dashboard</h2>
              <p>Aggregated analysis from chat responses</p>
            </div>
            <button className="sentiment-close-btn" onClick={onClose} aria-label="Close dashboard">✕</button>
          </div>
          <div className="sentiment-no-data">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
            <p>No sentiment data yet.<br/>Ask questions about product reviews, complaints, or strengths to see analytics here.</p>
          </div>
        </div>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 70; // radius=70
  const posLen = (data.positive / 100) * circumference;
  const neuLen = (data.neutral / 100) * circumference;
  const negLen = (data.negative / 100) * circumference;
  const posOffset = 0;
  const neuOffset = posLen;
  const negOffset = posLen + neuLen;

  return (
    <div className="sentiment-dashboard-overlay" onClick={onClose}>
      <div className="sentiment-dashboard" onClick={(e) => e.stopPropagation()}>
        <div className="sentiment-dashboard-header">
          <div>
            <h2>📊 Sentiment Dashboard</h2>
            <p>Aggregated from {data.count} analyzed response{data.count !== 1 ? "s" : ""}</p>
          </div>
          <button className="sentiment-close-btn" onClick={onClose} aria-label="Close dashboard">✕</button>
        </div>

        <div className="sentiment-grid">
          {/* Donut Chart */}
          <div className="donut-container">
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <svg className="donut-svg" viewBox="0 0 180 180">
                <circle className="donut-ring positive"
                  cx="90" cy="90" r="70"
                  strokeDasharray={`${posLen} ${circumference - posLen}`}
                  strokeDashoffset={`-${posOffset}`}
                />
                <circle className="donut-ring neutral"
                  cx="90" cy="90" r="70"
                  strokeDasharray={`${neuLen} ${circumference - neuLen}`}
                  strokeDashoffset={`-${neuOffset}`}
                />
                <circle className="donut-ring negative"
                  cx="90" cy="90" r="70"
                  strokeDasharray={`${negLen} ${circumference - negLen}`}
                  strokeDashoffset={`-${negOffset}`}
                />
              </svg>
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(0deg)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {data.positive}%
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Positive
                </div>
              </div>
            </div>

            <div className="donut-legend">
              <div className="donut-legend-item">
                <span className="legend-dot positive" />
                <span>Positive {data.positive}%</span>
              </div>
              <div className="donut-legend-item">
                <span className="legend-dot neutral" />
                <span>Neutral {data.neutral}%</span>
              </div>
              <div className="donut-legend-item">
                <span className="legend-dot negative" />
                <span>Negative {data.negative}%</span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="sentiment-stats">
            <div className="sentiment-stat-card positive">
              <div className="stat-label">Positive</div>
              <div className="stat-value">{data.positive}%</div>
              <div className="stat-sub">Overall positive sentiment</div>
            </div>
            <div className="sentiment-stat-card negative">
              <div className="stat-label">Negative</div>
              <div className="stat-value">{data.negative}%</div>
              <div className="stat-sub">Overall negative sentiment</div>
            </div>
            <div className="sentiment-stat-card">
              <div className="stat-label">Neutral</div>
              <div className="stat-value">{data.neutral}%</div>
              <div className="stat-sub">Neither positive nor negative</div>
            </div>
            <div className="sentiment-stat-card">
              <div className="stat-label">Responses Analyzed</div>
              <div className="stat-value">{data.count}</div>
              <div className="stat-sub">Bot responses with sentiment</div>
            </div>
          </div>
        </div>

        {/* Star Distribution */}
        {data.stars && (
          <div className="dashboard-star-section">
            <h3>⭐ Rating Distribution</h3>
            <div className="star-distribution-grid">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = data.stars[star] || 0;
                const maxCount = Math.max(...Object.values(data.stars), 1);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div className="star-bar-row" key={star}>
                    <span className="star-bar-label">{star}★</span>
                    <div className="star-bar-track">
                      <div className="star-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="star-bar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Keyword Cloud */}
        {(data.topPositive.length > 0 || data.topNegative.length > 0) && (
          <div className="keyword-cloud-section" style={{ marginTop: '24px' }}>
            <h3>🏷️ Top Keywords</h3>
            <div className="keyword-cloud">
              {data.topPositive.map(([word, count], i) => (
                <span key={`p-${word}`} className="keyword-tag positive" style={{ animationDelay: `${i * 0.06}s` }}>
                  {word} ({count})
                </span>
              ))}
              {data.topNegative.map(([word, count], i) => (
                <span key={`n-${word}`} className="keyword-tag negative" style={{ animationDelay: `${(data.topPositive.length + i) * 0.06}s` }}>
                  {word} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Export Dropdown
   ═══════════════════════════════════════════════════════════════ */
function ExportDropdown({ messages, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="export-dropdown" ref={ref}>
      <button onClick={() => { exportAsText(messages); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Export as .txt
        <span className="export-hint">Ctrl+Shift+E</span>
      </button>
      <button onClick={() => { exportAsJSON(messages); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Export as .json
      </button>
      <button onClick={() => { copyAllMessages(messages); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy all messages
        <span className="export-hint">Ctrl+Shift+C</span>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main ChatBox Component
   ═══════════════════════════════════════════════════════════════ */
export default function ChatBox({
  activeSourceId = null,
  activeScope = null,
  scopeLoading = false,
  onSwitchSource,
  onOpenAdmin,
  onSelectDisambiguationCandidate,
  isSidebarOpen = true,
  onToggleSidebar,
}) {
  const initialMessage = {
    role: "bot",
    content: "Ask about specs, complaints, value, or fit. Answers stay within the active data scope.",
    sources: [],
    timestamp: Date.now(),
  };

  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSentiment, setShowSentiment] = useState(false);
  const [toast, setToast] = useState(null);

  // Chat History state
  const [chatHistory, setChatHistory] = useState(() => loadHistory());
  const [activeSessionId, setActiveSessionId] = useState(() => generateSessionId());

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const compactSourceLabel = compactText(activeScope?.compactName || activeScope?.productName || "", 68);

  const defaultFollowUps = ["colors", "price", "storage variants", "camera", "battery"];

  // Show toast
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-save to history when messages change
  useEffect(() => {
    if (messages.length <= 1) return; // Don't save just the initial message

    const title = deriveTitle(messages);
    const sessionData = {
      id: activeSessionId,
      title,
      messages,
      messageCount: messages.length,
      createdAt: messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    };

    setChatHistory((prev) => {
      const existing = prev.findIndex((s) => s.id === activeSessionId);
      let updated;
      if (existing >= 0) {
        updated = [...prev];
        updated[existing] = sessionData;
      } else {
        updated = [sessionData, ...prev];
      }
      saveHistory(updated);
      return updated;
    });
  }, [messages, activeSessionId]);

  /* ── Keyboard Shortcuts ──────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+/ — show shortcuts
      if (ctrl && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((p) => !p);
        return;
      }

      // Ctrl+L — clear chat
      if (ctrl && e.key === "l") {
        e.preventDefault();
        handleClearChat();
        return;
      }

      // Ctrl+I — focus input
      if (ctrl && e.key === "i") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Ctrl+Shift+C — copy all
      if (ctrl && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        copyAllMessages(messages);
        showToast("All messages copied to clipboard ✓");
        return;
      }

      // Ctrl+Shift+E — export text
      if (ctrl && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        exportAsText(messages);
        showToast("Chat exported as .txt ✓");
        return;
      }

      // Ctrl+H — toggle history
      if (ctrl && e.key === "h") {
        e.preventDefault();
        setShowHistory((p) => !p);
        return;
      }

      // Ctrl+D — toggle sentiment dashboard
      if (ctrl && e.key === "d") {
        e.preventDefault();
        setShowSentiment((p) => !p);
        return;
      }

      // Escape — close modals
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setShowSentiment(false);
        setShowHistory(false);
        setShowExport(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages, showToast]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMessage = {
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendMessage(
        question,
        activeSourceId,
        activeSourceId ? "source" : "dataset"
      );

      const responseCode = response?.error?.code || null;
      const actionableContent = buildActionableMessage(response, question);

      const botMessage = {
        role: "bot",
        content: actionableContent,
        sources: response.sources || [],
        meta: response.meta || null,
        error: response.error || null,
        isError: Boolean(response.error) || response.meta?.status === "failed",
        linkedQuestion: question,
        followUps: responseCode ? [] : buildFollowUps(question, response.answer || "", defaultFollowUps),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = {
        role: "bot",
        content:
          "I could not reach the backend service. Please retry, or verify that the API server is running.",
        sources: [],
        timestamp: Date.now(),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRetry = async (question) => {
    if (!question || isLoading) return;
    sendWithQuestion(question);
  };

  const sendWithQuestion = async (question) => {
    if (!question.trim()) return;
    const userMessage = {
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendMessage(
        question,
        activeSourceId,
        activeSourceId ? "source" : "dataset"
      );

      const responseCode = response?.error?.code || null;
      const botMessage = {
        role: "bot",
        content: buildActionableMessage(response, question),
        sources: response.sources || [],
        meta: response.meta || null,
        error: response.error || null,
        isError: Boolean(response.error) || response.meta?.status === "failed",
        linkedQuestion: question,
        followUps: responseCode ? [] : buildFollowUps(question, response.answer || "", defaultFollowUps),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleEditQuery = (question) => {
    if (!question) return;
    setInput(question);
    inputRef.current?.focus();
  };

  const handleFollowUp = (topic) => {
    if (isLoading) return;
    const query = `Tell me about ${topic}${activeScope?.productName ? ` for ${activeScope.productName}` : ""}`;
    sendWithQuestion(query);
  };

  const handleFeedback = async ({ vote, reason, message }) => {
    if (!message || !vote) return;
    try {
      await submitChatFeedback({
        vote,
        reason: reason || null,
        linkedQuestion: message.linkedQuestion || null,
        answerPreview: (message.content || "").slice(0, 400),
        sourceId: message.meta?.sourceId || activeSourceId || null,
        sourceType: message.meta?.sourceType || activeScope?.sourceType || null,
        mode: message.meta?.mode || activeScope?.mode || null,
      });
    } catch {
      // Feedback should never interrupt chat flow.
    }
  };

  const handleSelectCandidate = async ({ candidate, message }) => {
    if (!candidate || !onSelectDisambiguationCandidate) return;

    const selected = await onSelectDisambiguationCandidate(candidate);
    if (!selected?.success) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: `Could not activate selected candidate: ${selected?.message || "Unknown error"}`,
          sources: [],
          isError: true,
          linkedQuestion: message?.linkedQuestion || null,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    const followUpQuestion = message?.linkedQuestion || `Tell me key specs for ${candidate.name || candidate.asin}`;
    sendWithQuestion(followUpQuestion);
  };

  const fetchedAtText = activeScope?.fetchedAt ? new Date(activeScope.fetchedAt).toLocaleString() : "n/a";

  const handleClearChat = () => {
    const newId = generateSessionId();
    setActiveSessionId(newId);
    setMessages([{
      role: "bot",
      content: "Chat cleared. Ask your next question.",
      sources: [],
      timestamp: Date.now(),
    }]);
  };

  // History handlers
  const handleSelectSession = (sessionId) => {
    const session = chatHistory.find((s) => s.id === sessionId);
    if (session) {
      setActiveSessionId(session.id);
      setMessages(session.messages);
    }
  };

  const handleDeleteSession = (sessionId) => {
    setChatHistory((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      saveHistory(updated);
      return updated;
    });
    if (sessionId === activeSessionId) {
      handleClearChat();
    }
  };

  const handleNewChat = () => {
    handleClearChat();
    setShowHistory(false);
  };

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark'
        || localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const sentimentData = aggregateSentiment(messages);

  return (
    <div className="neural-chat-container glowing-border">
      <div className="holographic-header">
        <div className="holo-content">
          <button
            className="menu-toggle-btn"
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="logo-3d-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
            <AmazonIcon />
            <div className="hologram-scanline"></div>
          </div>
          <div className="holo-text">
            <h2>Customer Intelligence Console</h2>
            <div className="data-stream">
              <span className="pulse-dot"></span>
              <span className="data-text">
                {activeSourceId && activeScope?.productName
                  ? `Source: ${compactSourceLabel}`
                  : "Source: Dataset"}
              </span>
            </div>
          </div>
        </div>
        <div className="header-actions-group">
          {/* History button */}
          <button
            className="cyber-btn sm"
            onClick={() => setShowHistory(true)}
            title="Chat history (Ctrl+H)"
            aria-label="Open chat history"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          {/* Sentiment Dashboard button */}
          <button
            className="cyber-btn sm"
            onClick={() => setShowSentiment(true)}
            title="Sentiment dashboard (Ctrl+D)"
            aria-label="Open sentiment dashboard"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
          </button>
          {/* Export dropdown */}
          <div className="export-dropdown-wrapper">
            <button
              className="cyber-btn sm"
              onClick={() => setShowExport((p) => !p)}
              title="Export chat"
              aria-label="Export chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            {showExport && <ExportDropdown messages={messages} onClose={() => setShowExport(false)} />}
          </div>
          {/* Keyboard shortcuts */}
          <button
            className="cyber-btn sm"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts (Ctrl+/)"
            aria-label="Keyboard shortcuts"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/>
            </svg>
          </button>
          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={() => setIsDark(prev => !prev)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          {/* Clear chat */}
          <button className="cyber-btn sm" onClick={handleClearChat} title="Clear chat (Ctrl+L)" aria-label="Clear chat history">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="active-scope-banner" role="status" aria-live="polite">
        {scopeLoading ? (
          <div className="scope-main scope-main-loading" aria-label="Loading source metrics">
            <span className="scope-skeleton w-lg"></span>
            <span className="scope-skeleton w-sm"></span>
            <span className="scope-skeleton w-md"></span>
            <span className="scope-skeleton w-sm"></span>
          </div>
        ) : (
          <div className="scope-main">
            <strong>{activeScope?.compactName || "Dataset Corpus"}</strong>
            <span>{activeScope?.sourceType || "dataset"}</span>
            <span>Fetched: {fetchedAtText}</span>
            <span>Docs: {activeScope?.docsIndexed ?? "n/a"}</span>
          </div>
        )}
        <div className="scope-actions">
          <button onClick={onSwitchSource} className="scope-btn">Switch Source</button>
          <button onClick={onOpenAdmin} className="scope-btn secondary">Admin</button>
        </div>
      </div>

      <section className="cyber-messages-area custom-scrollbar" aria-label="Conversation Messages">
        {messages.map((msg, index) => (
          <MessageBubble
            key={index}
            message={msg}
            onRetry={handleRetry}
            onEditQuery={handleEditQuery}
            onFollowUp={handleFollowUp}
            onFeedback={handleFeedback}
            onSelectCandidate={handleSelectCandidate}
          />
        ))}

        {!isLoading && messages.length === 1 && (
          <div className="suggestion-container stagger-up">
            {activeSourceId && activeScope?.productName && (
              <div
                title={activeScope.productName}
                style={{ marginBottom: '12px', fontSize: '0.8rem', color: '#9ad1ff', letterSpacing: '0.35px' }}
              >
                Active source: <strong>{compactText(activeScope.productName, 56)}</strong>
                {activeScope.asin ? ` (${activeScope.asin})` : ""}
              </div>
            )}
            <p className="suggestion-label shadow-text">Quick prompts</p>
            <div className="suggestion-grid">
              {[
                "Top recurring complaints",
                "Best-fit customer profile",
                "Strengths vs weaknesses",
                "Price-to-value summary"
              ].map((q, i) => (
                <button 
                  key={i} 
                  className="suggestion-chip"
                  onClick={() => {
                    sendWithQuestion(q);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="message-row bot-row expanding-in" aria-live="polite">
            <div className="avatar bot-avatar cyber-glow">
              <AmazonIcon />
            </div>
            <div className="cyber-bubble bot-glass processing">
              <div className="waveform-loader">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
              <p className="cyber-font-sm blink">Analyzing sources and preparing answer...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      <footer className="cyber-input-area">
        <div className="input-field-wrapper cyber-neon">
          <label htmlFor="chat-input" className="visually-hidden">Message assistant</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            className="holographic-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for exact specs, price insights, or common complaints"
            disabled={isLoading}
            aria-label="Enter your question"
            rows={1}
          />
          <button
            className="cyber-send-btn outline-glow"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="cyber-spinner" aria-hidden="true"></div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </div>
      </footer>

      {/* ═══ Modals ═══ */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {showSentiment && (
        <SentimentDashboard
          data={sentimentData}
          onClose={() => setShowSentiment(false)}
        />
      )}

      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        history={chatHistory}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
      />

      {/* Toast */}
      {toast && <div className="toast-notification">{toast}</div>}
    </div>
  );
}

function buildFollowUps(question, answer, defaults) {
  const text = `${question} ${answer}`.toLowerCase();
  const next = [...defaults];

  if (text.includes("price")) {
    return ["colors", "storage variants", "camera", "battery"];
  }
  if (text.includes("color") || text.includes("variant")) {
    return ["price", "storage variants", "camera", "battery"];
  }
  return next;
}

function buildActionableMessage(response, question) {
  const code = response?.error?.code;

  if (code === "PRODUCT_NOT_FOUND") {
    return "No product match found. Try adding model + storage. Example: iPhone 17 Pro Max 256GB.";
  }

  if (code === "CHAT_BACKEND_UNREACHABLE") {
    return "Backend is unreachable. Retry, or verify the server is running on port 5000.";
  }

  if (code === "CHAT_HTTP_ERROR") {
    return "Request failed. Retry or narrow the product query.";
  }

  if ((response?.answer || "").toLowerCase().includes("timed out")) {
    return "Product fetch timed out. Retry or add a direct product URL in Admin.";
  }

  if ((response?.answer || "").trim()) {
    return response.answer;
  }

  return `I could not answer this query yet. Try refining: ${question}`;
}
