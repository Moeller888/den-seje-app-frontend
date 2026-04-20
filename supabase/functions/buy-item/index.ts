import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, Authorization, x-client-info, apikey, content-type"
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

    // 🔐 MANUEL AUTH (STABIL)
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: userData, error: userError } =
      await supabaseAuth.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const userId = userData.user.id;

    // 🔥 ADMIN CLIENT (DB AUTHORITY)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 📦 HENT ITEM
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

    // 💰 HENT COINS (FIX: student_id)
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

    // 🎒 CHECK OM EJET
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

    // 💸 OPDATER COINS
    await supabaseAdmin
      .from("student_progress")
      .update({ coins: newCoins })
      .eq("student_id", userId);

    // 🎁 TILFØJ ITEM
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
    console.error("UNEXPECTED ERROR:", err);

    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});