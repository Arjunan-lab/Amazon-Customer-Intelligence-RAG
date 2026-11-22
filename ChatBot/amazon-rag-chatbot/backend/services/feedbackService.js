const fs = require("fs/promises");
const path = require("path");

const ANALYTICS_DIR = path.join(__dirname, "..", "analytics");
const FEEDBACK_LOG = path.join(ANALYTICS_DIR, "chat_feedback_events.jsonl");

class FeedbackService {
  async recordFeedback(event) {
    const normalized = this.normalizeEvent(event);
    await fs.mkdir(ANALYTICS_DIR, { recursive: true });
    await fs.appendFile(FEEDBACK_LOG, `${JSON.stringify(normalized)}\n`, "utf8");
    return normalized;
  }

  async getSummary() {
    try {
      const raw = await fs.readFile(FEEDBACK_LOG, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const events = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const summary = {
        totalEvents: events.length,
        helpful: 0,
        unhelpful: 0,
        reasons: {
          wrongProduct: 0,
          missingExactSpec: 0,
          outdated: 0,
          tooGeneric: 0,
          other: 0,
        },
        windows: {
          last24h: {
            totalEvents: 0,
            helpful: 0,
            unhelpful: 0,
            reasons: {
              wrongProduct: 0,
              missingExactSpec: 0,
              outdated: 0,
              tooGeneric: 0,
              other: 0,
            },
          },
          previous24h: {
            totalEvents: 0,
            helpful: 0,
            unhelpful: 0,
            reasons: {
              wrongProduct: 0,
              missingExactSpec: 0,
              outdated: 0,
              tooGeneric: 0,
              other: 0,
            },
          },
        },
        trend24h: {
          totalEventsDelta: 0,
          helpfulDelta: 0,
          unhelpfulDelta: 0,
          reasons: {
            wrongProductDelta: 0,
            missingExactSpecDelta: 0,
            outdatedDelta: 0,
            tooGenericDelta: 0,
            otherDelta: 0,
          },
        },
      };

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const startLast24h = now - oneDayMs;
      const startPrevious24h = now - (2 * oneDayMs);

      for (const event of events) {
        if (event.vote === "up") {
          summary.helpful += 1;
        }
        if (event.vote === "down") {
          summary.unhelpful += 1;
        }

        const key = this.reasonToKey(event.reason);
        summary.reasons[key] += 1;

        const createdAtMs = Date.parse(event.createdAt || "");
        if (!Number.isNaN(createdAtMs)) {
          if (createdAtMs >= startLast24h) {
            summary.windows.last24h.totalEvents += 1;
            if (event.vote === "up") summary.windows.last24h.helpful += 1;
            if (event.vote === "down") summary.windows.last24h.unhelpful += 1;
            summary.windows.last24h.reasons[key] += 1;
          } else if (createdAtMs >= startPrevious24h && createdAtMs < startLast24h) {
            summary.windows.previous24h.totalEvents += 1;
            if (event.vote === "up") summary.windows.previous24h.helpful += 1;
            if (event.vote === "down") summary.windows.previous24h.unhelpful += 1;
            summary.windows.previous24h.reasons[key] += 1;
          }
        }
      }

      summary.trend24h.totalEventsDelta =
        summary.windows.last24h.totalEvents - summary.windows.previous24h.totalEvents;
      summary.trend24h.helpfulDelta =
        summary.windows.last24h.helpful - summary.windows.previous24h.helpful;
      summary.trend24h.unhelpfulDelta =
        summary.windows.last24h.unhelpful - summary.windows.previous24h.unhelpful;
      summary.trend24h.reasons.wrongProductDelta =
        summary.windows.last24h.reasons.wrongProduct - summary.windows.previous24h.reasons.wrongProduct;
      summary.trend24h.reasons.missingExactSpecDelta =
        summary.windows.last24h.reasons.missingExactSpec - summary.windows.previous24h.reasons.missingExactSpec;
      summary.trend24h.reasons.outdatedDelta =
        summary.windows.last24h.reasons.outdated - summary.windows.previous24h.reasons.outdated;
      summary.trend24h.reasons.tooGenericDelta =
        summary.windows.last24h.reasons.tooGeneric - summary.windows.previous24h.reasons.tooGeneric;
      summary.trend24h.reasons.otherDelta =
        summary.windows.last24h.reasons.other - summary.windows.previous24h.reasons.other;

      // Legacy aliases used by the frontend analytics tiles.
      summary.total = summary.totalEvents;
      summary.up = summary.helpful;
      summary.down = summary.unhelpful;
      summary.reasons.missingSpec = summary.reasons.missingExactSpec;

      return summary;
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          totalEvents: 0,
          helpful: 0,
          unhelpful: 0,
          reasons: {
            wrongProduct: 0,
            missingExactSpec: 0,
            outdated: 0,
            tooGeneric: 0,
            other: 0,
          },
          windows: {
            last24h: {
              totalEvents: 0,
              helpful: 0,
              unhelpful: 0,
              reasons: {
                wrongProduct: 0,
                missingExactSpec: 0,
                outdated: 0,
                tooGeneric: 0,
                other: 0,
              },
            },
            previous24h: {
              totalEvents: 0,
              helpful: 0,
              unhelpful: 0,
              reasons: {
                wrongProduct: 0,
                missingExactSpec: 0,
                outdated: 0,
                tooGeneric: 0,
                other: 0,
              },
            },
          },
          trend24h: {
            totalEventsDelta: 0,
            helpfulDelta: 0,
            unhelpfulDelta: 0,
            reasons: {
              wrongProductDelta: 0,
              missingExactSpecDelta: 0,
              outdatedDelta: 0,
              tooGenericDelta: 0,
              otherDelta: 0,
            },
          },
          total: 0,
          up: 0,
          down: 0,
        };
      }

      throw error;
    }
  }

  normalizeEvent(event) {
    const now = new Date().toISOString();
    return {
      requestId: event.requestId || null,
      vote: event.vote === "up" ? "up" : "down",
      reason: (event.reason || "").toString().trim() || null,
      linkedQuestion: (event.linkedQuestion || "").toString().trim() || null,
      answerPreview: (event.answerPreview || "").toString().slice(0, 400),
      sourceId: (event.sourceId || "").toString().trim() || null,
      sourceType: (event.sourceType || "").toString().trim() || null,
      mode: (event.mode || "").toString().trim() || null,
      createdAt: now,
    };
  }

  reasonToKey(reason) {
    const normalized = (reason || "").toString().trim().toLowerCase();
    if (normalized === "wrong product") return "wrongProduct";
    if (normalized === "missing exact spec") return "missingExactSpec";
    if (normalized === "outdated") return "outdated";
    if (normalized === "too generic") return "tooGeneric";
    return "other";
  }
}

module.exports = new FeedbackService();