import fs from "node:fs";
import path from "node:path";
function loadJSON(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}
export function loadConfig() {
    const configPath = path.resolve(process.cwd(), "config", "default.json");
    const fileConfig = loadJSON(configPath);
    return {
        ...fileConfig,
        generation: {
            ...fileConfig.generation,
            batch_size: process.env.BATCH_SIZE !== undefined
                ? Number(process.env.BATCH_SIZE)
                : fileConfig.generation.batch_size
        },
        ai: {
            ...fileConfig.ai,
            model: process.env.AI_MODEL ?? fileConfig.ai.model
        }
    };
}
