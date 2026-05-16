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

// ──────────────────────────────────────────────────────────────────────
// Sprint 16 v0.5 — streaming event types (mirror of hub StreamEvent)
// ──────────────────────────────────────────────────────────────────────
type StreamEvent =
  | { type: "turn_start"; turn_index: number }
  | { type: "agent_text"; turn_index: number; text: string }
  | {
      type: "tool_use";
      turn_index: number;
      tool_use_id: string;
      tool_name: string;
      tool_input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error: boolean;
    }
  | {
      type: "done";
      final_text: string;
      tool_hops: number;
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      latency_ms: number;
    }
  | { type: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────
// Sprint 16 v0.4 — tool transparency types (preserved)
// ──────────────────────────────────────────────────────────────────────
type ToolActivity = {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: {
    rawContent: string;
    parsed?: unknown;
    isError: boolean;
  };
};

type Message = {
  id: string;
  role: "user" | "agent" | "tool";
  content?: string;
  toolActivities?: ToolActivity[];
  agent?: string;
  created_at: number;
  tool_hops?: number;
  cost_usd?: number;
  latency_ms?: number;
};

type HubChatMessageRow = {
  id: string;
  role: "user" | "assistant" | "tool_result";
  content: string | null;
  tool_calls_json: string | null;
  tool_results_json: string | null;
  model_id: string | null;
  cost_usd: number;
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
  onChatReply?: () => void;
};

export default function ChatPane({
  briefId,
  brief,
  subtasks,
  run,
  token: _token,
  onChatReply,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(() => buildInitialMessages(brief));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentOpen, setAgentOpen] = useState(brief.status === "building");
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [expandedSubtask, setExpandedSubtask] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (brief.status === "building") setAgentOpen(true);
  }, [brief.status]);

  // Hydrate prior chat turns on mount, including tool activity (unchanged)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/design/briefs/${briefId}/chat`, { method: "GET" });
        if (!res.ok) {
          setHistoryLoaded(true);
          return;
        }
        const data = (await res.json()) as { messages?: HubChatMessageRow[] };
        if (cancelled) return;
        const built = buildMessagesFromHistory(data.messages ?? []);
        if (built.length > 0) setMessages(built);
        setHistoryLoaded(true);
      } catch (err) {
        console.error("chat history load failed", err);
        setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const totalCost = subtasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);
  const doneCount = subtasks.filter((t) => t.status === "done").length;
  const runningCount = subtasks.filter((t) => t.status === "running").length;

  // ──────────────────────────────────────────────────────────────────
  // Sprint 16 v0.5 — streaming send
  //
  // Sends `Accept: text/event-stream`, reads the response body as a
  // ReadableStream, parses one SSE event at a time, dispatches each
  // event to a state update. Cards appear AS the agent works, not at
  // the end.
  // ──────────────────────────────────────────────────────────────────
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

    // Per-stream local state. Maps live for the duration of this send call.
    //   turnToolMessages: turn_index → id of the "tool" Message that batches
    //     that turn's tool calls (so multiple tool_use events in one turn
    //     share one ToolBatch render).
    //   toolMap: tool_use_id → { msgId, activityIndex } for finding the
    //     ToolActivity to mutate when its tool_result arrives.
    const turnToolMessages = new Map<number, string>();
    const toolMap = new Map<string, { msgId: string; activityIndex: number }>();
    let streamHadAnyToolCalls = false;

    function handleEvent(event: StreamEvent) {
      switch (event.type) {
        case "turn_start": {
          // No visible change — the agent_text and tool_use events that
          // follow will create the visible artifacts.
          return;
        }

        case "agent_text": {
          const newMsg: Message = {
            id: crypto.randomUUID(),
            role: "agent",
            agent: "DESIGNER",
            content: event.text,
            created_at: Date.now(),
          };
          setMessages((prev) => [...prev, newMsg]);
          return;
        }

        case "tool_use": {
          streamHadAnyToolCalls = true;
          const existingMsgId = turnToolMessages.get(event.turn_index);

          if (existingMsgId) {
            // Append to the existing tool batch for this turn
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== existingMsgId || m.role !== "tool" || !m.toolActivities) {
                  return m;
                }
                const newIndex = m.toolActivities.length;
                toolMap.set(event.tool_use_id, {
                  msgId: existingMsgId,
                  activityIndex: newIndex,
                });
                return {
                  ...m,
                  toolActivities: [
                    ...m.toolActivities,
                    {
                      toolUseId: event.tool_use_id,
                      toolName: event.tool_name,
                      toolInput: event.tool_input,
                    },
                  ],
                };
              }),
            );
          } else {
            // First tool of this turn — create a new tool batch
            const newMsgId = crypto.randomUUID();
            turnToolMessages.set(event.turn_index, newMsgId);
            toolMap.set(event.tool_use_id, {
              msgId: newMsgId,
              activityIndex: 0,
            });
            const newMsg: Message = {
              id: newMsgId,
              role: "tool",
              toolActivities: [
                {
                  toolUseId: event.tool_use_id,
                  toolName: event.tool_name,
                  toolInput: event.tool_input,
                },
              ],
              created_at: Date.now(),
            };
            setMessages((prev) => [...prev, newMsg]);
          }
          return;
        }

        case "tool_result": {
          const entry = toolMap.get(event.tool_use_id);
          if (!entry) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== entry.msgId || !m.toolActivities) return m;
              const updated = [...m.toolActivities];
              updated[entry.activityIndex] = {
                ...updated[entry.activityIndex],
                toolResult: {
                  rawContent: event.content,
                  parsed: safeJsonParse(event.content),
                  isError: event.is_error,
                },
              };
              return { ...m, toolActivities: updated };
            }),
          );
          return;
        }

        case "done": {
          // Attach total meta (cost, hops, latency) to the most recent agent
          // text message, mirroring v0.4's footer placement.
          setMessages((prev) => {
            let lastAgentIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "agent") {
                lastAgentIdx = i;
                break;
              }
            }
            if (lastAgentIdx < 0) return prev;
            const next = [...prev];
            next[lastAgentIdx] = {
              ...next[lastAgentIdx],
              tool_hops: event.tool_hops,
              cost_usd: event.cost_usd,
              latency_ms: event.latency_ms,
            };
            return next;
          });
          if (onChatReply && streamHadAnyToolCalls) onChatReply();
          return;
        }

        case "error": {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "agent",
              agent: "DESIGNER",
              content: `Something went wrong: ${event.message}`,
              created_at: Date.now(),
            },
          ]);
          return;
        }
      }
    }

    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message: text, skill: activeSkill }),
      });

      if (!res.ok || !res.body) {
        let errBody: { error?: string } = {};
        try {
          errBody = (await res.json()) as { error?: string };
        } catch {
          /* response body might not be JSON */
        }
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            agent: "DESIGNER",
            content: `Something went wrong (${res.status}). ${
              errBody.error ?? "Try again in a moment."
            }`,
            created_at: Date.now(),
          },
        ]);
        return;
      }

      // Stream reader. SSE events are `data: {...}\n\n` chunks. We accumulate
      // bytes in `buffer`, then peel off complete events at each `\n\n`.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          // Each event chunk may have multiple lines. We only consume the
          // first `data: ` line — the hub emits one JSON payload per event.
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const json = dataLine.slice(6);

          let event: StreamEvent;
          try {
            event = JSON.parse(json) as StreamEvent;
          } catch {
            console.warn("malformed SSE event", json.slice(0, 200));
            continue;
          }

          handleEvent(event);
        }
      }

      // Flush any trailing complete event in the buffer (rare but possible
      // when the stream ends without a final \n\n separator).
      if (buffer.trim().length > 0) {
        const dataLine = buffer.split("\n").find((l) => l.startsWith("data: "));
        if (dataLine) {
          try {
            handleEvent(JSON.parse(dataLine.slice(6)) as StreamEvent);
          } catch {
            /* discard */
          }
        }
      }
    } catch (err) {
      console.error("chat send error", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          agent: "DESIGNER",
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
        minWidth: 0,
      }}
    >
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

      {agentOpen && (
        <div
          style={{
            maxHeight: 220,
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 14px 0",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {!historyLoaded && (
          <div
            style={{
              fontSize: 11,
              color: "var(--design-ink3)",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            Loading conversation…
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === "tool") return <ToolBatch key={msg.id} msg={msg} />;
          return <MessageBubble key={msg.id} msg={msg} />;
        })}
        {sending && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
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
              D
            </div>
            <div
              style={{
                background: "var(--design-bg2)",
                borderRadius: "12px 12px 12px 2px",
                padding: "10px 13px",
                fontSize: 13,
                color: "var(--design-ink3)",
                fontStyle: "italic",
              }}
            >
              Thinking and working…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

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
          placeholder={
            brief.status === "building"
              ? "Wait for the build to finish, then chat to refine…"
              : "Ask for changes — try 'make the hero darker' or 'rewrite the pricing section'"
          }
          disabled={brief.status === "building"}
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
            opacity: brief.status === "building" ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || brief.status === "building"}
          style={{
            background:
              input.trim() && !sending && brief.status !== "building"
                ? "var(--design-terracotta)"
                : "var(--design-terracotta-disabled)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor:
              input.trim() && !sending && brief.status !== "building"
                ? "pointer"
                : "not-allowed",
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

// ──────────────────────────────────────────────────────────────────────
// Sprint 16 v0.4 — turn parsing helpers (history hydration only)
// ──────────────────────────────────────────────────────────────────────

function buildMessagesFromHistory(rows: HubChatMessageRow[]): Message[] {
  const result: Message[] = [];
  const toolMap = new Map<string, ToolActivity>();

  for (const row of rows) {
    if (row.role === "user") {
      if (!row.content || !row.content.trim()) continue;
      result.push({
        id: row.id,
        role: "user",
        content: row.content,
        created_at: row.created_at * 1000,
      });
      continue;
    }
    if (row.role === "assistant") {
      if (row.tool_calls_json) {
        const calls = safeParseToolCalls(row.tool_calls_json);
        if (calls.length > 0) {
          const activities: ToolActivity[] = calls.map((c) => ({
            toolUseId: c.id,
            toolName: c.name,
            toolInput: c.input,
          }));
          for (const a of activities) toolMap.set(a.toolUseId, a);
          result.push({
            id: row.id + "_tools",
            role: "tool",
            toolActivities: activities,
            created_at: row.created_at * 1000,
          });
        }
      }
      if (row.content && row.content.trim()) {
        result.push({
          id: row.id,
          role: "agent",
          agent: "DESIGNER",
          content: row.content,
          created_at: row.created_at * 1000,
          cost_usd: row.cost_usd,
        });
      }
      continue;
    }
    if (row.role === "tool_result" && row.tool_results_json) {
      const results = safeParseToolResults(row.tool_results_json);
      for (const r of results) {
        const ta = toolMap.get(r.tool_use_id);
        if (ta) {
          ta.toolResult = {
            rawContent: r.content,
            parsed: safeJsonParse(r.content),
            isError: !!r.is_error,
          };
        }
      }
    }
  }

  return result;
}

function safeParseToolCalls(json: string): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is { id: string; name: string; input: Record<string, unknown> } =>
          x && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string",
      )
      .map((x) => ({ id: x.id, name: x.name, input: x.input ?? {} }));
  } catch {
    return [];
  }
}

function safeParseToolResults(json: string): Array<{
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}> {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is { tool_use_id: string; content: string; is_error?: boolean } =>
        x && typeof x === "object" && typeof x.tool_use_id === "string",
    );
  } catch {
    return [];
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Components
// ──────────────────────────────────────────────────────────────────────

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
        minWidth: 0,
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
          minHeight: 36,
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
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
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
        {!isUser && (msg.tool_hops || msg.cost_usd || msg.latency_ms) && (
          <div
            style={{
              fontSize: 10,
              color: "var(--design-ink3)",
              fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {msg.tool_hops !== undefined && msg.tool_hops > 0 && (
              <span>
                {msg.tool_hops} tool {msg.tool_hops === 1 ? "call" : "calls"}
              </span>
            )}
            {msg.cost_usd !== undefined && msg.cost_usd > 0 && (
              <span>${msg.cost_usd.toFixed(4)}</span>
            )}
            {msg.latency_ms !== undefined && msg.latency_ms > 0 && (
              <span>{(msg.latency_ms / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sprint 16 v0.4 — ToolBatch + ToolCard (preserved)
// ──────────────────────────────────────────────────────────────────────

function ToolBatch({ msg }: { msg: Message }) {
  if (!msg.toolActivities || msg.toolActivities.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "var(--design-bg2)",
          border: "1px solid var(--design-border)",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: "var(--design-ink3)",
          flexShrink: 0,
          marginTop: 2,
        }}
        aria-hidden="true"
      >
        ⚙
      </div>
      <div
        style={{
          maxWidth: "78%",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          flex: 1,
          minWidth: 0,
        }}
      >
        {msg.toolActivities.map((ta) => (
          <ToolCard key={ta.toolUseId} activity={ta} />
        ))}
      </div>
    </div>
  );
}

function ToolCard({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(false);
  const hasResult = !!activity.toolResult;
  const isError = !!activity.toolResult?.isError;
  const isPending = !hasResult;

  const parsed = activity.toolResult?.parsed as
    | { ok?: boolean; idempotent_recovery?: boolean; cost_usd?: number; note?: string }
    | null
    | undefined;

  const isIdempotent = parsed?.idempotent_recovery === true;
  const isOk = parsed?.ok === true && !isError;
  const costFromResult = typeof parsed?.cost_usd === "number" ? parsed.cost_usd : undefined;

  const borderColor = isError
    ? "#fecaca"
    : isIdempotent
    ? "#fde68a"
    : isOk
    ? "var(--design-border)"
    : "var(--design-border)";
  const accent = isError
    ? "#dc2626"
    : isIdempotent
    ? "#b45309"
    : isOk
    ? "#16a34a"
    : "var(--design-ink3)";

  const statusGlyph = isError ? "!" : isIdempotent ? "↻" : isOk ? "✓" : "…";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        background: "var(--design-paper)",
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "7px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          color: "var(--design-ink2)",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: accent,
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
            // v0.5 — soft pulse while pending so the user sees it's alive,
            // not stalled. The pulse stops when the result arrives.
            animation: isPending ? "designPulse 1.4s ease-in-out infinite" : undefined,
          }}
        >
          {statusGlyph}
        </span>
        <span
          style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 11,
            color: "var(--design-ink)",
            fontWeight: 500,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activity.toolName}
        </span>
        {isPending && (
          <span style={{ fontSize: 10, color: "var(--design-ink3)", fontStyle: "italic" }}>
            running…
          </span>
        )}
        {isIdempotent && (
          <span style={{ fontSize: 10, color: "#b45309" }}>recovered</span>
        )}
        {costFromResult !== undefined && costFromResult > 0 && (
          <span
            style={{
              fontSize: 10,
              color: "var(--design-ink3)",
              fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            }}
          >
            ${costFromResult.toFixed(4)}
          </span>
        )}
        <span
          style={{
            fontSize: 8,
            color: "var(--design-ink3)",
            flexShrink: 0,
            width: 8,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: `1px solid ${borderColor}`,
            background: "var(--design-bg2)",
            padding: "8px 10px",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 11,
            color: "var(--design-ink2)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--design-ink3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Input
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.45,
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {formatJson(activity.toolInput)}
            </pre>
          </div>
          {activity.toolResult && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isError ? "#dc2626" : "var(--design-ink3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 4,
                }}
              >
                {isError ? "Result (error)" : "Result"}
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.45,
                  maxHeight: 200,
                  overflowY: "auto",
                  color: isError ? "#991b1b" : "var(--design-ink2)",
                }}
              >
                {activity.toolResult.parsed
                  ? formatJson(activity.toolResult.parsed)
                  : activity.toolResult.rawContent.slice(0, 1200)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function buildInitialMessages(brief: Brief): Message[] {
  return [
    {
      id: "welcome",
      role: "agent",
      agent: "DESIGNER",
      content:
        brief.status === "done"
          ? `Your design for ${brief.client_name ?? "this project"} is ready. Ask me to make changes — try "make the hero darker", "rewrite the pricing section as enterprise-focused", or "change the primary color to a warmer purple".`
          : brief.status === "error"
          ? `Something went wrong building ${brief.client_name ?? "this design"}. The build will resume automatically.`
          : `Building your design for ${brief.client_name ?? "this project"}… You can chat to refine once the build completes.`,
      created_at: brief.created_at * 1000,
    },
  ];
}
