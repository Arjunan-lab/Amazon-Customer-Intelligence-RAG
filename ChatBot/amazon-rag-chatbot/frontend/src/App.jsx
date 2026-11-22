import React, { useEffect, useMemo, useState, useRef } from "react";
import ChatBox from "./components/ChatBox";
import { createIngestionSource, getChatFeedbackSummary, getIngestionStatus, rebuildIndex } from "./api";

function decodeHtmlEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value = "", maxLen = 74) {
  const text = decodeHtmlEntities(value);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

export default function App() {
  const canvasRef = useRef(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceLoadStageIndex, setSourceLoadStageIndex] = useState(0);
  const [activeSource, setActiveSource] = useState(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [feedbackSummary, setFeedbackSummary] = useState(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackLastUpdatedAt, setFeedbackLastUpdatedAt] = useState(null);

  const sourceLoadStages = [
    "Resolving product URL and ASIN...",
    "Collecting and normalizing review data...",
    "Building retrieval-ready source index...",
    "Finalizing source context for chat...",
  ];

  const cursorParticles = useMemo(() => {
    return Array.from({ length: 28 }, (_, index) => {
      const x = ((Math.sin(index * 2.31) + 1) / 2) * 100;
      const y = ((Math.cos(index * 1.87) + 1) / 2) * 100;
      const size = 1.4 + (index % 5) * 0.52;
      const alpha = 0.28 + (index % 6) * 0.09;
      const drift = 4.8 + (index % 7) * 0.85;
      const delay = (index % 9) * 0.28;
      const parallax = 8 + (index % 6) * 4;

      return {
        id: `particle-${index}`,
        x,
        y,
        size,
        alpha,
        drift,
        delay,
        parallax,
      };
    });
  }, []);

  // 3D Dotted Sphere / Grok-style background with Cursor Sensitivity
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    let mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };

    const handleMouseMove = (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Generate Neural Nodes for Data Flow Aesthetic
    const numNodes = 120;
    const nodes = [];
    const colors = ['#00A8E1', '#FF9900', '#202124', '#e8eaed', '#00A8E1', '#FF9900'];

    for (let i = 0; i < numNodes; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2.5 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let animationFrameId;

    const render = () => {
      // Detect theme for canvas background
      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDarkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(248, 248, 244, 0.85)';
      ctx.fillRect(0, 0, width, height);

      // Mouse smoothing
      mouse.x += (mouse.targetX - mouse.x) * 0.1;
      mouse.y += (mouse.targetY - mouse.y) * 0.1;

      for (let i = 0; i < numNodes; i++) {
        let node1 = nodes[i];

        // Move node
        node1.x += node1.vx;
        node1.y += node1.vy;

        // Bounce off walls smoothly
        if (node1.x < 0 || node1.x > width) node1.vx *= -1;
        if (node1.y < 0 || node1.y > height) node1.vy *= -1;

        // Mouse interaction: soft repel
        const dx = node1.x - mouse.x;
        const dy = node1.y - mouse.y;
        const distToMouse = Math.sqrt(dx * dx + dy * dy);

        if (distToMouse < 150) {
          node1.x += (dx / distToMouse) * 1.5;
          node1.y += (dy / distToMouse) * 1.5;
        }

        // Connect nearby nodes to form the Intelligence Graph
        for (let j = i + 1; j < numNodes; j++) {
          let node2 = nodes[j];
          const distance = Math.sqrt(
            Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2)
          );

          if (distance < 130) {
            const alpha = 1 - (distance / 130);
            ctx.beginPath();
            ctx.moveTo(node1.x, node1.y);
            ctx.lineTo(node2.x, node2.y);

            // Dynamic gradient lines connecting Amazon brand colors
            if (node1.color === '#FF9900' || node2.color === '#FF9900') {
              ctx.strokeStyle = `rgba(255, 153, 0, ${alpha * 0.6})`;
            } else {
              ctx.strokeStyle = `rgba(0, 168, 225, ${alpha * 0.3})`;
            }
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Draw node
        ctx.beginPath();
        ctx.arc(node1.x, node1.y, node1.radius, 0, Math.PI * 2);
        ctx.fillStyle = node1.color;

        if (distToMouse < 150) {
          // Glow effect when interacting
          ctx.shadowBlur = 15;
          ctx.shadowColor = node1.color;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    const updateCursorVars = (event) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const x = event.clientX;
      const y = event.clientY;

      const normalizedX = ((x / w) - 0.5) * 2;
      const normalizedY = ((y / h) - 0.5) * 2;

      root.style.setProperty("--cursor-x", normalizedX.toFixed(4));
      root.style.setProperty("--cursor-y", normalizedY.toFixed(4));
      root.style.setProperty("--cursor-px", `${((x / w) * 100).toFixed(2)}%`);
      root.style.setProperty("--cursor-py", `${((y / h) * 100).toFixed(2)}%`);
    };

    window.addEventListener("mousemove", updateCursorVars, { passive: true });

    return () => {
      window.removeEventListener("mousemove", updateCursorVars);
    };
  }, []);

  useEffect(() => {
    if (!isLoadingSource) {
      setSourceLoadStageIndex(0);
      return undefined;
    }

    const timer = setInterval(() => {
      setSourceLoadStageIndex((prev) => (prev + 1) % sourceLoadStages.length);
    }, 1700);

    return () => clearInterval(timer);
  }, [isLoadingSource, sourceLoadStages.length]);

  const refreshFeedbackSummary = async () => {
    setIsFeedbackLoading(true);
    setFeedbackStatus("Refreshing feedback analytics...");

    try {
      const response = await getChatFeedbackSummary();
      if (response?.success && response?.summary) {
        setFeedbackSummary(normalizeFeedbackSummary(response.summary));
        setFeedbackLastUpdatedAt(Date.now());
        setFeedbackStatus("Feedback analytics updated.");
      } else {
        setFeedbackStatus(response?.error?.message || "Feedback analytics are not available yet.");
      }
    } catch (error) {
      setFeedbackStatus(error.message || "Could not fetch feedback analytics.");
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminOpen) {
      refreshFeedbackSummary();
    }
  }, [isAdminOpen]);

  useEffect(() => {
    if (!isAdminOpen) {
      return undefined;
    }

    const timer = setInterval(() => {
      refreshFeedbackSummary();
    }, 30000);

    return () => clearInterval(timer);
  }, [isAdminOpen]);

  const handleRefreshIndex = async () => {
    setIsIndexing(true);
    setIndexStatus("Rebuilding index...");
    try {
      await rebuildIndex();
      setIndexStatus("Knowledge base refreshed successfully.");
      setTimeout(() => setIndexStatus(""), 5000);
    } catch (err) {
      setIndexStatus(`Error: ${err.message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleLoadSource = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl || isLoadingSource) return;

    setIsLoadingSource(true);
    setSourceLoadStageIndex(0);
    setSourceStatus(sourceLoadStages[0]);

    try {
      const result = await createIngestionSource(trimmedUrl, {
        mode: "amazon-product",
        maxReviews: 100,
        persist: true,
      });

      const cleanName = decodeHtmlEntities(result.product?.name || "Amazon Product");
      const compactName = compactText(cleanName, 70);

      setActiveSource({
        sourceId: result.sourceId,
        status: result.status,
        sourceType: "amazon-url",
        mode: "source",
        product: {
          ...result.product,
          name: cleanName,
          compactName,
        },
        reviewsCount: result.reviewsCount,
        documentsCount: result.documentsCount,
        fetchedAt: Date.now(),
        lastSyncAt: Date.now(),
      });

      setSourceStatus(`Source ready: ${compactName} (${result.reviewsCount} reviews)`);
      setIsAdminOpen(false);
    } catch (err) {
      setSourceStatus(`Error: ${err.message}`);
      setActiveSource(null);
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleClearSource = () => {
    setActiveSource(null);
    setSourceUrl("");
    setSourceStatus("Switched back to dataset mode.");
  };

  const handleRefreshSourceStatus = async () => {
    if (!activeSource?.sourceId || isLoadingSource) return;

    setIsLoadingSource(true);
    setSourceStatus("Refreshing source status...");

    try {
      const status = await getIngestionStatus(activeSource.sourceId);
      setActiveSource((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: status.status,
          reviewsCount: status.reviewsCount,
          lastSyncAt: Date.now(),
        };
      });
      setSourceStatus(`Source status: ${status.status}`);
    } catch (err) {
      setSourceStatus(`Error: ${err.message}`);
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleSelectDisambiguationCandidate = async (candidate) => {
    const asin = (candidate?.asin || "").toString().trim().toUpperCase();
    if (!asin || isLoadingSource) {
      return { success: false, message: "Invalid product candidate." };
    }

    setIsLoadingSource(true);
    setSourceLoadStageIndex(0);
    setSourceStatus(`Loading selected product ${asin}...`);

    try {
      const sourceUrlCandidate = `https://www.amazon.com/dp/${asin}`;
      const result = await createIngestionSource(sourceUrlCandidate, {
        mode: "amazon-product",
        maxReviews: 100,
        persist: true,
      });

      const cleanName = decodeHtmlEntities(result.product?.name || candidate?.name || `Amazon Product ${asin}`);
      const compactName = compactText(cleanName, 70);

      setActiveSource({
        sourceId: result.sourceId,
        status: result.status,
        sourceType: "amazon-url",
        mode: "source",
        product: {
          ...result.product,
          name: cleanName,
          compactName,
          asin,
        },
        reviewsCount: result.reviewsCount,
        documentsCount: result.documentsCount,
        fetchedAt: Date.now(),
        lastSyncAt: Date.now(),
      });

      setSourceStatus(`Source ready: ${compactName} (${result.reviewsCount} reviews)`);
      return { success: true, sourceId: result.sourceId, asin };
    } catch (error) {
      setSourceStatus(`Error: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      setIsLoadingSource(false);
    }
  };

  const activeScope = useMemo(() => {
    if (!activeSource) {
      return {
        compactName: "Dataset Corpus",
        productName: null,
        asin: null,
        sourceType: "dataset",
        docsIndexed: "n/a",
        fetchedAt: null,
        mode: "dataset",
      };
    }

    return {
      compactName: activeSource?.product?.compactName || "Amazon Product",
      productName: activeSource?.product?.name || null,
      asin: activeSource?.product?.asin || null,
      sourceType: activeSource?.sourceType || "amazon-url",
      docsIndexed: activeSource?.documentsCount ?? activeSource?.reviewsCount ?? "n/a",
      fetchedAt: activeSource?.fetchedAt || Date.now(),
      mode: activeSource?.mode || "source",
    };
  }, [activeSource]);

  return (
    <div className="cyberspace-container">
      {/* 3D animated canvas background */}
      <canvas ref={canvasRef} className="warp-canvas" />

      {/* Grid overlay */}
      <div className="cyber-grid" aria-hidden="true" />

      <main className={`nexus-layout ${isSidebarOpen ? "" : "sidebar-collapsed"}`.trim()}>
        <aside className="control-panel" aria-label="Workspace controls">
          <div className="brand-block">
            <p className="brand-kicker">Enterprise AI</p>
            <h1 className="brand-title">
              Amazon <span className="brand-title-accent">Support Copilot</span>
            </h1>
            <p className="brand-description">
              Source-aware product intelligence for support and quality teams.
            </p>
          </div>

          <section className="insight-grid" aria-label="Capabilities">
            <article className="insight-card">
              <h2 className="insight-card-title">Grounded responses</h2>
              <p className="insight-card-copy">
                Every answer includes scope and freshness context.
              </p>
            </article>
            <article className="insight-card">
              <h2 className="insight-card-title">Precise matching</h2>
              <p className="insight-card-copy">
                Resolve similar products with one-click candidate selection.
              </p>
            </article>
          </section>

          <section className="scope-card" aria-label="Current data scope">
            <h3>Current scope</h3>
            <div className="scope-chip-row">
              <span className="scope-chip">Type: {activeScope.sourceType}</span>
              <span className="scope-chip">Docs: {activeScope.docsIndexed}</span>
              {activeScope.asin && <span className="scope-chip">ASIN: {activeScope.asin}</span>}
            </div>
            <p className="panel-note">
              {activeScope.productName || "Dataset mode active. Ask a product question to auto-detect the source."}
            </p>
          </section>

          <div className="panel-actions">
            <button className="primary-btn" onClick={() => setIsAdminOpen(true)}>
              Admin Controls
            </button>
            <button className="secondary-btn" onClick={handleClearSource}>
              Dataset Mode
            </button>
          </div>
        </aside>

        <div className="sidebar-rail" aria-label="Collapsed sidebar controls">
          <button
            className="rail-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <button
            className="rail-btn"
            onClick={() => setIsAdminOpen(true)}
            aria-label="Open admin controls"
            title="Admin controls"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <button
            className="rail-btn"
            onClick={handleClearSource}
            aria-label="Switch to dataset mode"
            title="Dataset mode"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"></path>
              <path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"></path>
            </svg>
          </button>
        </div>

        <section className="chat-panel" aria-label="Support chat console">
          <ChatBox
            activeSourceId={activeSource?.sourceId || null}
            activeScope={activeScope}
            scopeLoading={isLoadingSource}
            onSwitchSource={handleClearSource}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onSelectDisambiguationCandidate={handleSelectDisambiguationCandidate}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          />
        </section>
      </main>

      <div className={`admin-overlay ${isAdminOpen ? "open" : ""}`} onClick={() => setIsAdminOpen(false)}>
        <aside
          className={`admin-panel ${isAdminOpen ? "open" : ""}`}
          onClick={(event) => event.stopPropagation()}
          aria-label="Administration panel"
        >
          <div className="admin-header">
            <h2>Admin Controls</h2>
            <button className="admin-close" onClick={() => setIsAdminOpen(false)} aria-label="Close admin panel">
              Close
            </button>
          </div>

          <section className="admin-section">
            <h3>Live Feedback Analytics</h3>
            <p>Live answer quality metrics from feedback signals.</p>
            <div className="analytics-grid" role="status" aria-live="polite">
              <div className="analytics-tile">
                <span>Total</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.total ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.totalEvents ?? 0,
                      feedbackSummary?.windows?.last24h?.totalEvents ?? 0,
                    ]}
                    tone="neutral"
                  />
                </div>
                <em className={trendClassName(feedbackSummary?.trend24h?.totalEventsDelta ?? 0)}>
                  {formatTrendDelta(feedbackSummary?.trend24h?.totalEventsDelta ?? 0)} vs prev 24h
                </em>
              </div>
              <div className="analytics-tile success">
                <span>Helpful</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.up ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.helpful ?? 0,
                      feedbackSummary?.windows?.last24h?.helpful ?? 0,
                    ]}
                    tone="positive"
                  />
                </div>
                <em className={trendClassName(feedbackSummary?.trend24h?.helpfulDelta ?? 0)}>
                  {formatTrendDelta(feedbackSummary?.trend24h?.helpfulDelta ?? 0)} vs prev 24h
                </em>
              </div>
              <div className="analytics-tile danger">
                <span>Not helpful</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.down ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.unhelpful ?? 0,
                      feedbackSummary?.windows?.last24h?.unhelpful ?? 0,
                    ]}
                    tone="negative"
                  />
                </div>
                <em className={trendClassName(feedbackSummary?.trend24h?.unhelpfulDelta ?? 0, true)}>
                  {formatTrendDelta(feedbackSummary?.trend24h?.unhelpfulDelta ?? 0)} vs prev 24h
                </em>
              </div>
              <div className="analytics-tile">
                <span>Wrong Product</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.reasons?.wrongProduct ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.reasons?.wrongProduct ?? 0,
                      feedbackSummary?.windows?.last24h?.reasons?.wrongProduct ?? 0,
                    ]}
                    tone="neutral"
                  />
                </div>
              </div>
              <div className="analytics-tile">
                <span>Missing Spec</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.reasons?.missingSpec ?? feedbackSummary?.reasons?.missingExactSpec ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.reasons?.missingSpec ?? feedbackSummary?.windows?.previous24h?.reasons?.missingExactSpec ?? 0,
                      feedbackSummary?.windows?.last24h?.reasons?.missingSpec ?? feedbackSummary?.windows?.last24h?.reasons?.missingExactSpec ?? 0,
                    ]}
                    tone="neutral"
                  />
                </div>
              </div>
              <div className="analytics-tile">
                <span>Outdated</span>
                <div className="analytics-metric-row">
                  <strong>{feedbackSummary?.reasons?.outdated ?? 0}</strong>
                  <SparklineMini
                    values={[
                      feedbackSummary?.windows?.previous24h?.reasons?.outdated ?? 0,
                      feedbackSummary?.windows?.last24h?.reasons?.outdated ?? 0,
                    ]}
                    tone="neutral"
                  />
                </div>
              </div>
            </div>
            <p className="analytics-caption">
              {feedbackLastUpdatedAt
                ? `Auto-refresh every 30s. Updated ${new Date(feedbackLastUpdatedAt).toLocaleTimeString()}.`
                : "Auto-refresh every 30s while open."}
            </p>
            <button className="secondary-btn" onClick={refreshFeedbackSummary} disabled={isFeedbackLoading}>
              {isFeedbackLoading ? "Refreshing..." : "Refresh Feedback Metrics"}
            </button>
            {feedbackStatus && <p className="status-text">{feedbackStatus}</p>}
          </section>

          <section className="admin-section">
            <h3>Refresh Dataset Index</h3>
            <p>Rebuild embeddings from local dataset files.</p>
            <button className="primary-btn" onClick={handleRefreshIndex} disabled={isIndexing}>
              {isIndexing ? "Rebuilding..." : "Refresh Knowledge Base"}
            </button>
            {indexStatus && <p className={`status-text ${indexStatus.startsWith("Error") ? "error" : ""}`}>{indexStatus}</p>}
          </section>

          <section className="admin-section">
            <h3>Live Product Ingestion</h3>
            <p>Paste a product URL to create a source-scoped index.</p>
            <label className="form-field" htmlFor="source-url-input">Amazon Product URL</label>
            <input
              id="source-url-input"
              className="input-field"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://www.amazon.com/dp/..."
              disabled={isLoadingSource}
            />

            <div className="btn-row">
              <button className="primary-btn" onClick={handleLoadSource} disabled={isLoadingSource || !sourceUrl.trim()}>
                {isLoadingSource ? "Loading Source..." : "Load Source"}
              </button>
              <button className="secondary-btn" onClick={handleRefreshSourceStatus} disabled={!activeSource || isLoadingSource}>
                Refresh Status
              </button>
            </div>

            {isLoadingSource && (
              <div className="stage-loader" aria-live="polite">
                <p className="stage-label">Ingestion progress</p>
                <p className="stage-text">{sourceLoadStages[sourceLoadStageIndex]}</p>
                <div className="stage-dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            {sourceStatus && <p className={`status-text ${sourceStatus.startsWith("Error") ? "error" : ""}`}>{sourceStatus}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function normalizeFeedbackSummary(summary) {
  const normalized = summary && typeof summary === "object" ? summary : {};

  return {
    ...normalized,
    total: normalized.total ?? normalized.totalEvents ?? 0,
    up: normalized.up ?? normalized.helpful ?? 0,
    down: normalized.down ?? normalized.unhelpful ?? 0,
    reasons: {
      ...(normalized.reasons || {}),
      missingSpec:
        normalized?.reasons?.missingSpec ??
        normalized?.reasons?.missingExactSpec ??
        0,
    },
    trend24h: {
      totalEventsDelta: normalized?.trend24h?.totalEventsDelta ?? 0,
      helpfulDelta: normalized?.trend24h?.helpfulDelta ?? 0,
      unhelpfulDelta: normalized?.trend24h?.unhelpfulDelta ?? 0,
      reasons: {
        ...(normalized?.trend24h?.reasons || {}),
        missingSpecDelta:
          normalized?.trend24h?.reasons?.missingSpecDelta ??
          normalized?.trend24h?.reasons?.missingExactSpecDelta ??
          0,
      },
    },
    windows: {
      last24h: {
        totalEvents: normalized?.windows?.last24h?.totalEvents ?? 0,
        helpful: normalized?.windows?.last24h?.helpful ?? 0,
        unhelpful: normalized?.windows?.last24h?.unhelpful ?? 0,
        reasons: {
          ...(normalized?.windows?.last24h?.reasons || {}),
          missingSpec:
            normalized?.windows?.last24h?.reasons?.missingSpec ??
            normalized?.windows?.last24h?.reasons?.missingExactSpec ??
            0,
        },
      },
      previous24h: {
        totalEvents: normalized?.windows?.previous24h?.totalEvents ?? 0,
        helpful: normalized?.windows?.previous24h?.helpful ?? 0,
        unhelpful: normalized?.windows?.previous24h?.unhelpful ?? 0,
        reasons: {
          ...(normalized?.windows?.previous24h?.reasons || {}),
          missingSpec:
            normalized?.windows?.previous24h?.reasons?.missingSpec ??
            normalized?.windows?.previous24h?.reasons?.missingExactSpec ??
            0,
        },
      },
    },
  };
}

function formatTrendDelta(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : `${number}`;
}

function trendClassName(value, invert = false) {
  const number = Number(value || 0);
  if (number === 0) return "trend-delta neutral";
  if (!invert) {
    return number > 0 ? "trend-delta up" : "trend-delta down";
  }
  return number > 0 ? "trend-delta down" : "trend-delta up";
}

function SparklineMini({ values = [0, 0], tone = "neutral" }) {
  const numericValues = values.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  const max = Math.max(...numericValues, 1);
  const width = 42;
  const height = 18;
  const normalizedY = numericValues.map((value) => {
    const ratio = value / max;
    return Math.round((1 - ratio) * (height - 2)) + 1;
  });
  const points = `2,${normalizedY[0]} ${width - 2},${normalizedY[1]}`;

  return (
    <svg className={`sparkline sparkline-${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2" cy={normalizedY[0]} r="1.8" />
      <circle cx={width - 2} cy={normalizedY[1]} r="1.8" />
    </svg>
  );
}
