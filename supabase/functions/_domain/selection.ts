export type QuestionRow = {
  id: string
  difficulty: number
  [key: string]: any
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function chooseDifficulty(
  effectiveMastery: number,
  rng?: () => number
) {
  const roll = rng ? rng() : Math.random()

  if (roll < 0.5) return effectiveMastery + 1
  if (roll < 0.75) return effectiveMastery
  if (roll < 0.9) return effectiveMastery + 2
  return effectiveMastery - 1
}

export function selectNextQuestion(params: {
  mastery_level: number
  mastery_balance: number | null
  questions: QuestionRow[]
  rng?: () => number
}) {
  const {
    mastery_level,
    mastery_balance,
    questions,
    rng
  } = params

  const effectiveMastery =
    mastery_level +
    clamp(mastery_balance ?? 0, -2, 2)

  const targetDifficulty = Math.max(
    1,
    chooseDifficulty(effectiveMastery, rng)
  )

  const sorted = questions
    .map(q => ({
      ...q,
      distance: Math.abs(q.difficulty - targetDifficulty)
    }))
    .sort((a, b) => a.distance - b.distance)

  return sorted[0] ?? null
}
