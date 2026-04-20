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
    const { item_id } = await req.json();

    if (!item_id) {
      return new Response(JSON.stringify({ error: "Missing item_id" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 🔥 USER CLIENT (forwarder auth automatisk)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("authorization") || ""
          }
        }
      }
    );

    // 🔐 HENT USER (ingen manuel token parsing!)
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const userId = user.id;

    // 🔥 ADMIN CLIENT (DB authority)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: item } = await supabaseAdmin
      .from("shop_items")
      .select("*")
      .eq("id", item_id)
      .maybeSingle();

    if (!item) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const { data: progress } = await supabaseAdmin
      .from("student_progress")
      .select("coins")
      .eq("student_id", userId)
      .maybeSingle();

    if (!progress) {
      return new Response(JSON.stringify({ error: "No progress" }), {
        status: 404,
        headers: corsHeaders
      });
    }

    if (progress.coins < item.price) {
      return new Response(JSON.stringify({ error: "Not enough coins" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const { data: existing } = await supabaseAdmin
      .from("user_items")
      .select("id")
      .eq("user_id", userId)
      .eq("item_id", item_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Already owned" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const newCoins = progress.coins - item.price;

    await supabaseAdmin
      .from("student_progress")
      .update({ coins: newCoins })
      .eq("student_id", userId);

    await supabaseAdmin
      .from("user_items")
      .insert({
        user_id: userId,
        item_id
      });

    return new Response(
      JSON.stringify({
        success: true,
        remaining_coins: newCoins
      }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});