# Deploying

## Secrets never go in the repo

Vercel stores environment variables in **its own project settings** and injects
them at build and runtime. It reads them from Vercel, never from your
repository: so nothing secret needs to be committed, and `.env` /`.env.local`
stay gitignored.

A private repo is not a safe place for keys anyway:

- **Private isn't secret.** Every collaborator you add gets every key. If you
  ever add a friend so they can contribute, you've handed them your database
  credentials.
- **Git history is permanent.** Rotating a leaked key doesn't remove it, the
  old value stays in history forever unless you rewrite it.
- **One slip is irreversible.** Making the repo public, forking it, or cloning
  it onto a shared machine exposes everything at once.
- **You lose per-environment values.** Production, preview and local
  development want different databases and different OAuth callbacks. A
  committed file can only hold one set.

`.env.example` *is* committed: it documents which variables exist, with empty
values. That's the pattern: commit the shape, never the contents.

## Where each secret actually lives

This project has three runtimes, so secrets get entered in up to three places.
That duplication is normal and correct.

| Variable | Vercel | GitHub Actions | Local `.env.local` |
|---|:--:|:--:|:--:|
| `DATABASE_URL` | ● | ● | ● |
| `AUTH_SECRET` | ● | - | ● |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ● | - | ● |
| `AUTH_URL` (production domain) | ● | - | - |
| `SUBMIT_TOKEN` | ● | - | ● |
| `ANTHROPIC_API_KEY` | ● | ● | ● |
| `FIRECRAWL_API_KEY` | ● | ● | ● |
| `ADZUNA_*`, `REED_API_KEY`, `JOOBLE_API_KEY`, `CAREERJET_AFFID` | ○ | ● | ● |
| `CRAWL_SECRET` | ○ | - | - |
| `OWNER_EMAIL` | ● | - | ● |

● required ○ optional, needed on Vercel only if you use the "crawl now"
route; the scheduled crawl runs in Actions

**Why the split:** Vercel runs the web app (sign-in, paste-a-link, browsing).
GitHub Actions runs the scheduled crawl and has no web server, so it needs no
auth variables. Your machine runs migrations, seeding, the sponsor import and
the Tier 4 crawler, so it needs everything.

### Setting them

**Vercel**: Project → Settings → Environment Variables. Or:

```bash
vercel env add DATABASE_URL production
```

**GitHub Actions**: Repository → Settings → Secrets and variables → Actions →
New repository secret. The names must match `.github/workflows/crawl.yml`
exactly.

**Locally**: `cp .env.example .env.local` and fill it in. Once Vercel is set
up you can sync down instead of maintaining it by hand:

```bash
vercel env pull .env.local
```

That pulls the current values into your gitignored file, so Vercel becomes the
single source of truth and you only maintain two places instead of three.

## Region: use `aws-us-east-1`

Pinned in `vercel.json` as `iad1`, and the Neon project should be created in
**AWS US East (N. Virginia)** to match.

What matters is the latency between Vercel's functions and the database, not
between you and the database. Each page render runs several sequential queries
session, allowlist, jobs, stats, and every one pays that round trip, while the
browser pays a single hop to Vercel regardless. Co-locating them keeps it in
single-digit milliseconds.

Neon offers no Canadian region, so proximity to home isn't an option. Singapore
is the wrong choice despite being a target market: where data is *about* has
nothing to do with where it's *stored*, and it would add ~230 ms to every query,
hurting the crawler worst of all since GitHub Actions runners are in US East and
a crawl does thousands of inserts.

**Choose carefully: a Neon project cannot change region.** Moving means
creating a new project and migrating the data by hand.

## Neon Auth: leave it off

Neon Auth exists to sync users from an external auth provider into Postgres so
you can JOIN against them. The Auth.js Drizzle adapter already writes `user`,
`account` and `session` straight into the `public` schema, so that benefit is
already in place here.

