import { createServer, type Server } from "node:http";

/**
 * Exercises the Ollama client against a stub server.
 *
 * A real model can't be run in CI, but everything around it can be checked:
 * the request shape Ollama expects, JSON extraction when a model wraps its
 * output in prose, and, most importantly, that a model returning nonsense
 * enum values degrades to safe defaults instead of corrupting the visa gate.
 */

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n         got ${a}\n         want ${e}`);
  }
}

/** Next chat response the stub will return, set per test case. */
let nextContent = "";
let lastRequest: Record<string, unknown> = {};

const server: Server = createServer((req, res) => {
  if (req.url === "/api/tags") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "gemma3:4b" }] }));
    return;
  }

  if (req.url === "/api/chat") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastRequest = JSON.parse(body || "{}");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: { content: nextContent } }));
    });
    return;
  }

  res.statusCode = 404;
  res.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;

process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;
process.env.OLLAMA_MODEL = "qwen3:8b";
process.env.LLM_PROVIDER = "ollama";

// Imported after the env is set, since the module reads config at load time.
const { ollamaProvider, checkOllama } = await import("@/lib/llm/ollama");
const { providerMode, activeModelId } = await import("@/lib/llm");

console.log("\nProvider selection");
check("LLM_PROVIDER=ollama selects ollama", providerMode(), "ollama");
check("model id recorded on enrichments", activeModelId(), "ollama:qwen3:8b");

console.log("\nRequest shape");
nextContent = JSON.stringify({
  discipline: "electrical",
  subDiscipline: "RTL design",
  isHardwareAi: true,
  seniority: "new_grad",
  isGradScheme: false,
  techStack: ["SystemVerilog", "FPGA"],
  summary: "Designs and verifies RTL for an inference accelerator.",
});
const classified = await ollamaProvider.classify({
  title: "Graduate RTL Design Engineer",
  description: "SystemVerilog, FPGA prototyping.",
});
check("sends the configured model", lastRequest.model, "qwen3:8b");
check("disables streaming", lastRequest.stream, false);
check("temperature pinned to 0", (lastRequest.options as { temperature: number }).temperature, 0);
check("sends a JSON schema in format", typeof lastRequest.format, "object");
check("parses a clean response", classified.discipline, "electrical");
check("keeps the description", classified.summary.length > 0, true);
check("keeps tech stack", classified.techStack, ["SystemVerilog", "FPGA"]);

console.log("\nMalformed output recovery");
nextContent = `Here is the JSON you asked for:\n\`\`\`json\n${JSON.stringify({
  discipline: "ai",
  isHardwareAi: false,
  seniority: "mid",
  isGradScheme: false,
  techStack: ["PyTorch"],
  summary: "Builds ML pipelines.",
})}\n\`\`\``;
const wrapped = await ollamaProvider.classify({ title: "ML Engineer" });
check("extracts JSON from surrounding prose", wrapped.discipline, "ai");

console.log("\nBad enum values degrade safely");
nextContent = JSON.stringify({
  discipline: "Electrical Engineering",
  isHardwareAi: "maybe",
  seniority: "junior-ish",
  isGradScheme: false,
  techStack: "not-an-array",
  summary: "x",
});
const messy = await ollamaProvider.classify({ title: "Engineer" });
check("unknown discipline falls back", messy.discipline, "unknown");
check("unknown seniority falls back", messy.seniority, "unknown");
check("non-boolean becomes false", messy.isHardwareAi, false);
check("non-array tech stack becomes empty", messy.techStack, []);

console.log("\nSponsorship never guesses 'no'");
nextContent = JSON.stringify({
  sponsorshipSignal: "probably not",
  fitScore: 72,
  reasons: ["RTL experience matches"],
});
const assessed = await ollamaProvider.assess({ title: "Engineer" }, "profile");
check(
  "garbled sponsorship becomes unknown, not no",
  assessed.sponsorshipSignal,
  "unknown",
);
check("valid score preserved", assessed.fitScore, 72);

nextContent = JSON.stringify({ sponsorshipSignal: "no", fitScore: 999, reasons: [] });
const clamped = await ollamaProvider.assess({ title: "Engineer" }, "profile");
check("out-of-range score clamped", clamped.fitScore, 100);
check("explicit 'no' is respected", clamped.sponsorshipSignal, "no");

console.log("\nHealth check");
nextContent = JSON.stringify({
  discipline: "electrical",
  isHardwareAi: true,
  seniority: "senior",
  isGradScheme: false,
  techStack: [],
  summary: "RTL design for an ML accelerator.",
});
const health = await checkOllama();
check("reports reachable", health.reachable, true);
check("finds the configured model", health.modelPresent, true);
check("validates schema adherence", health.schemaOk, true);

server.unref();
server.close(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
});
