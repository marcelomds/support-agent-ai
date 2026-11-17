# support-agent-ai

> 🇧🇷 [Leia em português](README.pt-BR.md)

An AI customer support agent built from scratch, one concept at a time, to
understand what actually happens inside a system that has an LLM in it.

The agent works for **StreamBox**, a fictional streaming subscription company.
It answers policy questions, looks up account data, and performs actions
(plan change, cancellation, refund) under business rules, with human approval
for the risky ones.

No agent framework is used in the early phases. The agent loop is written by
hand on top of the model SDK, so every step is visible.

## What this project covers

| Phase | Delivery | Concepts | Status |
|---|---|---|---|
| 1 | Database with sample data, endpoint that talks to the model | LLM via API: stateless calls, tokens, cost, streaming | 🚧 in progress |
| 2 | Read tools and a hand-written agent loop | Tool use, agent loop, structured outputs, prompt caching | ⏳ |
| 3 | Policy documents, queued ingestion, RAG | Embeddings, hybrid search, reranking | ⏳ |
| 4 | Action tools with business rules and human approval | Guardrails, human in the loop | ⏳ |
| 5 | Evals running in CI, accuracy as a number | Evals, LLM-as-judge | ⏳ |
| 6 | MCP server and skills | MCP, skills | ⏳ |
| 7 | Observability, prompt injection defense, audit trail | Tracing, cost, latency, model routing | ⏳ |

## Stack

- **Backend:** NestJS (TypeScript)
- **Database:** Postgres with pgvector, accessed through Drizzle
- **Queues:** BullMQ on Redis
- **Model:** Anthropic API through the official SDK
- **Frontend:** React + Vite (added when a phase needs it)

## Documentation

- [Step 1: database schema and agent tools](docs/01-schema-and-tools.md)
- [Decision log](DECISIONS.md): what was chosen, why, and what did not work
