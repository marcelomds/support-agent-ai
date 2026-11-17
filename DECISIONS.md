# Decision log

What was chosen, why, and what was tried and did not work.
Newest entries at the bottom.

---

## 001 — Fictional domain first, real system later
**Decision:** Build the agent for a fictional subscription company (StreamBox)
instead of starting inside a real production system.
**Why:** The goal is to learn each concept in isolation. A fictional domain
has rules that are fully known, so eval cases have unambiguous right answers,
failures can be provoked on purpose, and the whole repository can be public.
**Trade-off:** No real users or real traffic. The agent core is kept separate
from the domain so it can be pointed at a real system afterwards.

## 002 — No agent framework at the start
**Decision:** The agent loop is written by hand on top of the model SDK.
**Why:** A framework hides the exact thing this project exists to show: what
is sent to the model, what comes back, and who executes what.
**Note:** NestJS 12 ships `@nestjs/ai` and `@nestjs/mcp`. They are
deliberately not used in the early phases, and will be reconsidered once the
hand-written loop is understood.

## 003 — Anthropic SDK for the model
**Decision:** `@anthropic-ai/sdk`.
**Why:** Native tool use, and MCP and skills (phase 6) come from the same
ecosystem. The SDK is thin and does not hide the loop.
**Trade-off:** Anthropic has no embeddings model, so phase 3 needs a second
provider. To be decided then.

## 004 — Drizzle for database access
**Decision:** `drizzle-orm` with `pg`, wired into Nest with a small custom
provider.
**Alternatives:** Prisma (weak pgvector support, vector search ends up as raw
SQL), TypeORM (limited vector support, looser typing), raw SQL (a lot of
boilerplate that teaches nothing about AI).
**Why:** Close to SQL, typed, and supports the `vector` column type.
**Not used:** `@nestjs/drizzle`. It is at version 0.0.2; a 20-line provider is
easier to understand and has no moving parts.

## 005 — One repository, pnpm workspaces
**Decision:** Monorepo with `apps/api` (and later `apps/web`), using pnpm
workspaces and no build orchestrator (Turborepo, Nx).
**Why:** One link to share, one `docker compose up`, one CI pipeline for evals.
**Tried and failed:** npm workspaces. `npm install` crashed with
`Cannot read properties of null (reading 'edgesOut')` (npm 10.9 with this
dependency tree). pnpm installed cleanly.

## 006 — React + Vite for the frontend
**Decision:** A minimal React + Vite + TypeScript SPA, added when the first
phase needs a UI.
**Alternative:** Next.js. Rejected because it brings its own backend layer,
which would duplicate NestJS and blur where the logic lives.

## 007 — Schema conventions
**Decision:** Money as integer cents in a single currency (USD), `timestamptz`
for all timestamps, Postgres enums for statuses.
**Why:** Business rules ("refund within 7 days", "above $50 needs approval")
must not depend on float rounding or on the server timezone.
**Details:** [docs/01-schema-and-tools.md](docs/01-schema-and-tools.md).

## 008 — The customer is never a tool parameter
**Decision:** No agent tool accepts a customer id. The customer comes from the
session and is injected by the application.
**Why:** If the model could choose whose data to read, a prompt injection
would be a data leak. Removing the parameter removes the attack.

## 009 — Business rules are enforced in code
**Decision:** Refund windows, approval thresholds and plan-change rules live
in services with ordinary tests. The prompt describes the rules; it does not
enforce them.
**Why:** A model can be talked into things. Code cannot.

## 010 — Seed data is scenario-driven and relative to "now"
**Decision:** Each sample customer represents one scenario, and all dates are
computed from a reference date (`SEED_NOW`, default: the current time).
**Why:** "Charged yesterday" stays true whenever the seed runs, and evals can
pin the date to get deterministic results.

