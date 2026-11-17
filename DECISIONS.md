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
