"use client";

import { Bot, Send, UserRound } from "lucide-react";
import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const starters = ["韩国 vs 捷克怎么看？", "解释一下让球 -0.5", "波胆和独赢有什么区别？"];

export function AiChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你可以问我世界杯赛事、赔率解释、让球大小、波胆思路和投注风险。我只聊足球相关内容。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text = input) {
    const question = text.trim();
    if (!question || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: data.answer || data.error || "这次没拿到回答，稍后再试。",
      },
    ]);
  }

  return (
    <main className="content ai-chat-page">
      <section className="ai-chat-panel">
        <div className="ai-chat-head">
          <Bot size={24} />
          <div>
            <h2>问问AI</h2>
            <p>世界杯分析、赔率解释、数据拆解</p>
          </div>
        </div>

        <div className="ai-starters">
          {starters.map((starter) => (
            <button key={starter} type="button" onClick={() => send(starter)}>
              {starter}
            </button>
          ))}
        </div>

        <div className="ai-messages">
          {messages.map((message, index) => (
            <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
              <span className="ai-avatar">{message.role === "assistant" ? <Bot size={15} /> : <UserRound size={15} />}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {loading ? (
            <div className="ai-message assistant">
              <span className="ai-avatar">
                <Bot size={15} />
              </span>
              <p>分析中...</p>
            </div>
          ) : null}
        </div>

        <form
          className="ai-input-bar"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            placeholder="问足球、赛事或赔率相关问题"
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" disabled={loading || !input.trim()} aria-label="发送">
            <Send size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
