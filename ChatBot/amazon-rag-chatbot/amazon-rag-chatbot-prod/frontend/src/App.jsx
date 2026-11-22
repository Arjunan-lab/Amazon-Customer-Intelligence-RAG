import { useState } from "react";

const API_BASE = "http://localhost:5000/api";

export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!question.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode: "dataset" }),
      });

      const data = await response.json();
      setAnswer(data.answer || "No answer returned.");
    } catch {
      setAnswer("Request failed. Check backend server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Amazon RAG Chatbot</h1>
        <p>Production starter UI</p>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question"
          rows={5}
        />

        <button onClick={ask} disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </button>

        <div className="answer">
          <strong>Answer:</strong>
          <p>{answer || "No response yet."}</p>
        </div>
      </section>
    </main>
  );
}
