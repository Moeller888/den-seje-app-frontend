async function getNextQuestion() {
  const { data, error } = await supabase.functions.invoke("get-next-question")

  if (error) {
    console.error("API ERROR:", error)
    return null
  }

  console.log("FULL RESPONSE:", data)

  return {
    instance_id: data.instance_id,
    question: data.question,
    correct: data.correct,
    answer_format: data.answer_format
  }
}
