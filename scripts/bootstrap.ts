import { existsSync } from "node:fs";
import path from "node:path";

/**
 * CLI scripts run outside Next.js, which is what normally loads .env files.
 * Node 22 can do it natively, so no dotenv dependency is needed.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (existsSync(full)) {
      try {
        process.loadEnvFile(full);
      } catch {
        // A malformed file shouldn't stop a run that has env set another way.
      }
    }
  }
}

loadEnv();