## 011 — Build first, explain afterwards
**Decision:** The original plan was to teach each concept before writing its
code. It changed to: build a working system, then study each concept on top of
running code.
**Why:** The project owner preferred to see it working first.
**Consequence:** Phases 1, 2 and 4 and part of phase 3 were built in one pass.
The study guide in `docs/pt-BR/02-guia-de-estudo.md` maps every concept to the
file that implements it.

## 012 — Model, effort and refusal fallback
**Decision:** `claude-opus-5-5` by default (`ANTHROPIC_MODEL`), effort `low`
(`AGENT_EFFORT`), and the server-side `fallbacks: "default"` option enabled.
**Why:** A support chat is a short, tool-driven task where low effort is
usually enough, and it keeps latency and cost down. The fallback makes the API
retry on another model if a safety classifier declines a request, instead of
failing the customer's message.
**To measure:** Whether a cheaper model (Sonnet, Haiku) keeps the same eval
score. That is a phase 5 and 7 question, not a guess to make now.

## 013 — Customer confirmation is enforced by the prompt, not by code
**Decision:** Before an action tool is called, the agent is instructed to
state what will happen and wait for the customer's yes.
**Limitation:** This is a prompt-level rule, so a model mistake or a prompt
injection could skip the confirmation. What cannot be skipped is in code: the
refund policy, the approval threshold, and the fact that tools only act on the
signed-in customer.
**Planned:** A code-level confirmation (the tool creates a pending action and
the UI confirms it) in phase 7, measured by evals first.

## 014 — Keyword search before embeddings
**Decision:** `search_policies` uses Postgres full-text search for now.
**Why:** It needs no second provider and no API key, and it will be half of
the hybrid search anyway. Embeddings (pgvector) and queued ingestion (BullMQ)
are still to be built; the embeddings provider is an open decision.

## 015 — The model is replaceable in tests
**Decision:** The loop depends on a small `ModelClient` interface. Tests use a
`ScriptedModel` that returns prepared responses.
**Why:** The loop, the tools and the HTTP API can be tested deterministically,
for free, and in CI.
**Limitation:** These tests prove the plumbing, not the model's judgment. How
well the real model chooses tools and follows the rules is what evals measure.
**Status:** The system has not been run against the real API yet. The session
that built it had no API credentials.

## 016 — E2E tests use their own database
**Decision:** The e2e tests create and migrate `streambox_test` and reset it
before each test.
**Why:** The first version ran against the development database and wiped its
data on every test run.

## 017 — Plain CSS in the demo UI
**Decision:** One CSS file, no Tailwind.
**Why:** The UI is three small screens. A CSS framework would add a build
dependency without teaching anything about the agent.

## 018 — Three languages, chosen by the user
**Decision:** The UI is available in English, Portuguese and Spanish, with a
language picker. The chosen language is sent with each chat request and the
system prompt tells the agent to answer in it.
**Alternative:** Let the agent answer in whatever language the customer
writes. Rejected because the user asked for an explicit choice, and an
explicit choice is easier to test: one assertion on the system prompt.
**How:** A typed dictionary per language in `apps/web/src/i18n.tsx`, without
an i18n library. TypeScript fails the build if a language is missing a key.
Dates, numbers and money use the browser's `Intl` formatters.
**Limitations:** Policy documents exist only in English, so the agent
translates what it reports, and `search_policies` is told to search with
English keywords. Data stored in the database (plan names, refund reasons) is
not translated. Prices stay in US dollars in every language.

## 019 — Product-style layout for the demo UI
**Decision:** A sidebar shell with three pages, and an account panel next to
the chat showing the customer's plan and recent payments.
**Why:** The panel reads the same data the agent's tools return, so a viewer
can check the agent's answers against the account, and see the account change
after an action such as a refund.

