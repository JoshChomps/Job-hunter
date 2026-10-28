# Running a local model

The tracker already uses an LLM to identify each job, sort it into a discipline
and write a plain-language description. This document covers running that on
your own machine instead of through the Claude API.

## Where it can actually run

This matters more than the model choice, because two of the three places this
project executes cannot run a local model at all.

| Runtime | Local model? | Why |
|---|---|---|
| **Vercel** | No | No GPU, ephemeral functions, and a bundle-size limit far below any model weight |
| **GitHub Actions** | Technically | No GPU and ~7 GB RAM. A small model on CPU takes roughly 10-60 s per job, so a 200-job week is hours |
| **Your machine** | Yes | The only place with real hardware |

So a local model lives in the same slot as the Tier 4 crawler: **your machine,
run deliberately.** The scheduled weekly crawl in GitHub Actions should keep
using Claude, or skip enrichment and leave it for you to run locally.

That also means this is a *when you have your laptop* feature. It cannot be set
up or run from a phone.

## The three modes

Set `LLM_PROVIDER`:

| Mode | Parse & classify | Fit score & sponsorship | Cost |
|---|---|---|---|
| `anthropic` | Claude | Claude | a few $/month |
| `ollama` | local | local | $0 |
| `hybrid` | local | Claude | pennies |

**`hybrid` is the one worth understanding.** The work splits cleanly by stakes:

- **Mechanical, high volume**: reading a page into fields, assigning a
  discipline, writing a description. Hundreds of jobs a week. A small local
  model is genuinely fine at this.
- **Judgment, low volume**: reading a sponsorship statement out of prose, and
  scoring fit on capability rather than a years-of-experience number. This is
  what decides whether you spend a week chasing an impossible role, and it only
  runs on jobs that survived the filters.

Hybrid puts the volume on free local inference and keeps the consequential
calls on the stronger model. That's usually the right trade here.

## Setup

```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a model
ollama pull qwen3:8b

# 3. Point the tracker at it
echo 'LLM_PROVIDER=ollama' >> .env.local

# 4. Verify before trusting a run
pnpm llm:check
```

`llm:check` confirms Ollama is reachable, the model is installed, and, the
part that matters: that it returns schema-valid output on a real test case
(an RTL design role it should classify as `electrical` with a description).
"Ollama isn't running" and "the model isn't pulled" otherwise look identical to
a silent enrichment failure.

Then:

```bash
pnpm crawl --enrich=50
```

## Choosing a model

Structured extraction and classification are among the easier tasks for a small
model, since output is schema-constrained. Judgment is where they fall down.

| Model | RAM | Good for |
|---|---|---|
| `gemma3:4b` | ~4 GB | Fast triage. Weakest on nuance |
| `qwen3:8b` | ~8 GB | **Default.** Good balance for classification |
| `qwen3:14b` | ~14 GB | Noticeably better on subtle discipline calls |
| `qwen3:32b` | ~24 GB | Approaching hosted quality; needs a real GPU |

Anything below ~8B will make discipline mistakes on ambiguous titles, a
"Systems Engineer" that's really RTL design, or an "AI Engineer" that's really
CRM administration. That's exactly the case the keyword rules already fail on
and the LLM was added to catch, so going too small loses the point of the layer.

Override per run without editing config:

```bash
OLLAMA_MODEL=qwen3:14b pnpm llm:check
```

## How output is made safe

Local models satisfy a JSON schema and still invent enum values. Every response
is validated with Zod and coerced rather than trusted:

- An unrecognised discipline or seniority becomes `unknown`, not a wrong label
- A non-boolean becomes `false`
- A malformed tech stack becomes empty
- **A garbled sponsorship signal becomes `unknown`, never `no`**, the same
  rule the visa gate follows, so a confused local model cannot hide a viable job
- Fit scores are clamped to 0-100
- JSON wrapped in prose or a code fence is extracted rather than rejected

All of that is covered by `pnpm verify`, which runs against a stub Ollama
server so it works without a model installed.

## Privacy

Under `ollama`, job descriptions and your `config/profile.md` never leave your
machine. Under `hybrid`, the profile and descriptions still go to Claude for
the assessment step. Under `anthropic`, everything does. If keeping your CV
details local is the goal, `ollama` is the only mode that achieves it.
