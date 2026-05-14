const COCKPIT_BASE = "https://ll-cockpit.connorpattern.workers.dev";

export async function cockpitFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${COCKPIT_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // Send as Authorization Bearer so ll-cockpit routes can validate
      // the JWT directly via supabase.auth.getUser(token).
      // Cookie-based forwarding doesn't work because ll-cockpit uses
      // @supabase/ssr chunked cookies, not a single sb-access-token cookie.
      "Authorization": `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
}
