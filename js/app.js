import { supabase } from "../supabaseClient.js"

const UI_STATES = {
  LOADING_QUESTION: "LOADING_QUESTION",
  AWAITING_ANSWER: "AWAITING_ANSWER",
  SUBMITTING_ANSWER: "SUBMITTING_ANSWER",
  TRANSITIONING: "TRANSITIONING"
}

let currentState = null
let currentInstanceId = null
let questionShownAt = null

function setState(newState) {
  currentState = newState
  console.log("[STATE]", newState)
  render()
}

function getEl(id) {
  const el = document.getElementById(id)
  if (!el) console.error("Missing DOM element:", id)
  return el
}

function render() {
  const answer = getEl("answer")
  const submit = getEl("submit")

  if (!answer || !submit) return

  answer.style.display = "block"
  submit.style.display = "block"
}

async function getNextQuestion() {
  try {
    const { data, error } = await supabase.functions.invoke("get-next-question")

    if (error) {
      console.error("SUPABASE ERROR OBJECT:", error)

      if (error.context) {
        try {
          const text = await error.context.text()
          console.error("RAW RESPONSE:", text)
        } catch (e) {
          console.error("Could not read error body")
        }
      }

      throw error
    }

    return data

  } catch (err) {
    console.error("API ERROR FULL:", err)
    return null
  }
}

async function submitToBackend(payload) {
  try {
    const { data, error } = await supabase.functions.invoke("process-event", {
      body: payload
    })

    if (error) throw error

    console.log("BACKEND RESPONSE:", data)
    return data

  } catch (err) {
    console.error("SUBMIT ERROR:", err)
    return null
  }
}

async function loadAndRenderQuestion() {
  setState(UI_STATES.LOADING_QUESTION)

  const data = await getNextQuestion()

  if (!data) {
    console.error("No question returned")
    return
  }

  currentInstanceId = data.question_instance_id
  questionShownAt = Date.now()

  console.log("INSTANCE_ID:", currentInstanceId)
  console.log("SHOWN_AT:", questionShownAt)

  document.getElementById("question").innerText =
    data.question?.content?.question || "Ingen spørgsmål"

  setState(UI_STATES.AWAITING_ANSWER)
}

async function submitAnswer() {
  const answer = document.getElementById("answer").value

  console.log("ANSWER:", answer)

  await submitToBackend({
    question_instance_id: currentInstanceId,
    answer,
    question_shown_at: questionShownAt
  })

  await loadAndRenderQuestion()
}

document.getElementById("submit").addEventListener("click", submitAnswer)

loadAndRenderQuestion()
