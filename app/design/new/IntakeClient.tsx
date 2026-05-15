"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SKILLS = [
  { id: "hi_fi_design", label: "Hi-fi design", hint: "Production-ready visual fidelity" },
  { id: "wireframe", label: "Wireframe", hint: "Low-fidelity structure only" },
  { id: "interactive_prototype", label: "Interactive prototype", hint: "Clickable JS interactions" },
  { id: "make_a_deck", label: "Make a deck", hint: "Slide-based presentation" },
  { id: "frontend_design", label: "Frontend design", hint: "Production HTML/CSS/JSX" },
] as const;

type SkillId = (typeof SKILLS)[number]["id"];

// Sprint 18E — attached design system pre-fill
type AttachedSystem = {
  slug: string;
  name: string;
  description: string | null;
  primary_color: string | null;
  category: string | null;
  tags: string[];
};

export default function IntakeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const projectType = searchParams.get("type") ?? "prototype";
  const initialName = searchParams.get("name") ?? "";
  const fidelity = searchParams.get("fidelity");
  const systemSlug = searchParams.get("system"); // Sprint 18E

  const defaultSkill: SkillId =
    fidelity === "wireframe" ? "wireframe"
    : projectType === "slide-deck" ? "make_a_deck"
    : projectType === "other" ? "frontend_design"
    : "hi_fi_design";

  const [clientName, setClientName] = useState(initialName);
  const [businessDescription, setBusinessDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [moodTone, setMoodTone] = useState("");
  const [mustHaveSections, setMustHaveSections] = useState("");
  const [styleRefs, setStyleRefs] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [constraints, setConstraints] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillId>(defaultSkill);

  // Sprint 18E — attached design system state
  const [attachedSystem, setAttachedSystem] = useState<AttachedSystem | null>(null);
  const [systemLoading, setSystemLoading] = useState(!!systemSlug);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sprint 18E — when ?system=slug is present, fetch the system metadata
  // and use it to pre-fill mood_tone + brand_colors as helpful defaults.
  useEffect(() => {
    if (!systemSlug) return;
    fetch(`/api/design/systems/${encodeURIComponent(systemSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.slug) {
          setAttachedSystem({
            slug: data.slug,
            name: data.name,
            description: data.description ?? null,
            primary_color: data.primary_color ?? null,
            category: data.category ?? null,
            tags: Array.isArray(data.tags) ? data.tags : [],
          });
          // Pre-fill helpful fields from the system, but only if the user
          // hasn't typed anything yet. Don't clobber.
          if (data.tags?.length && !moodTone) {
            setMoodTone(`Inspired by ${data.name} — ${(data.tags as string[]).slice(0, 3).join(", ")}`);
          }
          if (data.primary_color && !brandColors) {
            setBrandColors(`${data.primary_color} primary (from ${data.name} system)`);
          }
        }
        setSystemLoading(false);
      })
      .catch(() => setSystemLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemSlug]);

  const projectTypeLabel =
    projectType === "slide-deck" ? "slide deck"
    : projectType === "from-template" ? "project from template"
    : projectType === "other" ? "project"
    : "prototype";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientName.trim() || !businessDescription.trim() || !targetAudience.trim()
        || !moodTone.trim() || !mustHaveSections.trim()) {
      setError("Please fill in all required fields (marked *).");
      return;
    }

    setSubmitting(true);
    try {
      const styleRefsArr = styleRefs
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/design/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName.trim(),
          business_description: businessDescription.trim(),
          target_audience: targetAudience.trim(),
          mood_tone: moodTone.trim(),
          must_have_sections: mustHaveSections.trim(),
          style_references: styleRefsArr.length ? styleRefsArr : undefined,
          brand_colors: brandColors.trim() || undefined,
          constraints: constraints.trim() || undefined,
          skill_hint: selectedSkill,
          project_type: projectType,
          // Sprint 18E — pass attached system to pipeline
          attached_design_system_slug: attachedSystem?.slug,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.brief_id) {
        const detail =
          data?.detail
          ?? data?.upstream_status
          ?? data?.error
          ?? "unknown_error";
        setError(`Failed to create brief: ${detail}`);
        setSubmitting(false);
        return;
      }

      router.push(`/design/${data.brief_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--design-bg)",
        color: "var(--design-ink)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <header
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid var(--design-border)",
          background: "var(--design-bg)",
          gap: 12,
        }}
      >
        <button
          onClick={() => router.push("/design")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--design-ink3)",
            fontSize: 18,
            lineHeight: 1,
            padding: "4px 6px",
          }}
          title="Back to Design Build"
        >
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          New {projectTypeLabel}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--design-ink3)",
            border: "1px solid var(--design-border)",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          Pre-flight
        </span>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "32px 24px 80px",
        }}
      >
        {/* Sprint 18E — attached design system banner */}
        {systemSlug && (
          <div
            style={{
              border: `1px solid ${attachedSystem?.primary_color ?? "var(--design-terracotta)"}`,
              background: "var(--design-terracotta-soft)",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 22,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: attachedSystem?.primary_color ?? "var(--design-bg2)",
                flexShrink: 0,
                border: "1px solid var(--design-border)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--design-ink)" }}>
                {systemLoading
                  ? "Loading design system…"
                  : attachedSystem
                    ? `Using ${attachedSystem.name} design system`
                    : "Design system not found"}
              </div>
              {attachedSystem?.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--design-ink3)",
                    marginTop: 3,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {attachedSystem.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachedSystem(null);
                router.replace("/design/new");
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--design-border)",
                color: "var(--design-ink2)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
              title="Remove this design system"
            >
              Remove
            </button>
          </div>
        )}

        <Section
          label="What kind of design?"
          help="Influences how the agents approach generation."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SKILLS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSkill(s.id)}
                style={{
                  fontSize: 12,
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: `1px solid ${selectedSkill === s.id ? "var(--design-terracotta)" : "var(--design-border)"}`,
                  background: selectedSkill === s.id ? "var(--design-terracotta-soft)" : "transparent",
                  color: selectedSkill === s.id ? "var(--design-terracotta)" : "var(--design-ink2)",
                  cursor: "pointer",
                  fontWeight: selectedSkill === s.id ? 500 : 400,
                  transition: "all 0.15s ease",
                }}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Client name" required>
          <Input value={clientName} onChange={setClientName} placeholder="Acme Corp" />
        </Section>

        <Section
          label="Business description"
          required
          help="What does the client do? Who are they for?"
        >
          <Textarea
            value={businessDescription}
            onChange={setBusinessDescription}
            placeholder="B2B inventory SaaS for mid-market industrial distributors."
            rows={3}
          />
        </Section>

        <Section label="Target audience" required>
          <Textarea
            value={targetAudience}
            onChange={setTargetAudience}
            placeholder="Operations directors at 50-500 person companies."
            rows={2}
          />
        </Section>

        <Section
          label="Mood / tone"
          required
          help={attachedSystem ? "Pre-filled from attached design system. Edit to refine." : "Adjectives the design should evoke."}
        >
          <Input
            value={moodTone}
            onChange={setMoodTone}
            placeholder="Modern, confident, technical but approachable."
          />
        </Section>

        <Section
          label="Must-have sections"
          required
          help="Comma- or newline-separated."
        >
          <Textarea
            value={mustHaveSections}
            onChange={setMustHaveSections}
            placeholder="Hero, features, testimonials, pricing, contact"
            rows={3}
          />
        </Section>

        <Section
          label="Style references"
          help="One URL per line. Sites whose design you admire."
        >
          <Textarea
            value={styleRefs}
            onChange={setStyleRefs}
            placeholder={"https://linear.app\nhttps://vercel.com\nhttps://stripe.com"}
            rows={3}
            mono
          />
        </Section>

        <Section
          label="Brand colors"
          help={attachedSystem ? "Pre-filled with primary color from attached system." : "Free-form. Hex codes, named colors, or descriptions."}
        >
          <Input
            value={brandColors}
            onChange={setBrandColors}
            placeholder="#1a5dab primary, white, off-black ink"
          />
        </Section>

        <Section
          label="Constraints"
          help="Anything the agents should avoid or watch out for."
        >
          <Textarea
            value={constraints}
            onChange={setConstraints}
            placeholder="No stock photos. Avoid generic gradients."
            rows={2}
          />
        </Section>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              border: "1px solid #fecaca",
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/design")}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "1px solid var(--design-border)",
              color: "var(--design-ink2)",
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 13,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: submitting ? "var(--design-terracotta-disabled)" : "var(--design-terracotta)",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "10px 22px",
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {submitting ? "Building…" : "+ Create design"}
          </button>
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--design-ink3)",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Pipeline runs in the background. You&apos;ll watch progress on the canvas.
        </div>
      </form>
    </div>
  );
}

function Section({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--design-ink)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--design-terracotta)" }}>*</span>}
      </div>
      {help && (
        <div style={{ fontSize: 12, color: "var(--design-ink3)", marginBottom: 8, lineHeight: 1.5 }}>
          {help}
        </div>
      )}
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        border: "1px solid var(--design-border)",
        borderRadius: 6,
        padding: "10px 12px",
        background: "var(--design-paper)",
        fontSize: 14,
        color: "var(--design-ink)",
        outline: "none",
        fontFamily: "inherit",
      }}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        border: "1px solid var(--design-border)",
        borderRadius: 6,
        padding: "10px 12px",
        background: "var(--design-paper)",
        fontSize: 14,
        color: "var(--design-ink)",
        outline: "none",
        fontFamily: mono ? "ui-monospace, 'JetBrains Mono', Menlo, monospace" : "inherit",
        resize: "vertical",
        lineHeight: 1.5,
      }}
    />
  );
}
