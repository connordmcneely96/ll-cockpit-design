"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LEFT_TABS = ["Prototype", "Slide deck", "From template", "Other"] as const;
type LeftTab = (typeof LEFT_TABS)[number];

export default function LeftPaneClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LeftTab>("Prototype");
  const [projectName, setProjectName] = useState("");
  const [protoFidelity, setProtoFidelity] = useState<"wireframe" | "high-fidelity">("high-fidelity");
  const [speakerNotes, setSpeakerNotes] = useState(false);

  const createLabel =
    activeTab === "From template" ? "+ Create from template" : "+ Create";

  function handleCreate() {
    const params = new URLSearchParams();
    params.set("type", activeTab.toLowerCase().replace(/\s+/g, "-"));
    if (projectName.trim()) params.set("name", projectName.trim());
    if (activeTab === "Prototype") params.set("fidelity", protoFidelity);
    if (activeTab === "Slide deck") params.set("speaker_notes", String(speakerNotes));
    router.push(`/design/new?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab row */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--design-border)",
          padding: "0 12px",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {LEFT_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--design-ink)" : "2px solid transparent",
              padding: "10px 8px",
              fontSize: 13,
              fontWeight: activeTab === tab ? 500 : 400,
              color: activeTab === tab ? "var(--design-ink)" : "var(--design-ink3)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
        {/* New project heading */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "16px 16px 8px",
            color: "var(--design-ink)",
          }}
        >
          {activeTab === "From template" ? "New from template" :
           activeTab === "Slide deck" ? "New slide deck" :
           activeTab === "Other" ? "New project" :
           "New prototype"}
        </div>

        {/* Project name input */}
        <div style={{ padding: "0 16px" }}>
          <input
            type="text"
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            style={{
              width: "100%",
              border: "1px solid var(--design-border)",
              borderRadius: 6,
              padding: "10px 12px",
              background: "transparent",
              fontSize: 14,
              color: "var(--design-ink)",
              outline: "none",
            }}
          />
        </div>

        {/* Tab-specific controls */}
        <div style={{ padding: "12px 16px 0" }}>
          {activeTab === "Prototype" && (
            <div style={{ display: "flex", gap: 8 }}>
              {(["wireframe", "high-fidelity"] as const).map((fidelity) => (
                <button
                  key={fidelity}
                  onClick={() => setProtoFidelity(fidelity)}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    border: `1px solid ${protoFidelity === fidelity ? "var(--design-terracotta)" : "var(--design-border)"}`,
                    borderRadius: 6,
                    background: "transparent",
                    fontSize: 13,
                    color: protoFidelity === fidelity ? "var(--design-terracotta)" : "var(--design-ink)",
                    cursor: "pointer",
                    fontWeight: protoFidelity === fidelity ? 500 : 400,
                  }}
                >
                  {fidelity === "wireframe" ? "Wireframe" : "High fidelity"}
                </button>
              ))}
            </div>
          )}

          {activeTab === "Slide deck" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                color: "var(--design-ink)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={speakerNotes}
                onChange={(e) => setSpeakerNotes(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--design-terracotta)" }}
              />
              Use speaker notes / Less text on slides
            </label>
          )}

          {activeTab === "From template" && (
            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--design-ink)",
                  cursor: "pointer",
                  padding: "8px 0",
                }}
              >
                <input
                  type="radio"
                  name="template"
                  defaultChecked
                  style={{ accentColor: "var(--design-terracotta)" }}
                />
                Animation — Timeline-based motion design
              </label>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--design-terracotta)",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                How to create a template
              </div>
            </div>
          )}
        </div>

        {/* Create button */}
        <div style={{ padding: "16px 16px 0" }}>
          <button
            onClick={handleCreate}
            style={{
              width: "100%",
              background: "var(--design-terracotta)",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: 10,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {createLabel}
          </button>
        </div>

        {/* Privacy caption */}
        <div
          style={{
            fontSize: 12,
            color: "var(--design-ink3)",
            textAlign: "center",
            marginTop: 12,
            padding: "0 16px",
          }}
        >
          Only you can see your project by default.
        </div>

        {/* Design system promo card */}
        <div
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 8,
            padding: 16,
            margin: 16,
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--design-ink2)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Create a design system so anyone can create good-looking designs and assets.
          </p>
          <button
            onClick={() => router.push("/design/systems")}
            style={{
              width: "100%",
              background: "var(--design-terracotta)",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: 9,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Set up design system
          </button>
        </div>
      </div>
    </div>
  );
}
