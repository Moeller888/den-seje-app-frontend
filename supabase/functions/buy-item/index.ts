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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    // purchase_item is SECURITY DEFINER and uses auth.uid() internally.
    // It validates item existence, ownership, and atomically deducts coins
    // in a single transaction — no race condition possible.
    const { data, error } = await supabase.rpc("purchase_item", {
      p_item_id: item_id
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("item_not_found")) {
        return new Response(JSON.stringify({ error: "Item not found" }), {
          status: 404,
          headers: corsHeaders
        });
      }
      if (msg.includes("already_owned")) {
        return new Response(JSON.stringify({ error: "Already owned" }), {
          status: 400,
          headers: corsHeaders
        });
      }
      if (msg.includes("insufficient_coins")) {
        return new Response(JSON.stringify({ error: "Not enough coins" }), {
          status: 400,
          headers: corsHeaders
        });
      }
      console.error("PURCHASE ERROR:", error);
      return new Response(JSON.stringify({ error: "Purchase failed" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        remaining_coins: data?.remaining_coins ?? 0
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
