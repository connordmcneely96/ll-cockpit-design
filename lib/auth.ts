// Validates Supabase JWT using the service role key.
// Call from Server Components / Route Handlers only.
export async function validateToken(token: string): Promise<{ userId: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey,
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.id ? { userId: data.id } : null;
}
