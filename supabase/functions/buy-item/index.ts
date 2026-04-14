import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { item_id } = await req.json();

    if (!item_id) {
      return new Response(JSON.stringify({ error: "Missing item_id" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);

    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), { status: 401 });
    }

    const userId = userData.user.id;

    const { data: item, error: itemError } = await supabase
      .from("shop_items")
      .select("*")
      .eq("id", item_id)
      .maybeSingle();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
    }

    const { data: progress, error: progressError } = await supabase
      .from("student_progress")
      .select("coins")
      .eq("id", userId)
      .maybeSingle();

    if (progressError || !progress) {
      return new Response(JSON.stringify({ error: "User progress not found" }), { status: 404 });
    }

    if (progress.coins < item.price) {
      return new Response(JSON.stringify({ error: "Not enough coins" }), { status: 400 });
    }

    const { data: existing } = await supabase
      .from("user_items")
      .select("id")
      .eq("user_id", userId)
      .eq("item_id", item_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Already owned" }), { status: 400 });
    }

    const newCoins = progress.coins - item.price;

    const { error: updateError } = await supabase
      .from("student_progress")
      .update({ coins: newCoins })
      .eq("id", userId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update coins" }), { status: 500 });
    }

    const { error: insertError } = await supabase
      .from("user_items")
      .insert({
        user_id: userId,
        item_id: item_id
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to grant item" }), { status: 500 });
    }

    return new Response(JSON.stringify({
      success: true,
      item_id,
      remaining_coins: newCoins
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500 });
  }
});