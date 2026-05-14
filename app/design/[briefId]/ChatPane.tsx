"use client";

import { useEffect, useRef, useState } from "react";
import type { Brief, Subtask } from "./page";

const SKILLS = [
  { id: "hi_fi_design", label: "Hi-fi design" },
  { id: "wireframe", label: "Wireframe" },
  { id: "interactive_prototype", label: "Interactive prototype" },
  { id: "make_a_deck", label: "Make a deck" },
  { id: "frontend_design", label: "Frontend design" },
] as const;

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
  agent?: string;
  created_at: number;
};

type Props = {
  briefId: string;
  brief: Brief;
  subtasks: Subtask[];
  run: {
    id: string;
    status: string;
    subtasks_total: number;
    subtasks_done: number;
  } | null;
  token: string;
};

export default function ChatPane({ briefId, brief, subtasks, run, token }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => buildInitialMessages(brief, subtasks));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(
        `https://ll-cockpit.connorpattern.workers.dev/api/design/briefs/${briefId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `sb-access-token=${token}`,
          },
          body: JSON.stringify({ message: text, skill: activeSkill }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const agentMsg: Message = {
          id: crypto.randomUUID(),
          role: "agent",
          agent: data.agent ?? "NEXUS",
          content: data.reply ?? data.message ?? "Got it. Working on your update.",
          created_at: Date.now(),
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            agent: "NEXUS",
            content: "Something went wrong. Try again in a moment.",
            created_at: Date.now(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          agent: "NEXUS",
          content: "Unable to reach the agent. Check your connection.",
          created_at: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Agent execution disclosure */}
      <div
        style={{
          borderBottom: "1px solid var(--design-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setAgentOpen((o) => !o)}
          style={{
            width: "100%",
            background: "none",
            border: "none",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--design-ink2)",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 10 }}>{agentOpen ? "▼" : "▶"}</span>
          <span style={{ fontWeight: 500 }}>Agent pipeline</span>
          {run && (
            <span style={{ marginLeft: "auto", color: "var(--design-ink3)" }}>
              {run.subtasks_done}/{run.subtasks_total}
            </span>
          )}
        </button>

        {agentOpen && (
          <div
            style={{
              padding: "0 14px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 180,
              overflowY: "auto",
            }}
          >
            {subtasks.length === 0 ? (
              <span style={{ fontSize: 12, color: "var(--design-ink3)" }}>
                No pipeline tasks yet.
              </span>
            ) : (
              subtasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--design-ink2)",
                  }}
                >
                  <StatusDot status={t.status} />
                  <span style={{ fontWeight: 500, minWidth: 80 }}>{t.agent}</span>
                  <span style={{ color: "var(--design-ink3)", fontSize: 11 }}>
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 14px 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Skills chips */}
      <div
        style={{
          padding: "10px 14px 6px",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          flexShrink: 0,
          borderTop: "1px solid var(--design-border)",
        }}
      >
        {SKILLS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSkill(activeSkill === s.id ? null : s.id)}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${activeSkill === s.id ? "var(--design-terracotta)" : "var(--design-border)"}`,
              background: activeSkill === s.id ? "var(--design-terracotta-soft)" : "transparent",
              color: activeSkill === s.id ? "var(--design-terracotta)" : "var(--design-ink3)",
              cursor: "pointer",
              fontWeight: activeSkill === s.id ? 500 : 400,
              transition: "all 0.15s ease",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "8px 14px 14px",
          flexShrink: 0,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask for changes, describe what you need…"
          rows={2}
          style={{
            flex: 1,
            resize: "none",
            border: "1px solid var(--design-border)",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 13,
            color: "var(--design-ink)",
            background: "var(--design-paper)",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            background: input.trim() && !sending ? "var(--design-terracotta)" : "var(--design-terracotta-disabled)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor: input.trim() && !sending ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "background 0.15s ease",
          }}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "done" ? "#16a34a"
    : status === "error" ? "#dc2626"
    : status === "running" ? "var(--design-terracotta)"
    : "var(--design-ink3)";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--design-terracotta-soft)",
            border: "1px solid var(--design-terracotta)",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            color: "var(--design-terracotta)",
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {(msg.agent ?? "A")[0]}
        </div>
      )}
      <div
        style={{
          maxWidth: "78%",
          background: isUser ? "var(--design-terracotta)" : "var(--design-bg2)",
          color: isUser ? "white" : "var(--design-ink)",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          padding: "9px 12px",
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {!isUser && msg.agent && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--design-terracotta)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {msg.agent}
          </div>
        )}
        {msg.content}
      </div>
    </div>
  );
}

function buildInitialMessages(brief: Brief, subtasks: Subtask[]): Message[] {
  const msgs: Message[] = [];

  // Welcome message from NEXUS
  msgs.push({
    id: "welcome",
    role: "agent",
    agent: "NEXUS",
    content:
      brief.status === "done"
        ? `Your design for ${brief.client_name ?? "this project"} is ready. Ask me to make changes, regenerate sections, or adjust the style.`
        : brief.status === "error"
        ? `Something went wrong building ${brief.client_name ?? "this design"}. Describe what you'd like and I'll try again.`
        : `Building your design for ${brief.client_name ?? "this project"}… I'll update you as each section completes.`,
    created_at: brief.created_at * 1000,
  });

  // Surface any completed ASSEMBLER output as a message
  const assembler = subtasks.find((t) => t.agent === "ASSEMBLER" && t.status === "done" && t.output);
  if (assembler?.output) {
    msgs.push({
      id: assembler.id,
      role: "agent",
      agent: "ASSEMBLER",
      content: "Design assembled. Open the files in the panel to preview your output.",
      created_at: brief.updated_at * 1000,
    });
  }

  return msgs;
}
