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
  const [messages, setMessages] = useState<Message[]>(() => buildInitialMessages(brief));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Auto-expand the disclosure while building; collapsed by default once done.
  const [agentOpen, setAgentOpen] = useState(brief.status === "building");
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [expandedSubtask, setExpandedSubtask] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (brief.status === "building") setAgentOpen(true);
  }, [brief.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const totalCost = subtasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);
  const doneCount = subtasks.filter((t) => t.status === "done").length;
  const runningCount = subtasks.filter((t) => t.status === "running").length;

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        minWidth: 0, // critical for flex children — prevents content from forcing width
      }}
    >
      {/* Agent execution disclosure header — always visible compact strip */}
      <div
        style={{
          borderBottom: "1px solid var(--design-border)",
          flexShrink: 0,
          background: "var(--design-bg)",
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
          <span
            style={{
              fontSize: 10,
              color: "var(--design-ink3)",
              transition: "transform 0.15s ease",
              transform: agentOpen ? "rotate(0deg)" : "rotate(-90deg)",
              display: "inline-block",
              width: 10,
            }}
          >
            ▼
          </span>
          <span style={{ fontWeight: 500 }}>Agent pipeline</span>
          {run && (
            <span style={{ color: "var(--design-ink3)", fontSize: 11 }}>
              {doneCount}/{run.subtasks_total}
              {runningCount > 0 && (
                <span style={{ marginLeft: 6, color: "var(--design-terracotta)" }}>
                  · {runningCount} running
                </span>
              )}
            </span>
          )}
          {totalCost > 0 && (
            <span
              style={{
                marginLeft: "auto",
                color: "var(--design-ink3)",
                fontSize: 11,
                fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
                flexShrink: 0,
              }}
            >
              ${totalCost.toFixed(3)}
            </span>
          )}
        </button>
      </div>

      {/* Agent disclosure body — collapsible, scrollable, fixed max-height */}
      {agentOpen && (
        <div
          style={{
            maxHeight: 220, // tighter — leaves more room for chat
            overflowY: "auto",
            background: "var(--design-bg)",
            borderBottom: "1px solid var(--design-border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "8px 12px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            {subtasks.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--design-ink3)",
                  padding: "6px 8px",
                  fontStyle: "italic",
                }}
              >
                Waiting for orchestrator to dispatch tasks…
              </div>
            ) : (
              subtasks.map((t) => (
                <AgentRow
                  key={t.id}
                  subtask={t}
                  expanded={expandedSubtask === t.id}
                  onToggle={() => setExpandedSubtask((cur) => (cur === t.id ? null : t.id))}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Message list — takes remaining vertical space */}
      <div
        style={{
          flex: 1,
          minHeight: 0, // critical for flex children
          overflowY: "auto",
          padding: "16px 14px 0",
          display: "flex",
          flexDirection: "column",
          gap: 14,
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
          background: "var(--design-bg)",
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
              border: `1px solid ${
                activeSkill === s.id ? "var(--design-terracotta)" : "var(--design-border)"
              }`,
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
          background: "var(--design-bg)",
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
            minWidth: 0,
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
            background:
              input.trim() && !sending
                ? "var(--design-terracotta)"
                : "var(--design-terracotta-disabled)",
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

function AgentRow({
  subtask,
  expanded,
  onToggle,
}: {
  subtask: Subtask;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasOutput = subtask.output && subtask.output.length > 0;
  const isRunning = subtask.status === "running";
  const isDone = subtask.status === "done";
  const isFailed = subtask.status === "failed" || subtask.status === "error";
  const clickable = hasOutput || isFailed;

  return (
    <div
      style={{
        border: "1px solid var(--design-border)",
        borderRadius: 6,
        background: isRunning
          ? "var(--design-terracotta-soft)"
          : isFailed
          ? "#fef2f2"
          : isDone
          ? "var(--design-paper)"
          : "var(--design-bg2)",
        overflow: "hidden",
        minWidth: 0, // prevent forcing parent width
      }}
    >
      <button
        onClick={onToggle}
        disabled={!clickable}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "8px 10px",
          minHeight: 36, // FIXED row height prevents collapse
          display: "flex",
          alignItems: "center",
          gap: 9,
          cursor: clickable ? "pointer" : "default",
          fontSize: 12,
          color: "var(--design-ink2)",
          textAlign: "left",
        }}
      >
        <StatusIcon status={subtask.status} />
        <span
          style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 10,
            color: "var(--design-ink3)",
            minWidth: 32,
            flexShrink: 0,
          }}
        >
          {subtask.short_id}
        </span>
        <span
          style={{
            fontWeight: 500,
            color: "var(--design-ink)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={subtask.title || subtask.agent}
        >
          {subtask.title || subtask.agent}
        </span>
        {subtask.cost_usd !== undefined && subtask.cost_usd > 0 && (
          <span
            style={{
              fontSize: 10,
              color: "var(--design-ink3)",
              fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
              flexShrink: 0,
            }}
          >
            ${subtask.cost_usd.toFixed(3)}
          </span>
        )}
        {clickable && (
          <span
            style={{
              fontSize: 8,
              color: "var(--design-ink3)",
              flexShrink: 0,
              width: 8,
              transition: "transform 0.15s ease",
              transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
              display: "inline-block",
            }}
          >
            ▼
          </span>
        )}
      </button>

      {expanded && hasOutput && (
        <div
          style={{
            padding: "8px 10px 10px",
            borderTop: "1px solid var(--design-border)",
            background: "var(--design-bg2)",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 11,
            color: "var(--design-ink2)",
            maxHeight: 140,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          {subtask.output!.slice(0, 800)}
          {subtask.output!.length > 800 && (
            <span style={{ color: "var(--design-ink3)" }}>
              {"\n\n…"} ({subtask.output!.length.toLocaleString()} chars total)
            </span>
          )}
        </div>
      )}

      {expanded && isFailed && !hasOutput && (
        <div
          style={{
            padding: "8px 10px 10px",
            borderTop: "1px solid var(--design-border)",
            background: "#fef2f2",
            fontSize: 11,
            color: "#991b1b",
            lineHeight: 1.5,
          }}
        >
          This subtask failed. The overall design is not blocked — the pipeline
          continues with the other agents.
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  const size = 14;
  if (status === "done") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#16a34a",
          display: "grid",
          placeItems: "center",
          fontSize: 9,
          color: "white",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
    );
  }
  if (status === "failed" || status === "error") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#dc2626",
          display: "grid",
          placeItems: "center",
          fontSize: 9,
          color: "white",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        !
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid var(--design-terracotta)",
          borderTopColor: "transparent",
          animation: "spin 0.9s linear infinite",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1.5px solid var(--design-border)",
        flexShrink: 0,
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
            width: 26,
            height: 26,
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
          padding: "10px 13px",
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

function buildInitialMessages(brief: Brief): Message[] {
  return [
    {
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
    },
  ];
}
