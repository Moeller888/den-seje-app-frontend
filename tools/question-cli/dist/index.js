import { runGeneratePipeline } from "./pipeline/generate.js";
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    if (!command) {
        console.log("Usage: question-cli <command>");
        console.log("Available commands: generate");
        process.exit(1);
    }
    switch (command) {
        case "generate":
            await runGeneratePipeline();
            break;
        default:
            console.log(`Unknown command: ${command}`);
            process.exit(1);
    }
}
main();
