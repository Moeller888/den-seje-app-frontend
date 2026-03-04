import fs from "node:fs";
import path from "node:path";

export interface CLIConfig {
  domain: string;
  learning_objectives: string[];
  generation: {
    default_difficulty: number;
    batch_size: number;
  };
  ai: {
    model: string;
    temperature: number;
  };
}

function loadJSON(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export function loadConfig(): CLIConfig {
  const configPath = path.resolve(
    process.cwd(),
    "config",
    "default.json"
  );

  const fileConfig = loadJSON(configPath) as CLIConfig;

  return {
    ...fileConfig,
    generation: {
      ...fileConfig.generation,
      batch_size:
        process.env.BATCH_SIZE !== undefined
          ? Number(process.env.BATCH_SIZE)
          : fileConfig.generation.batch_size
    },
    ai: {
      ...fileConfig.ai,
      model:
        process.env.AI_MODEL ?? fileConfig.ai.model
    }
  };
}