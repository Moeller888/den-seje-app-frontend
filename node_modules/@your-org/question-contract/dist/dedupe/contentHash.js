function normalizeString(input) {
    return input.trim().toLowerCase();
}
function stableStringify(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
}
async function sha256(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
export async function contentHash(question) {
    const base = {
        content: question.content,
        answer: question.answer
    };
    const normalized = JSON.parse(JSON.stringify(base));
    // Normalize prompt text
    if ("prompt" in normalized.content) {
        normalized.content.prompt = normalizeString(normalized.content.prompt);
    }
    // Normalize MC option texts
    if (normalized.content.type === "mc_single") {
        normalized.content.options = normalized.content.options
            .map((opt) => ({
            ...opt,
            text: normalizeString(opt.text)
        }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }
    const serialized = stableStringify(normalized);
    return sha256(serialized);
}
