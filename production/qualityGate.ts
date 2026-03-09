export function qualityGate(contract: any): void {

  const contentType = contract?.content?.type;
  const prompt = contract?.content?.prompt;
  const answerFormat = contract?.answer?.format;
  const answerValue = contract?.answer?.value;
  const cognitive = contract?.pedagogy?.cognitive_level;

  if (typeof prompt !== "string" || prompt.length < 20) {
    throw new Error("QualityGate: prompt too short");
  }

  // Prevent leaking answer inside question
  if (typeof answerValue === "string") {
    const answerLower = answerValue.toLowerCase();
    const promptLower = prompt.toLowerCase();

    if (answerLower.length > 3 && promptLower.includes(answerLower)) {
      throw new Error("QualityGate: prompt leaks answer");
    }
  }

  if (contentType === "number_input") {

    if (answerFormat !== "year") {
      throw new Error("QualityGate: number_input must use year format");
    }

    if (typeof answerValue !== "number") {
      throw new Error("QualityGate: year answer must be number");
    }

    if (answerValue < 1930 || answerValue > 1950) {
      throw new Error("QualityGate: year out of WW2 range");
    }

    return;
  }

  if (contentType === "text_input") {

    if (answerFormat !== "text") {
      throw new Error("QualityGate: text_input must use text format");
    }

    if (typeof answerValue !== "string") {
      throw new Error("QualityGate: text answer must be string");
    }

    if (answerValue.length < 30) {
      throw new Error("QualityGate: text answer too short");
    }

    if (!/[a-zA-ZæøåÆØÅ]/.test(answerValue)) {
      throw new Error("QualityGate: text answer invalid content");
    }

    // Stronger requirements for analyze questions
    if (cognitive === "analyze") {

      if (prompt.length < 80) {
        throw new Error("QualityGate: analyze prompt too short");
      }

      if (answerValue.length < 120) {
        throw new Error("QualityGate: analyze answer too short");
      }
    }

    return;
  }

  throw new Error("QualityGate: unsupported content type");
}
