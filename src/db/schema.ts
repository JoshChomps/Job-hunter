import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ enums */

export const userRole = pgEnum("user_role", ["owner", "contributor"]);
export const sourceKind = pgEnum("source_kind", ["job", "search", "company"]);
export const fetchVia = pgEnum("fetch_via", [
  "http",
  "firecrawl",
  "firecrawl_stealth",
]);
export const remoteType = pgEnum("remote_type", [
  "onsite",
  "hybrid",
  "remote",
  "unknown",
]);
export const stage = pgEnum("stage", [
  "inbox",
  "shortlist",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
]);
/**
 * `threshold_risk` means the salary clears today's floor but not the one
 * coming into force: currently Singapore's 1 Jan 2027 increase.
 */
export const visaFeasibility = pgEnum("visa_feasibility", [
  "yes",
  "no",
  "unknown",
  "threshold_risk",
]);
export const sponsorshipSignal = pgEnum("sponsorship_signal", [
  "yes",
  "no",
  "unknown",
]);
export const submissionStatus = pgEnum("submission_status", [
  "pending",
  "parsed",
  "failed",
  "duplicate",
]);
export const crawlStatus = pgEnum("crawl_status", [
  "running",
  "ok",
  "partial",
  "failed",
]);
export const discipline = pgEnum("discipline", [
  "electrical",
  "ai",
  "other",
  "unknown",
]);
export const seniority = pgEnum("seniority", [
  "intern",
  "new_grad",
  "early",
  "mid",
  "senior",
  "staff",
  "unknown",
]);
export const atsType = pgEnum("ats_type", [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "workday",
  "none",
  "unknown",
]);

/* ------------------------------------------------------- auth (Auth.js v5) */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: userRole("role").notNull().default("contributor"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Emails permitted to sign in. Seeded before the person ever visits, so an
 * invite works without them existing as a user yet.
 */
export const allowlist = pgTable("allowlist", {
  email: text("email").primaryKey(),
  role: userRole("role").notNull().default("contributor"),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* -------------------------------------------------------------- companies */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    website: text("website"),
    hqCountry: text("hq_country"),
    isTarget: boolean("is_target").notNull().default(false),

    atsType: atsType("ats_type").notNull().default("unknown"),
    atsTenant: text("ats_tenant"),
    atsSite: text("ats_site"),
    atsCheckedAt: timestamp("ats_checked_at"),

    // UK sponsor licence, resolved against the Home Office register.
    ukSponsorLicence: boolean("uk_sponsor_licence"),
    ukSponsorRating: text("uk_sponsor_rating"),
    ukSponsorRoutes: text("uk_sponsor_routes").array(),
    ukSponsorMatchedName: text("uk_sponsor_matched_name"),
    ukSponsorOverride: boolean("uk_sponsor_override"),

    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_slug_idx").on(t.slug)],
);

/* ---------------------------------------------------------------- sources */

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: sourceKind("kind").notNull(),
    tier: integer("tier").notNull().default(1),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    /** Provider-specific: query terms, board tokens, Workday tenant, etc. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    fetchVia: fetchVia("fetch_via").notNull().default("http"),
    market: text("market"),
    enabled: boolean("enabled").notNull().default(true),
    /** Days between runs. 7 = weekly, 1 = daily. */
    cadenceDays: integer("cadence_days").notNull().default(7),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    lastRunAt: timestamp("last_run_at"),
    lastStatus: crawlStatus("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sources_enabled_idx").on(t.enabled, t.tier)],
);

/* ------------------------------------------------------------------- jobs */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    providerJobId: text("provider_job_id"),

    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    urlHash: text("url_hash").notNull(),

    title: text("title").notNull(),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    companyNameRaw: text("company_name_raw"),

    locationRaw: text("location_raw"),
    city: text("city"),
    country: text("country"),
    remoteType: remoteType("remote_type").notNull().default("unknown"),

    employmentType: text("employment_type"),
    seniority: seniority("seniority").notNull().default("unknown"),
    isGradScheme: boolean("is_grad_scheme").notNull().default(false),

    discipline: discipline("discipline").notNull().default("unknown"),
    subDiscipline: text("sub_discipline"),
    isHardwareAi: boolean("is_hardware_ai").notNull().default(false),

    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),

    visaFeasibleUk: visaFeasibility("visa_feasible_uk")
      .notNull()
      .default("unknown"),
    visaFeasibleSg: visaFeasibility("visa_feasible_sg")
      .notNull()
      .default("unknown"),
    visaReason: text("visa_reason"),

    descriptionRaw: text("description_raw"),
    descriptionSummary: text("description_summary"),

    postedAt: timestamp("posted_at"),
    closesAt: timestamp("closes_at"),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    isOpen: boolean("is_open").notNull().default(true),

    stage: stage("stage").notNull().default("inbox"),
    isStarred: boolean("is_starred").notNull().default(false),

    dedupeKey: text("dedupe_key").notNull(),
    duplicateOf: uuid("duplicate_of"),

    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("jobs_url_hash_idx").on(t.urlHash),
    index("jobs_dedupe_key_idx").on(t.dedupeKey),
    index("jobs_stage_idx").on(t.stage),
    index("jobs_starred_idx").on(t.isStarred),
    index("jobs_country_idx").on(t.country),
    index("jobs_discipline_idx").on(t.discipline),
    index("jobs_first_seen_idx").on(t.firstSeenAt),
  ],
);

