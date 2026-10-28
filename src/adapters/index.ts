import type { Adapter } from "@/pipeline/types";
import { adzunaAdapter } from "./adzuna";
import { reedAdapter } from "./reed";
import { joobleAdapter } from "./jooble";
import { careerjetAdapter } from "./careerjet";
import { aiJobsAdapter } from "./aijobs";
import { myCareersFutureAdapter } from "./mycareersfuture";
import { greenhouseAdapter, leverAdapter, ashbyAdapter, workableAdapter } from "./ats";
import { workdayAdapter } from "./workday";
import { careerPageAdapter } from "./careerpage";

export const adapters: Record<string, Adapter> = {
  adzuna: adzunaAdapter,
  reed: reedAdapter,
  jooble: joobleAdapter,
  careerjet: careerjetAdapter,
  "ai-jobs": aiJobsAdapter,
  mycareersfuture: myCareersFutureAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workable: workableAdapter,
  workday: workdayAdapter,
  careerpage: careerPageAdapter,
};

export function getAdapter(provider: string): Adapter {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Unknown provider: ${provider}`);
  return adapter;
}

export function listProviders(): string[] {
  return Object.keys(adapters);
}

export { detectAtsFromUrl, probeAts } from "./detect";
