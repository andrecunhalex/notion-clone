import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Singleton Supabase client — avoids creating multiple connections per tab
// ---------------------------------------------------------------------------

const clients = new Map<string, SupabaseClient>();

export function getSupabaseClient(url: string, anonKey: string): SupabaseClient {
  const key = `${url}:${anonKey}`;
  let client = clients.get(key);
  if (!client) {
    client = createClient(url, anonKey);
    clients.set(key, client);
  }
  return client;
}
