export async function logAudit(record: unknown) {
  const line = JSON.stringify(record) + "\n";
  await Deno.writeTextFile("./logs/ai_audit.jsonl", line, { append: true });
}
