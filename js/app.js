async function loadAndRenderQuestion() {
  setState(UI_STATES.LOADING_QUESTION)

  const data = await getNextQuestion()

  if (!data) {
    console.error("No data from backend")
    return
  }

  console.log("QUESTION DATA:", data)

  // 🔥 DET HER MANGLEDE
  state.instance_id = data.instance_id
  state.question = data.question
  state.correct = data.correct
  state.answer_format = data.answer_format

  setState(UI_STATES.AWAITING_ANSWER)
}
