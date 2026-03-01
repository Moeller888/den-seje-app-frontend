// =============================
// PROGRESSION ENGINE (EVENT DRIVEN)
// =============================
//
// Principper:
// - Ingen saldo-mutation uden event
// - Ingen DOM
// - Ingen storage
// - Ingen sideeffekter
// - Deterministisk genberegning mulig
//
// Sandhed = events
// State = aggregat
//
// =============================


// =============================
// KONFIGURATION
// =============================

const PROFILE_LEVEL_COINS = 50;
const MILESTONE_BONUS = 250;

const MILESTONES = [10, 25, 50, 100, 200, 300, 400, 500];

const EVENT_DEFINITIONS = {
  MC_CORRECT: {
    xp: 2,
    coins: 2
  },
  TEXT_APPROVED: {
    xp: 10,
    coins: 20
  },
  XP_BOOST: {
    xp: 0,
    coins: 0
  },
  REFUND: {
    xp: 0,
    coins: 0
  }
};


// =============================
// LEVEL BEREGNING
// =============================

export function calculateLevelFromXP(xp) {
  let level = 1;
  let xpRemaining = xp;

  while (true) {
    const xpRequired = 50 + (level - 1) * 25;

    if (xpRemaining >= xpRequired) {
      xpRemaining -= xpRequired;
      level++;
    } else {
      break;
    }
  }

  return level;
}

function isMilestone(level) {
  return MILESTONES.includes(level);
}


// =============================
// INITIAL STATE
// =============================

export function createInitialState() {
  return {
    xp: 0,
    coins: 0,
    level: 1,
    correctAnswers: 0,
    totalCorrectAnswers: 0
  };
}


// =============================
// APPLY SINGLE EVENT
// =============================

export function applyEvent(previousState, event) {

  const state = { ...previousState };

  const definition = EVENT_DEFINITIONS[event.type];

  if (!definition) {
    throw new Error(`Ukendt event type: ${event.type}`);
  }

  let xpDelta = definition.xp;
  let coinsDelta = definition.coins;

  // Fremtidig fleksibilitet (boosts/refunds)
  if (event.payload?.xpDelta !== undefined) {
    xpDelta = event.payload.xpDelta;
  }

  if (event.payload?.coinsDelta !== undefined) {
    coinsDelta = event.payload.coinsDelta;
  }

  const oldXP = state.xp;
  const newXP = Math.max(0, oldXP + xpDelta);

  const oldLevel = state.level;
  const newLevel = calculateLevelFromXP(newXP);

  let newCoins = state.coins + coinsDelta;

  let reward = {
    levelIncreased: false,
    newLevel: null,
    coinsAwarded: 0,
    isMilestone: false
  };

  // Hvis level stiger
  if (newLevel > oldLevel) {

    reward.levelIncreased = true;
    reward.newLevel = newLevel;

    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {

      newCoins += PROFILE_LEVEL_COINS;
      reward.coinsAwarded += PROFILE_LEVEL_COINS;

      if (isMilestone(lvl)) {
        newCoins += MILESTONE_BONUS;
        reward.coinsAwarded += MILESTONE_BONUS;
        reward.isMilestone = true;
      }
    }
  }

  // Opdater state
  const updatedState = {
    ...state,
    xp: newXP,
    coins: newCoins,
    level: newLevel
  };

  // Korrekte svar logik (kun hvis relevant event)
  if (event.type === "MC_CORRECT") {
    updatedState.correctAnswers += 1;
    updatedState.totalCorrectAnswers += 1;
  }

  if (event.type === "TEXT_APPROVED") {
    updatedState.totalCorrectAnswers += 1;
  }

  return {
    newState: updatedState,
    reward
  };
}


// =============================
// REBUILD FROM EVENT LIST
// =============================

export function rebuildStateFromEvents(events) {

  let state = createInitialState();

  for (const event of events) {
    const result = applyEvent(state, event);
    state = result.newState;
  }

  return state;
}