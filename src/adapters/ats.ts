import { fetchJson } from "@/lib/http";
import type { Adapter, AdapterContext, RawJob } from "@/pipeline/types";
import type { Source } from "@/db/schema";
import { asBool, pickArray, pickDate, pickString } from "./helpers";
import { stripHtml } from "@/pipeline/normalize";

/**
 * Every major ATS exposes a free, unauthenticated JSON endpoint so customers
 * can embed their board on a marketing site. These are official, structured,
 * unmetered and never blocked: the highest-signal sources in the system.
 *
 * Which ATS a company uses correlates strongly with what kind of company it is:
 * Greenhouse, Lever and Ashby skew towards AI labs and startups, while Workday
 * (handled separately) holds the semiconductor, defence and aerospace employers.
 */

export interface AtsConfig {
  /** Board token / company slug in the ATS URL. */
  token?: string;
  companyName?: string;
  market?: string;
}

function requireToken(source: Source): string {
  const token = (source.config as AtsConfig).token;
  if (!token) throw new Error(`Source "${source.label}" is missing config.token`);
  return token;
}

/** Greenhouse HTML-entity-encodes its `content` field; decode before stripping. */
function decodeEntities(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export const greenhouseAdapter: Adapter = {
  provider: "greenhouse",
  tier: 2,
  isConfigured: () => true,

  async fetchJobs(source, ctx): Promise<RawJob[]> {
    const token = requireToken(source);
    const config = source.config as AtsConfig;
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
    );
    const results = pickArray(payload, ["jobs"]);
    ctx.log(`greenhouse ${token}: ${results.length} jobs`);

    return results.flatMap((item): RawJob[] => {
      const title = pickString(item, ["title"]);
      const url = pickString(item, ["absolute_url", "url"]);
      if (!title || !url) return [];
      return [
        {
          providerJobId: pickString(item, ["id"]),
          url,
          title,
          companyName: config.companyName,
          locationRaw: pickString(item, ["location.name", "location"]),
          description: stripHtml(decodeEntities(pickString(item, ["content"]))),
          postedAt: pickDate(item, ["first_published", "updated_at"]),
          raw: item,
        },
      ];
    });
  },
};

export const leverAdapter: Adapter = {
  provider: "lever",
  tier: 2,
  isConfigured: () => true,

  async fetchJobs(source, ctx): Promise<RawJob[]> {
    const token = requireToken(source);
    const config = source.config as AtsConfig;
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${token}?mode=json`,
    );
    const results = pickArray(payload);
    ctx.log(`lever ${token}: ${results.length} jobs`);

    return results.flatMap((item): RawJob[] => {
      const title = pickString(item, ["text", "title"]);
      const url = pickString(item, ["hostedUrl", "applyUrl"]);
      if (!title || !url) return [];

      const workplaceType = pickString(item, ["workplaceType"]);
      return [
        {
          providerJobId: pickString(item, ["id"]),
          url,
          title,
          companyName: config.companyName,
          locationRaw: pickString(item, ["categories.location"]),
          employmentType: pickString(item, ["categories.commitment"]),
          remote: workplaceType === "remote",
          hybrid: workplaceType === "hybrid",
          // Lever gives clean plain text, so no HTML stripping needed.
          description:
            pickString(item, ["descriptionPlain"]) ??
            stripHtml(pickString(item, ["description"])),
          postedAt: pickDate(item, ["createdAt"]),
          raw: item,
        },
      ];
    });
  },
};

export const ashbyAdapter: Adapter = {
  provider: "ashby",
  tier: 2,
  isConfigured: () => true,

  async fetchJobs(source, ctx): Promise<RawJob[]> {
    const token = requireToken(source);
    const config = source.config as AtsConfig;
    const payload = await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`,
    );
    const results = pickArray(payload, ["jobs"]);
    ctx.log(`ashby ${token}: ${results.length} jobs`);

    return results.flatMap((item): RawJob[] => {
      const title = pickString(item, ["title"]);
      const url = pickString(item, ["jobUrl", "applyUrl"]);
      if (!title || !url) return [];
      if (asBool((item as Record<string, unknown>).isListed) === false) return [];

      return [
        {
          providerJobId: pickString(item, ["id"]),
          url,
          title,
          companyName: config.companyName,
          locationRaw: pickString(item, ["location"]),
          employmentType: pickString(item, ["employmentType"]),
          remote: asBool((item as Record<string, unknown>).isRemote),
          description:
            pickString(item, ["descriptionPlain"]) ??
            stripHtml(pickString(item, ["descriptionHtml"])),
          postedAt: pickDate(item, ["publishedAt"]),
          raw: item,
        },
      ];
    });
  },
};

export const workableAdapter: Adapter = {
  provider: "workable",
  tier: 2,
  isConfigured: () => true,

  async fetchJobs(source, ctx): Promise<RawJob[]> {
    const token = requireToken(source);
    const config = source.config as AtsConfig;
    const payload = await fetchJson(
      `https://apply.workable.com/api/v1/widget/accounts/${token}?details=true`,
    );
    const results = pickArray(payload, ["jobs"]);
    ctx.log(`workable ${token}: ${results.length} jobs`);

    return results.flatMap((item): RawJob[] => {
      const title = pickString(item, ["title"]);
      const shortcode = pickString(item, ["shortcode"]);
      const url =
        pickString(item, ["url", "application_url"]) ??
        (shortcode ? `https://apply.workable.com/${token}/j/${shortcode}/` : undefined);
      if (!title || !url) return [];

      const city = pickString(item, ["location.city", "city"]);
      const country = pickString(item, ["location.country", "country"]);

      return [
        {
          providerJobId: shortcode,
          url,
          title,
          companyName: config.companyName ?? pickString(payload, ["name"]),
          locationRaw: [city, country].filter(Boolean).join(", ") || undefined,
          employmentType: pickString(item, ["type", "employment_type"]),
          remote: asBool((item as Record<string, unknown>).telecommuting),
          description: stripHtml(
            pickString(item, ["description", "full_description"]),
          ),
          postedAt: pickDate(item, ["published_on", "created_at"]),
          raw: item,
        },
      ];
    });
  },
};

export const atsAdapters = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workable: workableAdapter,
};