/** Same role seen on several boards. Powers the "also on Reed, Adzuna" line. */
export const jobSightings = pgTable(
  "job_sightings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    seenAt: timestamp("seen_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_sightings_unique").on(t.jobId, t.url)],
);

export const jobTags = pgTable(
  "job_tags",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.tag] })],
);

export const enrichments = pgTable(
  "enrichments",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    contentHash: text("content_hash").notNull(),
    fitScore: integer("fit_score"),
    reasons: jsonb("reasons").$type<string[]>(),
    sponsorshipSignal: sponsorshipSignal("sponsorship_signal")
      .notNull()
      .default("unknown"),
    sponsorshipStatement: text("sponsorship_statement"),
    techStack: text("tech_stack").array(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("enrichments_hash_idx").on(t.contentHash)],
);

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  appliedAt: timestamp("applied_at"),
  cvVersion: text("cv_version"),
  coverLetterUrl: text("cover_letter_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    note: text("note"),
    actorEmail: text("actor_email"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("job_events_job_idx").on(t.jobId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawUrl: text("raw_url").notNull(),
    note: text("note"),
    submittedByEmail: text("submitted_by_email"),
    submitterLabel: text("submitter_label"),
    status: submissionStatus("status").notNull().default("pending"),
    error: text("error"),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("submissions_status_idx").on(t.status)],
);

export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    provider: text("provider").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    status: crawlStatus("status").notNull().default("running"),
    found: integer("found").notNull().default(0),
    filtered: integer("filtered").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    creditsUsed: integer("credits_used").notNull().default(0),
    errors: jsonb("errors").$type<string[]>(),
  },
  (t) => [index("crawl_runs_started_idx").on(t.startedAt)],
);

/* -------------------------------------------------- visa reference data */

/**
 * Imported from the Home Office register of licensed sponsors (gov.uk CSV).
 * Replaced wholesale on each monthly import.
 */
export const ukSponsors = pgTable(
  "uk_sponsors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalisedName: text("normalised_name").notNull(),
    town: text("town"),
    county: text("county"),
    rating: text("rating"),
    routes: text("routes").array(),
    importedAt: timestamp("imported_at").notNull().defaultNow(),
  },
  (t) => [index("uk_sponsors_normalised_idx").on(t.normalisedName)],
);

/**
 * Date-aware because Singapore's EP floor rises on 1 Jan 2027 and UK figures
 * move most years. A constant here would quietly rot.
 */
export const visaThresholds = pgTable(
  "visa_thresholds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    market: text("market").notNull(),
    variant: text("variant").notNull().default("standard"),
    effectiveFrom: timestamp("effective_from").notNull(),
    minSalary: integer("min_salary").notNull(),
    currency: text("currency").notNull(),
    period: text("period").notNull(),
    notes: text("notes"),
  },
  (t) => [index("visa_thresholds_market_idx").on(t.market, t.effectiveFrom)],
);

/** SOC going rates, for the UK "70% of going rate" new-entrant comparison. */
export const socGoingRates = pgTable(
  "soc_going_rates",
  {
    socCode: text("soc_code").primaryKey(),
    occupation: text("occupation").notNull(),
    goingRate: integer("going_rate").notNull(),
    newEntrantRate: integer("new_entrant_rate").notNull(),
  },
);

/** Negative keywords, editable in the UI without a redeploy. */
export const filterKeywords = pgTable(
  "filter_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: text("keyword").notNull(),
    kind: text("kind").notNull().default("negative"),
    field: text("field").notNull().default("title"),
    enabled: boolean("enabled").notNull().default(true),
    note: text("note"),
  },
  (t) => [uniqueIndex("filter_keywords_unique").on(t.keyword, t.field)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type CrawlRun = typeof crawlRuns.$inferSelect;
