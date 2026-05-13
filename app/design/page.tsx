import { cookies } from "next/headers";
import { cockpitFetch } from "@/lib/cockpit-api";
import DesignLandingClient from "./DesignLandingClient";

type Brief = {
  id: string;
  project_name?: string;
  client_name?: string;
  created_at: string;
};

async function fetchBriefs(token: string): Promise<Brief[]> {
  try {
    const res = await cockpitFetch("/api/design/briefs", token);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.briefs) ? data.briefs : Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function DesignPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;

  const briefs: Brief[] = token ? await fetchBriefs(token) : [];

  return <DesignLandingClient briefs={briefs} />;
}