## 020 — A brand palette instead of the default look
**Decision:** Warm paper background, deep teal for brand surfaces and the
customer's messages, coral for actions. Sora for headings, DM Sans for text,
both self-hosted through `@fontsource`.
**Why:** The first version used system fonts and an indigo accent on grey,
which reads as a generic generated UI. A fictional company still needs an
identity for the demo to look like a product.
**How:** Every colour is a CSS variable in `apps/web/src/index.css`, so the
theme can be changed in one place.
**Light theme only:** A dark variant existed for one commit and followed the
system setting. It was removed because the light theme is the chosen look for
the demo and should be the same on every machine.

## 021 — A local embedding model
**Decision:** Embeddings come from `multilingual-e5-small`, run inside the API
process with `@huggingface/transformers`. No API key and no cost per call.
**Alternatives:** Voyage AI and OpenAI: better quality, but a second paid
account and key for anyone who clones the repository.
**Why this model:** It is small (about 120 MB, 384 dimensions) and
multilingual, so a question in Portuguese or Spanish finds policy text written
in English. That matters because the UI offers three languages and the
policies exist in one.
**Trade-offs:** Lower quality than the paid models, a download on first use,
and the first search after a restart is slower while the model loads.
**Testing:** The search depends on an `Embedder` interface. Tests use a
deterministic word-hash stand-in, so they need no download; they prove the
pipeline, not the quality of the real model.

## 022 — Hybrid search with reciprocal rank fusion
**Decision:** `search_policies` runs a keyword search (Postgres full-text) and
a meaning search (pgvector, cosine distance) and merges them with reciprocal
rank fusion.
**Why both:** Keywords are exact on terms such as "duplicate charge" but miss
paraphrases and other languages. Embeddings catch those but can rank a
generic section above the one with the exact term.
**Why this fusion:** It only uses positions in each list, so the two different
score scales never have to be compared, and it has nothing to tune.
**Not done:** A reranking step. With 18 sections there is nothing for it to
improve; it becomes relevant with hundreds of documents.
**Similarity floor:** A vector search always returns its nearest rows, even
for an unrelated question, so sections below `EMBEDDING_MIN_SIMILARITY` are
dropped. If the model is unavailable the search falls back to keywords only.

## 023 — Ingestion through a queue
**Decision:** `policies:ingest` puts one BullMQ job per document on a Redis
queue; a worker chunks, embeds and stores each one, with 3 attempts and
exponential backoff.
**Why a queue for four files:** It is the realistic shape of the problem.
Embedding is slow and can fail, so it should not run inside a web request and
a failure should be retried, not lost.
**Simplification:** By default the command enqueues and runs the worker in the
same process, so setup stays one step. `--enqueue` and `--worker` run the two
halves separately, as they would in production.
**Tried and failed:** Passing connection options to BullMQ 6. In an ES module
project it cannot load `ioredis` itself; it needs an already-constructed
client, so `ioredis` is a direct dependency.

## 024 — Evals grade the end state first, and a judge only where code cannot
**Decision:** Each eval case is a short conversation with one sample customer.
It is graded by (1) what is in the database afterwards and (2) statements
about the final reply, each marked true or false by a second model.
**Why the end state:** For an agent that acts, the question is what it did,
not what it said. "Was a refund issued?" has one right answer and needs no
opinion. Tool-call sequences are not checked, so the agent is free to reach
the right outcome by a different route.
**Why a judge at all:** Some expectations are about wording ("explains the
7-day rule", "is written in Portuguese"). Each statement is one call with a
structured true/false verdict, so a failure names the exact statement.
**Judge model:** `claude-haiku-5-5`, a different model from the agent, to
reduce the bias of a model grading its own style.
**Harness errors are not agent failures:** A timeout or API error is reported
as "could not be graded" and left out of the score.
**Honest limits:** 17 cases give a margin of roughly ±24 points, so the score
can show a broken agent but not a 5-point improvement. The cases were drafted
from the sample scenarios and are pending the project owner's review. The
judge has not been calibrated against human labels.
**Not in CI yet:** Evals call the real model and cost money per run. They run
on demand (`pnpm --filter api evals`); a CI job needs a repository secret and
is a later step.
