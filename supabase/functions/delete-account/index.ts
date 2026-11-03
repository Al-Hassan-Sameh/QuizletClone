import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
// Deploy with JWT verification enabled. The service-role key is server-side only.
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const allowed = (Deno.env.get("APP_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim());
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  if (!allowed.includes(origin))
    return new Response('{"error":"Origin not allowed"}', {
      status: 403,
      headers,
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return new Response('{"error":"Method not allowed"}', {
      status: 405,
      headers,
    });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return new Response('{"error":"Authentication required"}', {
      status: 401,
      headers,
    });
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return new Response('{"error":"Authentication required"}', {
      status: 401,
      headers,
    });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
  return new Response(
    JSON.stringify(
      deletionError
        ? { error: "Account deletion failed. Retry later." }
        : { deleted: true },
    ),
    { status: deletionError ? 500 : 200, headers },
  );
});
