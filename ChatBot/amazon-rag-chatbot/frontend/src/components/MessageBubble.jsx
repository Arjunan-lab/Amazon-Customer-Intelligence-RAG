import React, { useState } from "react";

const AmazonIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '65%', height: '65%', display: 'block', margin: 'auto' }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" fill="#FF9900" />
    <path d="M5 3v4M3 5h4M19 17v4M17 19h4" stroke="#1a1a1b" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

/* ── Inline Sentiment Mini-Chart ──────────────────────────── */
function SentimentChart({ content }) {
  const sentiment = extractSentiment(content);
  if (!sentiment) return null;

  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  if (total === 0) return null;

  const pPct = Math.round((sentiment.positive / total) * 100);
  const neuPct = Math.round((sentiment.neutral / total) * 100);
  const nPct = 100 - pPct - neuPct;

  return (
    <div className="sentiment-chart-card">
      <div className="sentiment-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
        <span>Sentiment Breakdown</span>
      </div>
      <div className="sentiment-bars">
        <div className="sentiment-bar-row">
          <span className="sentiment-label positive">Positive</span>
          <div className="sentiment-track">
            <div className="sentiment-fill positive" style={{ width: `${pPct}%` }} />
          </div>
          <span className="sentiment-pct">{pPct}%</span>
        </div>
        <div className="sentiment-bar-row">
          <span className="sentiment-label neutral">Neutral</span>
          <div className="sentiment-track">
            <div className="sentiment-fill neutral" style={{ width: `${neuPct}%` }} />
          </div>
          <span className="sentiment-pct">{neuPct}%</span>
        </div>
        <div className="sentiment-bar-row">
          <span className="sentiment-label negative">Negative</span>
          <div className="sentiment-track">
            <div className="sentiment-fill negative" style={{ width: `${nPct}%` }} />
          </div>
          <span className="sentiment-pct">{nPct}%</span>
        </div>
      </div>

      {/* Star Distribution if available */}
      {sentiment.stars && (
        <div className="star-distribution">
          <div className="sentiment-header" style={{ marginTop: '12px' }}>
            <span>⭐ Rating Distribution</span>
          </div>
          {[5, 4, 3, 2, 1].map(star => {
            const count = sentiment.stars[star] || 0;
            const maxCount = Math.max(...Object.values(sentiment.stars), 1);
            const barPct = Math.round((count / maxCount) * 100);
            return (
              <div className="sentiment-bar-row" key={star}>
                <span className="sentiment-label star">{star}★</span>
                <div className="sentiment-track">
                  <div className="sentiment-fill star" style={{ width: `${barPct}%` }} />
                </div>
                <span className="sentiment-pct">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function extractSentiment(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Check if this response looks like a sentiment/review analysis
  const isSentimentResponse =
    (lower.includes('positive') && lower.includes('negative')) ||
    lower.includes('sentiment') ||
    lower.includes('rating') ||
    lower.includes('complaints') ||
    lower.includes('strengths') ||
    lower.includes('weaknesses') ||
    lower.includes('review');

  if (!isSentimentResponse) return null;

  // Try to extract percentages or counts
  let positive = 0, neutral = 0, negative = 0;

  const pctMatch = lower.match(/(\d+)%?\s*(?:positive|good|favorable|happy|satisfied)/);
  const negMatch = lower.match(/(\d+)%?\s*(?:negative|bad|unfavorable|unhappy|dissatisfied|complaint)/);
  const neuMatch = lower.match(/(\d+)%?\s*(?:neutral|mixed|moderate)/);

  if (pctMatch) positive = parseInt(pctMatch[1], 10);
  if (negMatch) negative = parseInt(negMatch[1], 10);
  if (neuMatch) neutral = parseInt(neuMatch[1], 10);

  // If we couldn't extract numbers, estimate from keyword density
  if (positive === 0 && negative === 0 && neutral === 0) {
    const positiveWords = (lower.match(/\b(great|excellent|good|love|amazing|fantastic|perfect|best|happy|satisfied|recommend|quality)\b/g) || []).length;
    const negativeWords = (lower.match(/\b(bad|poor|terrible|awful|worst|hate|disappointing|broken|defective|complaint|issue|problem)\b/g) || []).length;
    const totalWords = positiveWords + negativeWords;
    if (totalWords >= 2) {
      positive = Math.round((positiveWords / (totalWords + 2)) * 100);
      negative = Math.round((negativeWords / (totalWords + 2)) * 100);
      neutral = 100 - positive - negative;
    } else {
      return null;
    }
  }

  // Normalize
  const sum = positive + neutral + negative;
  if (sum === 0) return null;
  if (sum !== 100) {
    const factor = 100 / sum;
    positive = Math.round(positive * factor);
    negative = Math.round(negative * factor);
    neutral = 100 - positive - negative;
  }

  // Try extracting star distribution
  let stars = null;
  const starMatches = text.match(/(\d)\s*(?:star|★|⭐)[^\d]*?(\d+)/gi);
  if (starMatches && starMatches.length >= 2) {
    stars = {};
    starMatches.forEach(m => {
      const parts = m.match(/(\d)\s*(?:star|★|⭐)[^\d]*?(\d+)/i);
      if (parts) stars[parseInt(parts[1])] = parseInt(parts[2]);
    });
  }

  return { positive, neutral, negative, stars };
}

export default function MessageBubble({ message, onRetry, onEditQuery, onFollowUp, onFeedback, onSelectCandidate }) {
  const isUser = message.role === "user";
  const isError = message.isError;
  const trust = getTrustState(message);
  const freshness = new Date(message.timestamp || Date.now()).toLocaleTimeString();
  const [feedback, setFeedback] = useState(null);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = message.content || "";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`message-row ${isUser ? "user-row" : "bot-row"}`} role="article" aria-label={`${isUser ? 'User' : 'Amazon Bot'} message`}>
      {!isUser && (
        <div className="avatar bot-avatar cyber-glow tilt-in" aria-hidden="true">
          <AmazonIcon />
        </div>
      )}

      <div className={`message-content-wrapper stagger-up`}>
        <div
          className={`cyber-bubble ${isUser ? "user-glass" : "bot-glass"
            } ${isError ? "error-glitch" : ""}`}
        >
          <p className="message-text cyber-font">{message.content}</p>

          {/* Copy button */}
          <div className="msg-actions-row">
            <button
              className={`msg-action-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy message"}
              aria-label="Copy message to clipboard"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>

          {/* Sentiment chart for bot analysis responses */}
          {!isUser && !isError && (
            <SentimentChart content={message.content} />
          )}

          {!isUser && (
            <div className="trust-row">
              <span className="trust-chip">Source: {trust.origin}</span>
              <span className="trust-chip">Updated: {freshness}</span>
              {trust.missingExact && <span className="trust-chip warning">Exact detail not confirmed</span>}
            </div>
          )}
          {!isUser && message.meta?.status && (
            <div className="trust-inline">Pipeline: {message.meta.status}</div>
          )}
          {!isUser && message.error?.code && (
            <div className="trust-inline">Error code: {message.error.code}</div>
          )}

          {!isUser && isError && (
            <div className="recovery-actions">
              <button
                className="recovery-btn"
                onClick={() => onRetry && onRetry(message.linkedQuestion)}
              >
                Retry request
              </button>
              <button
                className="recovery-btn secondary"
                onClick={() => onEditQuery && onEditQuery(message.linkedQuestion)}
              >
                Edit question
              </button>
            </div>
          )}

          {!isUser && Array.isArray(message.followUps) && message.followUps.length > 0 && (
            <div className="followup-chip-row">
              {message.followUps.map((chip) => (
                <button key={chip} className="followup-chip" onClick={() => onFollowUp && onFollowUp(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          )}

          {!isUser && !isError && (
            <div className="feedback-row">
              <span>Was this answer helpful?</span>
              <button
                className={`feedback-btn ${feedback === "up" ? "active" : ""}`}
                onClick={() => {
                  setFeedback("up");
                  setReason("");
                  onFeedback && onFeedback({ vote: "up", reason: null, message });
                }}
                aria-label="Helpful response"
              >
                Helpful
              </button>
              <button
                className={`feedback-btn ${feedback === "down" ? "active" : ""}`}
                onClick={() => {
                  setFeedback("down");
                  onFeedback && onFeedback({ vote: "down", reason: null, message });
                }}
                aria-label="Not helpful response"
              >
                Not helpful
              </button>
            </div>
          )}

          {!isUser && feedback === "down" && (
            <div className="feedback-reasons">
              {["Wrong product", "Missing exact spec", "Outdated", "Too generic"].map((item) => (
                <button
                  key={item}
                  className={`feedback-reason ${reason === item ? "active" : ""}`}
                  onClick={() => {
                    setReason(item);
                    onFeedback && onFeedback({ vote: "down", reason: item, message });
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {!isUser && message.meta?.status === "needs-user-selection" && Array.isArray(message.meta?.autoSource?.candidates) && (
            <div className="candidate-row" aria-label="Select matching product candidate">
              {message.meta.autoSource.candidates.slice(0, 3).map((candidate, idx) => (
                (() => {
                  const confidence = getCandidateConfidence(candidate);
                  return (
                <button
                  key={`${candidate.asin || idx}`}
                  className="candidate-card"
                  onClick={() => onSelectCandidate && onSelectCandidate({ candidate, message })}
                  title={`${candidate.name || "Unknown"} (${candidate.asin || "N/A"})`}
                >
                  <div className="candidate-thumb-slot" aria-hidden="true">
                    {extractCandidateImage(candidate) ? (
                      <img src={extractCandidateImage(candidate)} alt="" className="candidate-thumb" />
                    ) : (
                      <span className="candidate-thumb-fallback">{getCandidateInitials(candidate?.name)}</span>
                    )}
                  </div>
                  <div className="candidate-main">
                    <span className="candidate-rank">Option {idx + 1}</span>
                    <span className={`candidate-confidence ${confidence.level}`}>{confidence.label}</span>
                    <span className="candidate-title">{candidate.name || "Unknown"}</span>
                    <span className="candidate-meta">ASIN: {candidate.asin || "N/A"}</span>
                    <span className="candidate-meta">Rating: {candidate.rating || "n/a"} | Reviews: {candidate.reviewCount || "n/a"}</span>
                  </div>
                  <span className="candidate-cta">Use this product</span>
                </button>
                  );
                })()
              ))}
            </div>
          )}
        </div>

        {/* Sources rendered as holographic datapads */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="holographic-sources float-in" role="complementary" aria-label="Reference sources">
            <div className="holo-source-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-slow" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
              </svg>
              <span>DATA NODES ACCESSED</span>
            </div>

            <div className="source-grid">
              {message.sources.map((source, idx) => {
                const isObj = typeof source === 'object' && source !== null;
                const product = isObj ? source.product : "Generic Product API";
                const text = isObj ? source.text : source;
                
                return (
                  <div key={idx} className="holo-datapad">
                    <div className="node-id" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>NODE :: {idx + 1}</span>
                      <span className="node-product" style={{ color: '#FF9900', fontSize: '0.65rem', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', letterSpacing: '0.5px' }} title={product}>
                        {product}
                      </span>
                    </div>
                    <p className="node-data">{text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="avatar user-avatar pixelation-in" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      )}
    </div>
  );
}

function extractCandidateImage(candidate) {
  if (!candidate || typeof candidate !== "object") return "";
  return candidate.image || candidate.imageUrl || candidate.thumbnail || candidate.thumbnailUrl || "";
}

function getCandidateInitials(name = "") {
  const tokens = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (tokens.length === 0) return "PR";
  return tokens.map((token) => token[0].toUpperCase()).join("");
}

function getCandidateConfidence(candidate) {
  const ratingRaw = Number.parseFloat(String(candidate?.rating ?? "0").replace(/[^0-9.]/g, ""));
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : 0;
  const reviewCountRaw = Number.parseInt(String(candidate?.reviewCount ?? "0").replace(/[^0-9]/g, ""), 10);
  const reviewCount = Number.isFinite(reviewCountRaw) ? reviewCountRaw : 0;
  let score = 0;
  if (candidate?.asin) score += 1;
  if (candidate?.name) score += 1;
  if (rating >= 4.2) score += 1;
  if (reviewCount >= 300) score += 1;
  if (score >= 4) return { level: "high", label: "High match" };
  if (score >= 3) return { level: "medium", label: "Medium match" };
  return { level: "low", label: "Low match" };
}

function getTrustState(message) {
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const sourceTypes = sources.map((item) => (typeof item === "object" && item ? String(item.doc_type || "") : "")).filter(Boolean);
  let origin = "mixed";
  if (sourceTypes.length > 0) {
    if (sourceTypes.every((type) => type === "product-facts")) origin = "product facts";
    else if (sourceTypes.every((type) => type === "review")) origin = "reviews";
  } else if (message.meta?.sourceType) {
    origin = message.meta.sourceType;
  }
  const text = String(message.content || "").toLowerCase();
  const missingExact = /not available|could not find|not found|do not have structured product facts/.test(text);
  return { origin, missingExact };
}
