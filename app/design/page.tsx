import DesignLandingClient from "./DesignLandingClient";

// Briefs are fetched client-side via /api/design/briefs proxy route.
// Server just renders the shell — no blocking data fetch at render time.
export default function DesignPage() {
  return <DesignLandingClient />;
}