Enabling it would mean replacing `src/auth.ts`, reimplementing the allowlist
gate that makes this app private, and changing every page's session check, to
arrive at what already works. It would be the right choice on a greenfield
project with no auth written yet; it isn't one now.

If it's already enabled, it's harmless: it lives in its own `neon_auth` schema
and won't collide with migrations, which only touch `public`.

## Setting up without a terminal

`setup.sql` in the repo root contains the entire schema plus all seed data in
one file. Paste it into the **Neon SQL Editor** and run it once, that replaces
`pnpm db:migrate && pnpm seed` completely, so the database can be set up from a
phone or any browser.

It is safe to run more than once: tables and types are created only if absent,
and every insert is conflict-guarded, so a half-finished paste can simply be
re-run. Verified against Postgres 16, three consecutive runs, no errors and no
duplicate rows.

It ends with a few `SELECT count(*)` queries to confirm the expected 76 sources,
32 companies and 42 keywords landed.

**Regenerate it after any schema or seed change**, or the two paths drift:

```bash
pnpm setup:sql -- --owner=you@example.com
```

## Getting in the first time

Set **`OWNER_EMAIL`** in the Vercel environment variables to the Google address
you'll sign in with, and redeploy. That address is always allowed, whether or
not a database row exists, and a row is created on first sign-in so it shows up
alongside everyone else.

This exists so the app can never lock you out of itself. Managing the allowlist
purely through SQL means needing a terminal or the SQL console to get in, which
is not always to hand; an environment variable can be set from the Vercel
dashboard on a phone.

After that, invite people from the **People** page in the app, no SQL, no CLI.
`pnpm allowlist` still works from a terminal if you prefer it.

## Steps

1. **Create the Neon database** in `aws-us-east-1` and copy the **pooled**
   connection string (it contains `-pooler`). The non-pooled one will exhaust
   connections under serverless.

2. **Apply migrations from your machine**, Vercel does not run them:

   ```bash
   pnpm db:migrate
   pnpm seed
   ```

3. **Import the repo in Vercel** and set the environment variables above.

4. **Add the GitHub Actions secrets** so the weekly crawl can run.

5. **Update the Google OAuth client** with the production redirect URI:
   `https://YOUR-DOMAIN/api/auth/callback/google`

6. **Deploy**, sign in, and trigger the crawl workflow manually the first time
   to confirm it works end to end.

## Gotchas worth knowing before they bite

**Set variables for Preview as well as Production.** The database client throws
on a missing `DATABASE_URL` at import time, deliberately, so a
misconfiguration fails loudly instead of silently returning no jobs. The side
effect is that a preview deployment without the variable fails at build. Tick
all three environments when adding each variable, or point Preview at a
separate Neon branch.

**Set `AUTH_URL` to your production URL.** Auth.js infers the callback URL from
the request. Behind Vercel's proxy on a custom domain, that inference can
produce the wrong host and Google will reject the callback. Setting it
explicitly avoids a confusing sign-in loop.

**Migrations are manual.** There's no migration step in the build, on purpose
a failed migration mid-deploy is far worse than a deploy that needs one extra
command. After changing the schema: `pnpm db:generate` then `pnpm db:migrate`.

**The scheduled crawl does not run on Vercel.** Vercel's Hobby plan caps cron
at one run per day and functions well below what a multi-source crawl needs, so
GitHub Actions owns the schedule. `POST /api/crawl` on Vercel is only for
"go and look now" from the UI.

**Tier 4 never runs in the cloud.** LinkedIn, Indeed and Glassdoor block the
datacentre IPs that both Vercel and GitHub Actions run on. Those run from your
machine with `pnpm crawl --tier=4`, which is why your local `.env.local` needs
the full set of keys.

## If a key does leak

Rotate at the provider first, then update Vercel, GitHub secrets and your local
file. Removing it from git history is secondary, a key that's been pushed
should be treated as burned regardless of whether you rewrite history.
