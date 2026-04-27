import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // Use a non-SUPABASE_ prefixed secret name for function secrets
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;

    // Admin client (service role) — used for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerJwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: jwtErr } = await adminClient.auth.getUser(callerJwt);
    if (jwtErr || !caller) {
      return new Response(JSON.stringify({ error: "Token 無效" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileErr || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "權限不足，僅管理員可執行此操作" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { email, displayName } = await req.json() as { email: string; displayName: string };

    if (!email || !displayName) {
      return new Response(JSON.stringify({ error: "email 與 displayName 為必填" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send invite email (service role required)
    const redirectTo = `${req.headers.get("origin") ?? supabaseUrl}/set-password`;
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: displayName },
        redirectTo,
      }
    );

    if (inviteErr) {
      const msg = inviteErr.message.toLowerCase().includes("already registered")
        ? "此 Email 已經存在"
        : inviteErr.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile: set role=partner and display_name
    const userId = inviteData.user.id;
    await adminClient
      .from("profiles")
      .upsert(
        { id: userId, email, display_name: displayName, role: "partner" },
        { onConflict: "id" }
      );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
