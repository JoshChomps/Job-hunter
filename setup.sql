-- Job Hunter — complete database setup
--
-- Paste this whole file into the Neon SQL Editor and run it once. It creates
-- every table and loads the seed data, replacing "pnpm db:migrate && pnpm seed"
-- for anyone setting up without a terminal.
--
-- Safe to re-run: every statement is guarded or conflict-tolerant.
--
-- GENERATED FILE — do not edit by hand.
-- Regenerate with: pnpm tsx scripts/generate-setup-sql.ts


-- ============================================================
--  1. Schema
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "public"."ats_type" AS ENUM('greenhouse', 'lever', 'ashby', 'workable', 'workday', 'none', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."crawl_status" AS ENUM('running', 'ok', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."discipline" AS ENUM('electrical', 'ai', 'other', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."fetch_via" AS ENUM('http', 'firecrawl', 'firecrawl_stealth');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."remote_type" AS ENUM('onsite', 'hybrid', 'remote', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."seniority" AS ENUM('intern', 'new_grad', 'early', 'mid', 'senior', 'staff', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."source_kind" AS ENUM('job', 'search', 'company');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."sponsorship_signal" AS ENUM('yes', 'no', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."stage" AS ENUM('inbox', 'shortlist', 'applied', 'interview', 'offer', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."submission_status" AS ENUM('pending', 'parsed', 'failed', 'duplicate');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('owner', 'contributor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."visa_feasibility" AS ENUM('yes', 'no', 'unknown', 'threshold_risk');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);

CREATE TABLE IF NOT EXISTS "allowlist" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'contributor' NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applied_at" timestamp,
	"cv_version" text,
	"cover_letter_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"hq_country" text,
	"is_target" boolean DEFAULT false NOT NULL,
	"ats_type" "ats_type" DEFAULT 'unknown' NOT NULL,
	"ats_tenant" text,
	"ats_site" text,
	"ats_checked_at" timestamp,
	"uk_sponsor_licence" boolean,
	"uk_sponsor_rating" text,
	"uk_sponsor_routes" text[],
	"uk_sponsor_matched_name" text,
	"uk_sponsor_override" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"provider" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "crawl_status" DEFAULT 'running' NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"filtered" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"errors" jsonb
);

CREATE TABLE IF NOT EXISTS "enrichments" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"content_hash" text NOT NULL,
	"fit_score" integer,
	"reasons" jsonb,
	"sponsorship_signal" "sponsorship_signal" DEFAULT 'unknown' NOT NULL,
	"sponsorship_statement" text,
	"tech_stack" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "filter_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"kind" text DEFAULT 'negative' NOT NULL,
	"field" text DEFAULT 'title' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text
);

CREATE TABLE IF NOT EXISTS "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"actor_email" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "job_sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source_id" uuid,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "job_tags" (
	"job_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "job_tags_job_id_tag_pk" PRIMARY KEY("job_id","tag")
);

CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"provider_job_id" text,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"url_hash" text NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid,
	"company_name_raw" text,
	"location_raw" text,
	"city" text,
	"country" text,
	"remote_type" "remote_type" DEFAULT 'unknown' NOT NULL,
	"employment_type" text,
	"seniority" "seniority" DEFAULT 'unknown' NOT NULL,
	"is_grad_scheme" boolean DEFAULT false NOT NULL,
	"discipline" "discipline" DEFAULT 'unknown' NOT NULL,
	"sub_discipline" text,
	"is_hardware_ai" boolean DEFAULT false NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_period" text,
	"visa_feasible_uk" "visa_feasibility" DEFAULT 'unknown' NOT NULL,
	"visa_feasible_sg" "visa_feasibility" DEFAULT 'unknown' NOT NULL,
	"visa_reason" text,
	"description_raw" text,
	"description_summary" text,
	"posted_at" timestamp,
	"closes_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"stage" "stage" DEFAULT 'inbox' NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"dedupe_key" text NOT NULL,
	"duplicate_of" uuid,
	"raw" jsonb
);

CREATE TABLE IF NOT EXISTS "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "soc_going_rates" (
	"soc_code" text PRIMARY KEY NOT NULL,
	"occupation" text NOT NULL,
	"going_rate" integer NOT NULL,
	"new_entrant_rate" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetch_via" "fetch_via" DEFAULT 'http' NOT NULL,
	"market" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"cadence_days" integer DEFAULT 7 NOT NULL,
	"company_id" uuid,
	"last_run_at" timestamp,
	"last_status" "crawl_status",
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_url" text NOT NULL,
	"note" text,
	"submitted_by_email" text,
	"submitter_label" text,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "uk_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalised_name" text NOT NULL,
	"town" text,
	"county" text,
	"rating" text,
	"routes" text[],
	"imported_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"role" "user_role" DEFAULT 'contributor' NOT NULL
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);

CREATE TABLE IF NOT EXISTS "visa_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" text NOT NULL,
	"variant" text DEFAULT 'standard' NOT NULL,
	"effective_from" timestamp NOT NULL,
	"min_salary" integer NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"notes" text
);

DO $$ BEGIN
  ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "job_sightings" ADD CONSTRAINT "job_sightings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "job_sightings" ADD CONSTRAINT "job_sightings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "job_tags" ADD CONSTRAINT "job_tags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_idx" ON "companies" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "crawl_runs_started_idx" ON "crawl_runs" USING btree ("started_at");
CREATE INDEX IF NOT EXISTS "enrichments_hash_idx" ON "enrichments" USING btree ("content_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "filter_keywords_unique" ON "filter_keywords" USING btree ("keyword","field");
CREATE INDEX IF NOT EXISTS "job_events_job_idx" ON "job_events" USING btree ("job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "job_sightings_unique" ON "job_sightings" USING btree ("job_id","url");
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_url_hash_idx" ON "jobs" USING btree ("url_hash");
CREATE INDEX IF NOT EXISTS "jobs_dedupe_key_idx" ON "jobs" USING btree ("dedupe_key");
CREATE INDEX IF NOT EXISTS "jobs_stage_idx" ON "jobs" USING btree ("stage");
CREATE INDEX IF NOT EXISTS "jobs_starred_idx" ON "jobs" USING btree ("is_starred");
CREATE INDEX IF NOT EXISTS "jobs_country_idx" ON "jobs" USING btree ("country");
CREATE INDEX IF NOT EXISTS "jobs_discipline_idx" ON "jobs" USING btree ("discipline");
CREATE INDEX IF NOT EXISTS "jobs_first_seen_idx" ON "jobs" USING btree ("first_seen_at");
CREATE INDEX IF NOT EXISTS "sources_enabled_idx" ON "sources" USING btree ("enabled","tier");
CREATE INDEX IF NOT EXISTS "submissions_status_idx" ON "submissions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "uk_sponsors_normalised_idx" ON "uk_sponsors" USING btree ("normalised_name");
CREATE INDEX IF NOT EXISTS "visa_thresholds_market_idx" ON "visa_thresholds" USING btree ("market","effective_from");

-- ============================================================
--  2. Visa thresholds
--     Date-aware because Singapore's EP floor rises on 1 Jan 2027.
-- ============================================================

INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'GB', 'new_entrant', '2025-04-09'::timestamp, 33400, 'GBP', 'year', 'Skilled Worker new entrant floor, or 70% of the going rate if higher'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'GB' AND variant = 'new_entrant'
    AND effective_from = '2025-04-09'::timestamp
);
INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'GB', 'standard', '2025-04-09'::timestamp, 41700, 'GBP', 'year', 'Skilled Worker standard floor'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'GB' AND variant = 'standard'
    AND effective_from = '2025-04-09'::timestamp
);
INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'SG', 'ep_standard', '2025-01-01'::timestamp, 5600, 'SGD', 'month', 'EP minimum qualifying salary, youngest bracket, non-financial'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'SG' AND variant = 'ep_standard'
    AND effective_from = '2025-01-01'::timestamp
);
INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'SG', 'ep_standard', '2027-01-01'::timestamp, 6000, 'SGD', 'month', 'Increase applying to new EP applications from 1 Jan 2027'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'SG' AND variant = 'ep_standard'
    AND effective_from = '2027-01-01'::timestamp
);
INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'SG', 'ep_financial', '2025-01-01'::timestamp, 6200, 'SGD', 'month', 'EP minimum for financial services'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'SG' AND variant = 'ep_financial'
    AND effective_from = '2025-01-01'::timestamp
);
INSERT INTO visa_thresholds (market, variant, effective_from, min_salary, currency, period, notes)
SELECT 'SG', 'ep_financial', '2027-01-01'::timestamp, 6600, 'SGD', 'month', 'Financial services increase from 1 Jan 2027'
WHERE NOT EXISTS (
  SELECT 1 FROM visa_thresholds
  WHERE market = 'SG' AND variant = 'ep_financial'
    AND effective_from = '2027-01-01'::timestamp
);

