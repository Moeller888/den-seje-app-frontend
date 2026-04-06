function mapAnswerFormat(format: string | null) {
  console.log("RAW FORMAT:", format);

  if (!format) return "mc";

  if (format.startsWith("mc")) return "mc";
  if (format.includes("number")) return "number";
  if (format.includes("text")) return "text";

  console.log("UNKNOWN FORMAT:", format);
  return "mc";
}
