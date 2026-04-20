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

    // 🔐 Brug USER CONTEXT (ikke manuel decode)
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

    // 🔥 SERVICE ROLE til writes
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 📦 ITEM
    const { data: item, error: itemError } = await supabase
      .from("shop_items")
      .select("id, price")
      .eq("id", item_id)
      .limit(1);

    const safeItem = item?.[0];

    if (itemError || !safeItem) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: corsHeaders
      });
    }

    // 🎒 EJET?
    const { data: existing } = await supabase
      .from("user_items")
      .select("id")
      .eq("user_id", userId)
      .eq("item_id", item_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "Already owned" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 💰 COINS
    const { data: progress, error: progressError } = await supabase
      .from("student_progress")
      .select("coins")
      .eq("student_id", userId)
      .limit(1);

    const safeProgress = progress?.[0];

    if (progressError || !safeProgress) {
      return new Response(JSON.stringify({ error: "No progress" }), {
        status: 404,
        headers: corsHeaders
      });
    }

    if (safeProgress.coins < safeItem.price) {
      return new Response(JSON.stringify({ error: "Not enough coins" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const newCoins = safeProgress.coins - safeItem.price;

    // 🔥 UPDATE COINS
    const { error: updateError } = await supabase
      .from("student_progress")
      .update({ coins: newCoins })
      .eq("student_id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update coins" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    // 🔥 INSERT ITEM
    const { error: insertError } = await supabase
      .from("user_items")
      .insert({
        user_id: userId,
        item_id
      });

    if (insertError) {
      // rollback coins
      await supabase
        .from("student_progress")
        .update({ coins: safeProgress.coins })
        .eq("student_id", userId);

      return new Response(JSON.stringify({ error: "Failed to assign item" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        remaining_coins: newCoins
      }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error("BUY ITEM ERROR:", err);

    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});