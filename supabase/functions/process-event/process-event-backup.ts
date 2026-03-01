import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ===============================
// XP CONFIG
// ===============================

const PROFILE_LEVEL_COINS = 50
const MILESTONE_BONUS = 250
const MILESTONES = [10, 25, 50, 100, 200, 300, 400, 500]

const EVENT_DEFINITIONS: Record<string, { xp: number; coins: number }> = {
  MC_CORRECT: { xp: 2, coins: 2 },
  MC_WRONG: { xp: 0, coins: 0 },
  TEXT_APPROVED: { xp: 10, coins: 20 },
  XP_BOOST: { xp: 0, coins: 0 },
  REFUND: { xp: 0, coins: 0 }
}

// ===============================
// XP ENGINE
// ===============================

function calculateLevelFromXP(xp: number) {
  let level = 1
  let xpRemaining = xp

  while (true) {
    const xpRequired = 50 + (level - 1) * 25
    if (xpRemaining >= xpRequired) {
      xpRemaining -= xpRequired
      level++
    } else break
  }

  return level
}

function isMilestone(level: number) {
  return MILESTONES.includes(level)
}

// ===============================
// INITIAL STATE
// ===============================

function createInitialState() {
  return {
    xp: 0,
    coins: 0,
    level: 1,
    correct_answers: 0,
    total_correct_answers: 0,

    mastery_level: 1,
    mastery_balance: 0
  }
}

// ===============================
// APPLY EVENT
// ===============================

function applyEvent(state: any, event: any) {

  const definition = EVENT_DEFINITIONS[event.type]
  if (!definition) throw new Error("Unknown event type")

  // ---------- XP ----------
  let xpDelta = definition.xp
  let coinsDelta = definition.coins

  if (event.payload?.xpDelta !== undefined)
    xpDelta = event.payload.xpDelta

  if (event.payload?.coinsDelta !== undefined)
    coinsDelta = event.payload.coinsDelta

  const newXP = Math.max(0, state.xp + xpDelta)
  const oldLevel = state.level
  const newLevel = calculateLevelFromXP(newXP)

  let newCoins = state.coins + coinsDelta

  if (newLevel > oldLevel) {
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      newCoins += PROFILE_LEVEL_COINS
      if (isMilestone(lvl)) {
        newCoins += MILESTONE_BONUS
      }
    }
  }

  // ---------- MASTERY ----------
  let masteryLevel = state.mastery_level
  let masteryBalance = state.mastery_balance

  if (event.type === "MC_CORRECT") {
    masteryBalance += 1
  }

  if (event.type === "MC_WRONG") {
    masteryBalance -= 1
  }

  if (masteryBalance >= 3) {
    masteryLevel = Math.min(1000, masteryLevel + 1)
    masteryBalance = 0
  }

  if (masteryBalance <= -3) {
    masteryLevel = Math.max(1, masteryLevel - 1)
    masteryBalance = 0
  }

  const newState = {
    ...state,
    xp: newXP,
    coins: newCoins,
    level: newLevel,
    mastery_level: masteryLevel,
    mastery_balance: masteryBalance
  }

  if (event.type === "MC_CORRECT") {
    newState.correct_answers += 1
    newState.total_correct_answers += 1
  }

  if (event.type === "TEXT_APPROVED") {
    newState.total_correct_answers += 1
  }

  return newState
}

// ===============================
// EDGE FUNCTION
// ===============================

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader)
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    )

    const token = authHeader.replace("Bearer ", "")

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token)

    if (userError || !user)
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const body = await req.json()
    const { type, payload } = body

    if (!type)
      return new Response("Event type required", { status: 400, headers: corsHeaders })

    await supabase
      .from("student_events")
      .insert({
        student_id: user.id,
        type,
        payload: payload ?? {}
      })

    const { data: events } = await supabase
      .from("student_events")
      .select("*")
      .eq("student_id", user.id)
      .order("created_at", { ascending: true })

    let state = createInitialState()

    for (const event of events ?? []) {
      state = applyEvent(state, event)
    }

    await supabase
      .from("student_progress")
      .upsert({
        student_id: user.id,
        xp: state.xp,
        coins: state.coins,
        level: state.level,
        correct_answers: state.correct_answers,
        total_correct_answers: state.total_correct_answers,
        updated_at: new Date().toISOString()
      })

    return new Response(JSON.stringify(state), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err: any) {
    return new Response(err.message, { status: 500, headers: corsHeaders })
  }
})