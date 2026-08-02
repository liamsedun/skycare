// Shared Supabase admin client for edge functions.
// Service role key lives in the function env (SUPABASE_SERVICE_ROLE_KEY),
// injected automatically by the Supabase CLI / hosting platform.
import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

export async function handleCors(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
}