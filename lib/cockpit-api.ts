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
      Cookie: `sb-access-token=${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
}
