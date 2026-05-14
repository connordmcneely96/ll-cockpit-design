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
      // Send as Bearer token — ll-cockpit routes support getUser(token) directly
      "Authorization": `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
}
