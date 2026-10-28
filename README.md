# Job Hunter

A private job-search home base for **electrical engineering and AI roles** in
**Canada, Singapore and the UK**. Pulls postings from job boards, company ATS
feeds and hand-dropped links, normalises them into one database, and gives a
single UI to triage, filter and track applications through to offer.

Private by design: the owner plus a handful of invited contributors.

**→ [Status & what's left](docs/STATUS.md)** · [Architecture & plan](docs/PLAN.md) · [Deploying](docs/DEPLOY.md) · [Local model](docs/LLM.md)

## What it does

- **Aggregates** from Adzuna, Reed, Jooble, Careerjet, ai-jobs.net,
  MyCareersFuture, and any company's Greenhouse / Lever / Ashby / Workable /
  Workday board
- **Filters hard**: negative keywords before storage, then Claude
  classification, so "electrical" doesn't fill the inbox with electricians
- **Gates on work authorisation**: checks employers against the Home Office
  sponsor register and salaries against the UK new-entrant and Singapore EP
  thresholds, hiding roles that legally cannot sponsor you
- **Dedupes** the same role across boards into one card with every apply link
- **Scores fit** with Claude against your profile, judged on capability rather
  than the years-of-experience number
- **Takes pasted links** from you or a friend, Firecrawl reads the page,
  Claude turns it into fields

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 + TypeScript on Vercel |
| Database | Neon Postgres + Drizzle |
| Auth | Auth.js, Google sign-in + email allowlist |
| Ingestion | GitHub Actions cron, weekly, then daily |
| Scraping | Firecrawl: link parsing, career pages, Workday |
| Enrichment | Claude, a local model via Ollama, or both, see [docs/LLM.md](docs/LLM.md) |

Running cost: **~$16-20/month** (Firecrawl Hobby plus a few dollars of Claude).
Everything else is on free tiers.

## Setup

### 1. Database

Create a project at [neon.tech](https://neon.tech) and copy the **pooled**
connection string (it contains `-pooler`).

```bash
cp .env.example .env.local     # fill in DATABASE_URL, AUTH_*, OWNER_EMAIL
pnpm install
pnpm db:migrate
pnpm seed
```

`seed` loads the visa thresholds, negative keywords, ~32 target companies and
~60 saved searches across the three markets.

### 2. Google sign-in

Create an OAuth client at
[console.cloud.google.com](https://console.cloud.google.com) → Credentials →
OAuth client ID (Web application), with redirect URIs:

- `http://localhost:3000/api/auth/callback/google`
- `https://YOUR-DOMAIN/api/auth/callback/google`

Only allowlisted emails can sign in. Set **`OWNER_EMAIL`** to your own address
it is always allowed, so a fresh deployment can never lock you out, then invite
everyone else from the **People** page in the app.

### 3. Job board keys (all free, all optional)

| Provider | Where | Notes |
|---|---|---|
| Adzuna | [developer.adzuna.com](https://developer.adzuna.com) | Covers all three markets |
| Reed | [reed.co.uk/developers](https://www.reed.co.uk/developers) | Deepest UK inventory |
| Jooble | [jooble.org/api/about](https://jooble.org/api/about) | Human-reviewed, start early |
| Careerjet | Partner programme | Optional |

ai-jobs.net, MyCareersFuture and every ATS board need no key at all.

### 4. UK sponsor register

Gate one of UK feasibility. Grab the current CSV link from
[gov.uk](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers)
(it's republished monthly at a dated URL) and run:

```bash
pnpm sponsors:import -- --url="https://www.gov.uk/csv-preview/.../SP_...csv"
```

This also re-resolves every company and recomputes the UK gate, so a newly
licensed employer stops being hidden without waiting for a re-crawl. There's a
`workflow_dispatch` GitHub Action for the same thing.

### 5. First crawl

```bash
pnpm tsx scripts/detect-ats.ts   # resolve target companies to their job boards
pnpm crawl --force --enrich=50   # crawl everything, then score it
pnpm dev
```

## Commands

```bash
pnpm dev                        # local app
pnpm verify                     # logic tests, visa gate, dedupe, filters, LLM client
pnpm llm:check                  # verify the local model is reachable and schema-valid
pnpm setup:sql                  # regenerate setup.sql after a schema change
pnpm crawl                      # run sources that are due
pnpm crawl --force              # ignore cadence
pnpm crawl --tier=4             # LinkedIn/Indeed, local machine only
pnpm crawl --provider=reed      # one provider
pnpm crawl --enrich=50          # Claude pass afterwards
pnpm crawl --probe=adzuna       # inspect an adapter's output, write nothing
pnpm sponsors:import -- --url=  # refresh the UK sponsor register
pnpm db:migrate                 # apply migrations
```

### `--probe` matters

Several providers publish no versioned contract, the ATS board endpoints and
MyCareersFuture are public but undocumented. `--probe` fetches one page, prints
the provider payload next to the mapped result and writes nothing, so a renamed
field shows up immediately instead of silently producing empty rows.

**Run it once per provider on first setup.** The adapters read through field
aliases and degrade to `undefined` rather than throwing, so a changed shape
looks like missing data, not an error.

## Deploying

**→ [Full deployment guide](docs/DEPLOY.md)**

Secrets never go in the repo, not even a private one. Vercel stores them in its
own project settings and injects them at build and runtime; GitHub Actions reads
its own repository secrets. `.env.example` documents the shape with empty
values, which is the only env file that gets committed.

Short version: import the repo in Vercel and set the environment variables
there, add the same crawler keys as GitHub Actions repository secrets, run
`pnpm db:migrate` from your machine, and add the production redirect URI to your
Google OAuth client.

The crawl runs Mondays at 06:00 UTC. Change the cron in
`.github/workflows/crawl.yml` to go daily, GitHub Actions has no frequency cap,
which is why the schedule lives there rather than in Vercel cron.

## The Tier 4 problem

LinkedIn, Indeed and Glassdoor sit behind Cloudflare bot management and block
datacentre IPs: which is what GitHub Actions and Vercel both run on. No amount
of code fixes that.

So those sources run from **your machine**, on your residential IP:

```bash
pnpm crawl --tier=4
```

Same binary, same database, same pipeline. Schedule it with cron or launchd if
you want it unattended. Everything else runs fine in CI.

## Sharing the submit link

Set `SUBMIT_TOKEN` to any long random string and share:

```
https://YOUR-DOMAIN/submit?token=YOUR_TOKEN
```

Friends paste a job link with no account needed. It's write-only, it never
returns tracker data, so a leaked token can add noise but can't read anything.
