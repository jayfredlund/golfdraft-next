export const supabaseUrl = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

function requireEnv(v: string | null | undefined, key: string): string {
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}