-- ============================================================
--  3. Negative keywords
--     "electrical" and "AI" are extremely noisy queries; without these the
--     inbox fills with electricians and data-annotation gigs.
-- ============================================================

INSERT INTO filter_keywords (keyword, kind, field) VALUES
  ('electrician', 'negative', 'title'),
  ('electrical technician', 'negative', 'title'),
  ('electrical installer', 'negative', 'title'),
  ('electrical installation', 'negative', 'title'),
  ('apprentice electrician', 'negative', 'title'),
  ('maintenance electrician', 'negative', 'title'),
  ('industrial electrician', 'negative', 'title'),
  ('auto electrician', 'negative', 'title'),
  ('electrical fitter', 'negative', 'title'),
  ('electrical mate', 'negative', 'title'),
  ('electrical labourer', 'negative', 'title'),
  ('cable puller', 'negative', 'title'),
  ('cable jointer', 'negative', 'title'),
  ('panel wirer', 'negative', 'title'),
  ('panel wiring', 'negative', 'title'),
  ('electrical estimator', 'negative', 'title'),
  ('electrical supervisor', 'negative', 'title'),
  ('site supervisor', 'negative', 'title'),
  ('field service technician', 'negative', 'title'),
  ('hvac', 'negative', 'title'),
  ('plumbing', 'negative', 'title'),
  ('solar installer', 'negative', 'title'),
  ('pat testing', 'negative', 'title'),
  ('domestic installer', 'negative', 'title'),
  ('sales engineer', 'negative', 'title'),
  ('technical sales', 'negative', 'title'),
  ('business development', 'negative', 'title'),
  ('account executive', 'negative', 'title'),
  ('recruiter', 'negative', 'title'),
  ('recruitment consultant', 'negative', 'title'),
  ('talent acquisition', 'negative', 'title'),
  ('ai trainer', 'negative', 'title'),
  ('ai tutor', 'negative', 'title'),
  ('data annotator', 'negative', 'title'),
  ('data annotation', 'negative', 'title'),
  ('data labeler', 'negative', 'title'),
  ('data labeller', 'negative', 'title'),
  ('image annotation', 'negative', 'title'),
  ('prompt writer', 'negative', 'title'),
  ('content writer', 'negative', 'title'),
  ('survey taker', 'negative', 'title'),
  ('freelance writer', 'negative', 'title')
