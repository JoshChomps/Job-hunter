# Status and what's left

Where the project actually stands, what still needs doing, and what is designed
but not yet built. Kept honest, things listed as missing are genuinely missing.

---

## 1. Why sign-in still fails

Two causes, and the error you see tells you which.

**If you see the app's own page, "That account isn't on the allowlist":**
Google worked. You reached the app and the allowlist check refused you. Either
`OWNER_EMAIL` isn't set, or it's set but **the deployment hasn't been rebuilt
since you set it**.

> **Vercel does not redeploy when you change an environment variable.** The
> running deployment keeps the values it was built with. This catches everyone
> once. Go to Deployments → ⋯ on the latest → **Redeploy**.

Also check the address matches the Google account you're actually signing in
with. The Vercel function logs now name the rejected address explicitly
Deployments → latest → Functions → look for `[auth] sign-in refused`.

**If you see a Google error before reaching the app** (`redirect_uri_mismatch`,
"Access blocked", "app not verified"): the problem is in Google Cloud Console,
not here.

| Google error | Fix |
|---|---|
| `redirect_uri_mismatch` | Authorised redirect URI must be exactly `https://YOUR-APP.vercel.app/api/auth/callback/google`, no trailing slash, https not http |
| "Access blocked: not completed verification" | OAuth consent screen → Audience → **Test users** → add your own address |
| Redirect loop back to sign-in | `AUTH_URL` missing or wrong, set it to your full production URL |

### How long deploys take

| Trigger | Applies when | Time |
|---|---|---|
| Git push | Automatically | ~1-3 min |
| Environment variable change | **Only after a manual redeploy** | ~1-3 min |
| Database change (allowlist rows, jobs) | Immediately, no deploy | instant |

The `OWNER_EMAIL` feature landed in commit `0039bad`. If your last deploy is
older than that, redeploy regardless of anything else.

---

## 2. Getting it locally

The default branch holds everything, so a plain clone is enough.

```bash
git clone https://github.com/JoshChomps/Job-hunter.git
cd Job-hunter
pnpm install          # or: npm install
```

Requires **Node 22+** and pnpm (`npm i -g pnpm`).

Pull the environment values already in Vercel rather than retyping them:

```bash
npx vercel login
npx vercel link            # select the job-hunter project
npx vercel env pull .env.local
```

Confirm the checkout is sound before touching anything else:

```bash
pnpm verify               # 35 logic assertions, then 21 LLM-client assertions
```

Both suites run offline, no database, no API keys, no model needed.

---

## 3. Every key, what it does, and what breaks without it

### Required

| Variable | Where from | Without it |
|---|---|---|
| `DATABASE_URL` | Neon → Connect → **pooled** string | Build fails |
| `AUTH_SECRET` | `npx auth secret` | Sessions broken |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | console.cloud.google.com → Credentials → OAuth client ID (Web) | Nobody can sign in |
| `AUTH_URL` | Your full `https://…vercel.app` URL | Sign-in redirect loop in production |
| `OWNER_EMAIL` | Your Google address | Locked out of your own app |

### Optional: each unlocks one thing

| Variable | Where from | Cost | Unlocks |
|---|---|---|---|
| `FIRECRAWL_API_KEY` | firecrawl.dev | $16/mo Hobby | Reading pasted links, career pages, Workday |
| `SUBMIT_TOKEN` | Invent any long random string | free | The no-account submit page for friends |
| `ANTHROPIC_API_KEY` | console.anthropic.com | ~$2-5/mo | Descriptions, sorting, fit scores **in the cloud** |
| `LLM_PROVIDER=ollama` | - | free | Same, but on your machine only |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | developer.adzuna.com | free | All three markets, ~1,000 calls/mo |
| `REED_API_KEY` | reed.co.uk/developers | free | Best UK coverage |
| `JOOBLE_API_KEY` | jooble.org/api/about | free | Extra coverage, **human-reviewed, apply early** |
| `CAREERJET_AFFID` | careerjet partner programme | free | Extra coverage |
| `CRAWL_SECRET` | Invent one | free | Triggering crawls from outside the app |

**No key at all:** ai-jobs.net, MyCareersFuture, and every Greenhouse / Lever /
Ashby / Workable board. Those work the moment you crawl.

