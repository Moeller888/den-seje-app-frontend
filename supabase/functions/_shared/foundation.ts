export function getOne<T>(rows: T[] | null): T | null {
  if (!rows || rows.length === 0) return null
  return rows[0]
}

export function assertExists<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

export function assertArray<T>(value: T[] | null | undefined): T[] {
  if (!value) return []
  return value
}

export function assertQuestion(q: any) {
  if (!q) throw new Error("Question relation missing")

  if (!q.content) {
    throw new Error("Question content missing")
  }

  if (!q.content.question) {
    throw new Error("Question text missing")
  }

  if (!q.answer_format) {
    throw new Error("Answer format missing")
  }

  return q
}

export function assertProgress(p: any) {
  if (!p) throw new Error("Progress missing")

  if (typeof p.mastery_level !== "number") {
    throw new Error("Invalid mastery level")
  }

  return p
}

export function buildQuestionResponse({
  instance_id,
  question,
}: {
  instance_id: string
  question: any
}) {
  const q = assertQuestion(question)

  return {
    question_instance_id: instance_id,
    type: "open",
    content: { question: q.content.question },
    answer_format: q.answer_format,
  }
}

export function handleError(err: any) {
  console.error("EDGE FUNCTION ERROR:", err)

  return new Response(
    JSON.stringify({
      error: err?.message || "Internal server error",
    }),
    {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
}
