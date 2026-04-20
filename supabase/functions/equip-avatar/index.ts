import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const item_id = body?.item_id;

    if (!item_id) {
      return new Response(JSON.stringify({ error: "Missing item_id" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 🔐 AUTH (sikker)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const userId = user.id;

    // 🔥 SERVICE ROLE (writes)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 🎒 CHECK OWNERSHIP
    const { data: owned } = await supabase
      .from("user_items")
      .select("id")
      .eq("user_id", userId)
      .eq("item_id", item_id)
      .limit(1);

    if (!owned || owned.length === 0) {
      return new Response(JSON.stringify({ error: "Item not owned" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 📦 CHECK TYPE
    const { data: item } = await supabase
      .from("shop_items")
      .select("type")
      .eq("id", item_id)
      .limit(1);

    const safeItem = item?.[0];

    if (!safeItem || safeItem.type !== "avatar") {
      return new Response(JSON.stringify({ error: "Not an avatar item" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 🎯 SET ACTIVE AVATAR
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ active_avatar: item_id })
      .eq("id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to equip" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(
      JSON.stringify({ success: true, active_avatar: item_id }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error("EQUIP AVATAR ERROR:", err);

    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});