ON CONFLICT (keyword, field) DO NOTHING;

-- ============================================================
--  4. Allowlist
--     Only these email addresses can sign in. Add friends with:
--       INSERT INTO allowlist (email, role, label)
--       VALUES ('friend@example.com', 'contributor', 'Sam')
--       ON CONFLICT DO NOTHING;
-- ============================================================

INSERT INTO allowlist (email, role, label)
VALUES ('you@example.com', 'owner', 'Owner')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
--  5. Target companies
--     Seeded for the electrical x AI overlap in the three markets. Their job
--     boards get resolved later by scripts/detect-ats.ts.
-- ============================================================

INSERT INTO companies (name, slug, hq_country, is_target) VALUES
  ('Tenstorrent', 'tenstorrent', 'CA', true),
  ('Untether AI', 'untether-ai', 'CA', true),
  ('Blumind', 'blumind', 'CA', true),
  ('Cohere', 'cohere', 'CA', true),
  ('Waabi', 'waabi', 'CA', true),
  ('Ciena', 'ciena', 'CA', true),
  ('Ranovus', 'ranovus', 'CA', true),
  ('BlackBerry QNX', 'blackberry-qnx', 'CA', true),
  ('Telesat', 'telesat', 'CA', true),
  ('MDA Space', 'mda-space', 'CA', true),
  ('GlobalFoundries', 'globalfoundries', 'SG', true),
  ('Micron', 'micron', 'SG', true),
  ('Infineon Technologies', 'infineon-technologies', 'SG', true),
  ('STMicroelectronics', 'stmicroelectronics', 'SG', true),
  ('Marvell', 'marvell', 'SG', true),
  ('Applied Materials', 'applied-materials', 'SG', true),
  ('Lam Research', 'lam-research', 'SG', true),
  ('ASM International', 'asm-international', 'SG', true),
  ('Grab', 'grab', 'SG', true),
  ('Sea', 'sea', 'SG', true),
  ('Arm', 'arm', 'GB', true),
  ('Graphcore', 'graphcore', 'GB', true),
  ('Imagination Technologies', 'imagination-technologies', 'GB', true),
  ('Alphawave Semi', 'alphawave-semi', 'GB', true),
  ('Wayve', 'wayve', 'GB', true),
  ('Synthesia', 'synthesia', 'GB', true),
  ('ElevenLabs', 'elevenlabs', 'GB', true),
  ('Quantinuum', 'quantinuum', 'GB', true),
  ('Oxford Instruments', 'oxford-instruments', 'GB', true),
  ('Cambridge Consultants', 'cambridge-consultants', 'GB', true),
  ('Nordic Semiconductor', 'nordic-semiconductor', 'GB', true),
  ('XMOS', 'xmos', 'GB', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
--  6. Saved searches (76 sources)
--     Split evenly between electrical and AI across all three markets.
-- ============================================================

INSERT INTO sources (kind, tier, provider, label, market, cadence_days, config)
SELECT v.kind::source_kind, v.tier, v.provider, v.label, v.market, v.cadence_days, v.config
FROM (VALUES
  ('search', 1, 'adzuna', 'Adzuna UK: electrical engineer', 'GB', 7, '{"what":"electrical engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: electronics engineer', 'GB', 7, '{"what":"electronics engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: hardware engineer', 'GB', 7, '{"what":"hardware engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: FPGA engineer', 'GB', 7, '{"what":"FPGA engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: ASIC design engineer', 'GB', 7, '{"what":"ASIC design engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: RTL design', 'GB', 7, '{"what":"RTL design","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: embedded software engineer', 'GB', 7, '{"what":"embedded software engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: power electronics engineer', 'GB', 7, '{"what":"power electronics engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: semiconductor process engineer', 'GB', 7, '{"what":"semiconductor process engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: machine learning engineer', 'GB', 7, '{"what":"machine learning engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: AI engineer', 'GB', 7, '{"what":"AI engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: computer vision engineer', 'GB', 7, '{"what":"computer vision engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: deep learning engineer', 'GB', 7, '{"what":"deep learning engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: MLOps engineer', 'GB', 7, '{"what":"MLOps engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: machine learning research engineer', 'GB', 7, '{"what":"machine learning research engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: data scientist', 'GB', 7, '{"what":"data scientist","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: AI accelerator engineer', 'GB', 7, '{"what":"AI accelerator engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna UK: ML compiler engineer', 'GB', 7, '{"what":"ML compiler engineer","where":"London","market":"GB","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: electrical engineer', 'CA', 7, '{"what":"electrical engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: electronics engineer', 'CA', 7, '{"what":"electronics engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: hardware engineer', 'CA', 7, '{"what":"hardware engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: FPGA engineer', 'CA', 7, '{"what":"FPGA engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: ASIC design engineer', 'CA', 7, '{"what":"ASIC design engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: RTL design', 'CA', 7, '{"what":"RTL design","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: embedded software engineer', 'CA', 7, '{"what":"embedded software engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: power electronics engineer', 'CA', 7, '{"what":"power electronics engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: semiconductor process engineer', 'CA', 7, '{"what":"semiconductor process engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: machine learning engineer', 'CA', 7, '{"what":"machine learning engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: AI engineer', 'CA', 7, '{"what":"AI engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: computer vision engineer', 'CA', 7, '{"what":"computer vision engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: deep learning engineer', 'CA', 7, '{"what":"deep learning engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: MLOps engineer', 'CA', 7, '{"what":"MLOps engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: machine learning research engineer', 'CA', 7, '{"what":"machine learning research engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: data scientist', 'CA', 7, '{"what":"data scientist","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: AI accelerator engineer', 'CA', 7, '{"what":"AI accelerator engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Canada: ML compiler engineer', 'CA', 7, '{"what":"ML compiler engineer","where":"Canada","market":"CA","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: electrical engineer', 'SG', 7, '{"what":"electrical engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: electronics engineer', 'SG', 7, '{"what":"electronics engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: hardware engineer', 'SG', 7, '{"what":"hardware engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: FPGA engineer', 'SG', 7, '{"what":"FPGA engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: ASIC design engineer', 'SG', 7, '{"what":"ASIC design engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: RTL design', 'SG', 7, '{"what":"RTL design","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: embedded software engineer', 'SG', 7, '{"what":"embedded software engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: power electronics engineer', 'SG', 7, '{"what":"power electronics engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: semiconductor process engineer', 'SG', 7, '{"what":"semiconductor process engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: machine learning engineer', 'SG', 7, '{"what":"machine learning engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: AI engineer', 'SG', 7, '{"what":"AI engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: computer vision engineer', 'SG', 7, '{"what":"computer vision engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: deep learning engineer', 'SG', 7, '{"what":"deep learning engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: MLOps engineer', 'SG', 7, '{"what":"MLOps engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: machine learning research engineer', 'SG', 7, '{"what":"machine learning research engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: data scientist', 'SG', 7, '{"what":"data scientist","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: AI accelerator engineer', 'SG', 7, '{"what":"AI accelerator engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'adzuna', 'Adzuna Singapore: ML compiler engineer', 'SG', 7, '{"what":"ML compiler engineer","where":"Singapore","market":"SG","maxDaysOld":14}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: electrical engineer', 'GB', 7, '{"keywords":"electrical engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: electronics engineer', 'GB', 7, '{"keywords":"electronics engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: hardware engineer', 'GB', 7, '{"keywords":"hardware engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: FPGA engineer', 'GB', 7, '{"keywords":"FPGA engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: ASIC design engineer', 'GB', 7, '{"keywords":"ASIC design engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: RTL design', 'GB', 7, '{"keywords":"RTL design","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: embedded software engineer', 'GB', 7, '{"keywords":"embedded software engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: power electronics engineer', 'GB', 7, '{"keywords":"power electronics engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: semiconductor process engineer', 'GB', 7, '{"keywords":"semiconductor process engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: machine learning engineer', 'GB', 7, '{"keywords":"machine learning engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: AI engineer', 'GB', 7, '{"keywords":"AI engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: computer vision engineer', 'GB', 7, '{"keywords":"computer vision engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: deep learning engineer', 'GB', 7, '{"keywords":"deep learning engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: MLOps engineer', 'GB', 7, '{"keywords":"MLOps engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: machine learning research engineer', 'GB', 7, '{"keywords":"machine learning research engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: data scientist', 'GB', 7, '{"keywords":"data scientist","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: AI accelerator engineer', 'GB', 7, '{"keywords":"AI accelerator engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'reed', 'Reed UK: ML compiler engineer', 'GB', 7, '{"keywords":"ML compiler engineer","locationName":"London","distanceFromLocation":30}'::jsonb),
  ('search', 1, 'ai-jobs', 'ai-jobs.net (CA/SG/UK)', NULL, 1, '{"markets":["CA","SG","GB"]}'::jsonb),
  ('search', 2, 'mycareersfuture', 'MyCareersFuture: engineer', 'SG', 7, '{"search":"engineer","limit":100,"pages":2}'::jsonb),
  ('search', 2, 'mycareersfuture', 'MyCareersFuture: machine learning', 'SG', 7, '{"search":"machine learning","limit":100,"pages":2}'::jsonb),
  ('search', 2, 'mycareersfuture', 'MyCareersFuture: semiconductor', 'SG', 7, '{"search":"semiconductor","limit":100,"pages":2}'::jsonb)
) AS v(kind, tier, provider, label, market, cadence_days, config)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.label = v.label);

-- ============================================================
--  Done.
-- ============================================================
--
-- Check it worked:
--   SELECT count(*) FROM sources;          -- expect 76
--   SELECT count(*) FROM companies;        -- expect 32
--   SELECT count(*) FROM filter_keywords;  -- expect 42
--   SELECT email, role FROM allowlist;     -- your address, as owner

