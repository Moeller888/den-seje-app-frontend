import { contentHash } from "../dedupe/contentHash.ts";

async function run() {
  const q1 = {
    content: {
      type: "mc_single",
      prompt: "When did WW2 begin? ",
      context: null,
      options: [
        { id: "A", text: "1938" },
        { id: "B", text: "1939" },
        { id: "C", text: "1940" }
      ]
    },
    answer: {
      format: "mc",
      value: "B"
    }
  };

  const q2 = {
    content: {
      type: "mc_single",
      prompt: "  when did ww2 begin?",
      context: null,
      options: [
        { id: "A", text: "1938" },
        { id: "B", text: "1939" },
        { id: "C", text: "1940" }
      ]
    },
    answer: {
      format: "mc",
      value: "B"
    }
  };

  const hash1 = await contentHash(q1 as any);
  const hash2 = await contentHash(q2 as any);

  if (hash1 !== hash2) {
    console.error("Hash should be identical but differs.");
    process.exit(1);
  }

  console.log("Hash determinism passed.");
}

run();