Where each one goes, Vercel, GitHub Actions secrets, or `.env.local`, is in
[DEPLOY.md](DEPLOY.md#where-each-secret-actually-lives).

---

## 4. What's left to do

### Blocking: nothing works properly until these are done

1. **Redeploy after setting `OWNER_EMAIL`** (§1). Sign in. Everything else
   depends on being able to see the app.
2. **Copy `config/profile.example.md` to `config/profile.md` and fill it in.** Fit scoring reads that file. Left as
   placeholders, every score is noise. The skills and projects sections are what
   capability-based scoring actually keys on.

### High value: this is where the tool starts earning its keep

3. **Probe the adapters.** *None of the job-board adapters have ever met a live
   response*: the network in the session where they were written blocked every
   provider host. They're written from documentation and read through field
   aliases, so a changed field name looks like missing data, not an error.

   ```bash
   pnpm crawl --probe=adzuna
   pnpm crawl --probe=reed
   pnpm crawl --probe=mycareersfuture
   pnpm crawl --probe=ai-jobs
   ```

   Each prints the provider's raw payload beside the mapped result and writes
   nothing. Check `title`, `url`, `companyName`, `locationRaw` and salary are
   populated. **Expect one or two to need fixing.** MyCareersFuture is the most
   likely, since its endpoint is public but undocumented.

4. **Import the UK sponsor register.** This is gate one of UK feasibility and
   without it every UK job sits at `unknown`. Get the current dated CSV link from
   [gov.uk](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers):

   ```bash
   pnpm sponsors:import -- --url="https://www.gov.uk/csv-preview/.../SP_....csv"
   ```

5. **Resolve target companies to their boards**, then crawl:

   ```bash
   pnpm tsx scripts/detect-ats.ts
   pnpm crawl --force
   ```

6. **Set up the local model** so jobs get sorted and described:

   ```bash
   ollama pull qwen3:8b
   echo 'LLM_PROVIDER=ollama' >> .env.local
   pnpm llm:check
   pnpm crawl --enrich=50
   ```

### Then: makes it run itself

7. **GitHub Actions secrets** so the weekly crawl works: `DATABASE_URL`,
   `FIRECRAWL_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY`,
   `JOOBLE_API_KEY`. Then Actions → "Crawl jobs" → Run workflow to test it.
8. **Add Workday employers.** They can't be detected from a company name, the
   tenant and site are customer-specific. For each, grab the careers URL and:

   ```bash
   pnpm tsx scripts/detect-ats.ts --url="https://TENANT.wd5.myworkdayjobs.com/en-US/SITE" --name="Company"
   ```

   Worth doing for the semiconductor and defence employers, since those are the
   ones large enough to clear the visa salary thresholds.
9. **Tier 4** (LinkedIn/Indeed/Glassdoor) from your machine, on your residential
   IP: `pnpm crawl --tier=4`. Never works from CI, datacentre IPs are blocked.

---

## 5. What's designed but not built

Honest inventory of gaps. Some are deliberate deferrals, some are things the
plan promised and the build didn't deliver.

### Real gaps against the plan

| Gap | Consequence | Effort |
|---|---|---|
| **No retention pruning.** The plan calls for auto-pruning `inbox` jobs older than 90 days that were never actioned. Never built. | Neon's free tier is 0.5 GB. Descriptions are capped at 8 KB, so this is fine for months, but it will creep up. | Small |
| **SOC going rates are never populated.** The table and the "higher of £33,400 or 70% of the going rate" logic both exist, but nothing fills the table and `ukGoingRate` is never passed in. | The UK gate only applies the flat £33,400 floor. It under-rejects: a role needing a £60k going rate passes at £35k when it shouldn't. | Medium, needs the published SOC table imported |
| **`applications` table is never written or read.** | Applied/interview/offer stages work, but CV version, cover letter and applied-date per application aren't captured. | Medium |
| **`job_events` are written but never shown.** Stage changes and notes are recorded and invisible. | No history on the job detail page. | Small |
| **No pagination.** The list caps at 100 (300 starred). | Fine now; becomes a problem past a few hundred jobs. | Small |
| **Search is `ILIKE`, not full-text.** The plan specified Postgres `tsvector`. | Slower and less precise on descriptions. | Small |
| **No weekly digest email.** Planned for Phase 2. | You have to go and look. | Medium |

### Deliberately deferred (Phase 3 in the plan)

- **MCP server** exposing the tracker to Claude, "what have I applied to in
  Singapore this month?", adding jobs conversationally
- **Analytics**: response rate by source, market and discipline. This is the
  one that tells you which of the nine sources is actually worth keeping
- **Grad-scheme cycle tracking**: they open on fixed annual dates and missing
  the window costs a year
- **Stale-application nudges**
- **pgvector semantic dedupe**: current dedupe is exact URL plus fuzzy
  company/title/city, which handles the common case

### Testing gaps

- Pure logic is well covered: 35 assertions on the visa gate, sponsor matching,
  dedupe, salary parsing and filters; 21 on the LLM client against a stub.
- **Adapters have no tests against real responses**, by necessity, see §4.3.
- The Firecrawl client is untested against the live API.
- No end-to-end test of the crawl → enrich → UI path.

---

## 6. Where the architecture should grow next

In the order I'd actually do it:

1. **Verify and fix the adapters** (§4.3). Everything downstream is worthless if
   ingestion is silently returning nothing. This is the single highest-value
   thing left.
2. **Populate SOC going rates.** The UK gate currently under-rejects, and the UK
   is the market where the gate matters most. This makes the feature do what it
   claims.
3. **Analytics on source effectiveness.** After a month you'll have the data to
   answer "is Careerjet worth the API call?", and the crawl budget is finite
   (Adzuna is 1,000 calls/month).
4. **Retention pruning**, before the free tier bites rather than after.
5. **The digest email.** The system's weakness is that it's a pull model; a
   Monday email with the top ten by fit score turns it into push.
6. **MCP server.** Once there's real data, conversational access to it is
   genuinely useful and it's a small piece of work.

---

## 7. Quick reference

```bash
pnpm verify                        # logic tests, offline
pnpm llm:check                     # is the local model reachable and sane
pnpm crawl --probe=<provider>      # inspect an adapter, write nothing
pnpm crawl --force                 # crawl everything now
pnpm crawl --enrich=50             # crawl, then sort and describe
pnpm crawl --tier=4                # LinkedIn/Indeed, local only
pnpm allowlist                     # who can sign in
pnpm allowlist -- add x@y.com owner
pnpm sponsors:import -- --url=…    # UK sponsor register
pnpm tsx scripts/detect-ats.ts     # resolve company job boards
pnpm setup:sql                     # regenerate setup.sql after schema changes
pnpm dev                           # run locally
```
