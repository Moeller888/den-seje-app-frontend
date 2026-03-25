function render() {
  const questionEl = document.getElementById("question")

  if (!questionEl) {
    console.error("Missing #question element")
    return
  }

  console.log("RENDER STATE:", state)

  if (state.current === UI_STATES.LOADING_QUESTION) {
    questionEl.innerText = "Indlæser..."
    return
  }

  if (state.current === UI_STATES.AWAITING_ANSWER) {
    questionEl.innerText = state.question || "Ingen spørgsmål"
    return
  }

  questionEl.innerText = "Ingen spørgsmål"
}
