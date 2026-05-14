import { Suspense } from "react";
import IntakeClient from "./IntakeClient";

export const dynamic = "force-dynamic";

// Static route /design/new takes precedence over dynamic /design/[briefId]
export default function NewBriefPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <IntakeClient />
    </Suspense>
  );
}
