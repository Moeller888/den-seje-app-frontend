import { validateQuestion } from "./validateQuestion.js";
export function validateWithContext(input, context) {
    const baseResult = validateQuestion(input);
    const contextIssues = [];
    if (!baseResult.success || !baseResult.data) {
        return {
            ...baseResult,
            contextIssues
        };
    }
    const question = baseResult.data;
    // Rule 1: learning_objective must be allowed
    if (!context.allowedLearningObjectives.includes(question.pedagogy.learning_objective)) {
        contextIssues.push({
            type: "semantic",
            severity: "error",
            message: "learning_objective is not in whitelist"
        });
    }
    // Rule 2: logical_question_id must not already exist
    if (context.existingLogicalIds.includes(question.meta.logical_question_id)) {
        contextIssues.push({
            type: "semantic",
            severity: "error",
            message: "logical_question_id already exists"
        });
    }
    // Rule 3: content hash must not duplicate
    if (context.contentHash) {
        const hash = context.contentHash(question);
        if (context.existingContentHashes.includes(hash)) {
            contextIssues.push({
                type: "semantic",
                severity: "error",
                message: "Duplicate content detected via hash"
            });
        }
    }
    const hasErrors = contextIssues.some(i => i.severity === "error") ||
        baseResult.issues.some(i => i.severity === "error");
    return {
        success: !hasErrors,
        data: question,
        issues: baseResult.issues,
        contextIssues
    };
}
