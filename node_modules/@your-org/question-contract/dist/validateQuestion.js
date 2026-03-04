import { questionSchema } from "./schema/questionSchema.js";
import { semanticValidator } from "./validators/semanticValidator.js";
import { constraintValidator } from "./validators/constraintValidator.js";
export function validateQuestion(input) {
    const issues = [];
    const structural = questionSchema.safeParse(input);
    if (!structural.success) {
        issues.push({
            type: "structural",
            severity: "error",
            message: "Structural validation failed"
        });
        return {
            success: false,
            issues
        };
    }
    const data = structural.data;
    // Semantic validation layer
    semanticValidator(data, issues);
    // Constraint validation layer
    constraintValidator(data, issues);
    const hasErrors = issues.some(i => i.severity === "error");
    return {
        success: !hasErrors,
        data,
        issues
    };
}
