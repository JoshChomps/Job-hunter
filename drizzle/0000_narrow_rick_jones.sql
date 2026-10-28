CREATE TYPE "public"."ats_type" AS ENUM('greenhouse', 'lever', 'ashby', 'workable', 'workday', 'none', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('running', 'ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."discipline" AS ENUM('electrical', 'ai', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fetch_via" AS ENUM('http', 'firecrawl', 'firecrawl_stealth');--> statement-breakpoint
CREATE TYPE "public"."remote_type" AS ENUM('onsite', 'hybrid', 'remote', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('intern', 'new_grad', 'early', 'mid', 'senior', 'staff', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('job', 'search', 'company');--> statement-breakpoint
CREATE TYPE "public"."sponsorship_signal" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('inbox', 'shortlist', 'applied', 'interview', 'offer', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'parsed', 'failed', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."visa_feasibility" AS ENUM('yes', 'no', 'unknown', 'threshold_risk');--> statement-breakpoint
CREATE TABLE "account" (
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
--> statement-breakpoint
CREATE TABLE "allowlist" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'contributor' NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applied_at" timestamp,
	"cv_version" text,
	"cover_letter_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
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
--> statement-breakpoint
CREATE TABLE "crawl_runs" (
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
--> statement-breakpoint
CREATE TABLE "enrichments" (
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
--> statement-breakpoint
CREATE TABLE "filter_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"kind" text DEFAULT 'negative' NOT NULL,
	"field" text DEFAULT 'title' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"actor_email" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source_id" uuid,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_tags" (
	"job_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "job_tags_job_id_tag_pk" PRIMARY KEY("job_id","tag")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
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
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soc_going_rates" (
	"soc_code" text PRIMARY KEY NOT NULL,
	"occupation" text NOT NULL,
	"going_rate" integer NOT NULL,
	"new_entrant_rate" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
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
--> statement-breakpoint
CREATE TABLE "submissions" (
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
--> statement-breakpoint
CREATE TABLE "uk_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalised_name" text NOT NULL,
	"town" text,
	"county" text,
	"rating" text,
	"routes" text[],
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"role" "user_role" DEFAULT 'contributor' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "visa_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" text NOT NULL,
	"variant" text DEFAULT 'standard' NOT NULL,
	"effective_from" timestamp NOT NULL,
	"min_salary" integer NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sightings" ADD CONSTRAINT "job_sightings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sightings" ADD CONSTRAINT "job_sightings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tags" ADD CONSTRAINT "job_tags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "crawl_runs_started_idx" ON "crawl_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "enrichments_hash_idx" ON "enrichments" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "filter_keywords_unique" ON "filter_keywords" USING btree ("keyword","field");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_sightings_unique" ON "job_sightings" USING btree ("job_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_url_hash_idx" ON "jobs" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "jobs_dedupe_key_idx" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_stage_idx" ON "jobs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "jobs_starred_idx" ON "jobs" USING btree ("is_starred");--> statement-breakpoint
CREATE INDEX "jobs_country_idx" ON "jobs" USING btree ("country");--> statement-breakpoint
CREATE INDEX "jobs_discipline_idx" ON "jobs" USING btree ("discipline");--> statement-breakpoint
CREATE INDEX "jobs_first_seen_idx" ON "jobs" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled","tier");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "uk_sponsors_normalised_idx" ON "uk_sponsors" USING btree ("normalised_name");--> statement-breakpoint
CREATE INDEX "visa_thresholds_market_idx" ON "visa_thresholds" USING btree ("market","effective_from");