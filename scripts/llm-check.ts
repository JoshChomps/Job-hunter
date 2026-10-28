import "./bootstrap";
import { checkOllama, describeProviders, ollamaConfig, providerMode } from "@/lib/llm";

/**
 * Verifies the enrichment setup before a real run, which matters far more for
 * a local model than a hosted one, since "Ollama isn't running" and "the model
 * isn't pulled" both look like a silent enrichment failure otherwise.
 *
 *   pnpm llm:check
 */

console.log(`Mode:     ${providerMode()}`);
console.log(`Provider: ${describeProviders()}\n`);

const mode = providerMode();

if (mode === "none") {
  console.log("Nothing configured. Either:");
  console.log("  ANTHROPIC_API_KEY=sk-...            (hosted, works anywhere)");
  console.log("  LLM_PROVIDER=ollama                 (local, needs Ollama running)");
  process.exit(1);
}

if (mode === "anthropic") {
  console.log("Using Claude only. Nothing local to check.");
  process.exit(0);
}

console.log(`Checking Ollama at ${ollamaConfig.baseUrl} (model: ${ollamaConfig.model})...\n`);

const result = await checkOllama();

if (!result.reachable) {
  console.log(`✗ Cannot reach Ollama: ${result.error}`);
  console.log("\n  Is it running? Start it with:  ollama serve");
  console.log(`  Or point at another host with OLLAMA_BASE_URL.`);
  process.exit(1);
}

console.log(`✓ Reachable: ${result.models.length} model(s) installed`);
if (result.models.length > 0) {
  console.log(`  ${result.models.join(", ")}`);
}

if (!result.modelPresent) {
  console.log(`\n✗ Model "${ollamaConfig.model}" is not installed.`);
  console.log(`\n  Pull it with:  ollama pull ${ollamaConfig.model}`);
  process.exit(1);
}

console.log(`✓ Model "${ollamaConfig.model}" is installed`);

if (!result.schemaOk) {
  console.log("\n⚠ The model responded but got the test case wrong.");
  console.log("  It was given an RTL design role and should have classified it as");
  console.log("  'electrical' with a non-empty summary.");
  console.log("\n  Small models are weaker at this. Try a larger one, e.g.:");
  console.log("    OLLAMA_MODEL=qwen3:14b pnpm llm:check");
  console.log("\n  Or use LLM_PROVIDER=hybrid so Claude handles the judgment calls.");
  process.exit(1);
}

console.log("✓ Schema-constrained classification returned the expected result\n");
console.log("Ready. Run enrichment with:  pnpm crawl --enrich=50");

process.exit(0);
