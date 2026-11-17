# support-agent-ai

> 🇺🇸 [Read in English](README.md)

Um agente de atendimento com IA construído do zero, um conceito por vez, para
entender o que acontece de verdade dentro de um sistema que tem um LLM.

O agente trabalha para a **StreamBox**, uma empresa fictícia de assinatura de
streaming. Ele responde dúvidas de política, consulta dados da conta e executa
ações (troca de plano, cancelamento, reembolso) seguindo regras de negócio,
com aprovação humana nas ações de risco.

Nas primeiras fases não há framework de agente. O loop do agente é escrito na
mão sobre o SDK do modelo, para que cada passo fique visível.

## O que este projeto cobre

| Fase | Entrega | Conceitos | Status |
|---|---|---|---|
| 1 | Banco com dados de exemplo e endpoint que conversa com o modelo | LLM via API: chamadas sem estado, tokens, custo, streaming | 🚧 em andamento |
| 2 | Ferramentas de leitura e loop do agente feito na mão | Tool use, loop de agente, structured outputs, prompt caching | ⏳ |
| 3 | Documentos de política, ingestão com fila e RAG | Embeddings, busca híbrida, reranking | ⏳ |
| 4 | Ferramentas de ação com regras de negócio e aprovação humana | Guardrails, humano no circuito | ⏳ |
| 5 | Evals rodando no CI, com o acerto medido em número | Evals, LLM-as-judge | ⏳ |
| 6 | Servidor MCP e skills | MCP, skills | ⏳ |
| 7 | Observabilidade, defesa contra prompt injection, auditoria | Tracing, custo, latência, roteamento de modelos | ⏳ |

## Stack

- **Backend:** NestJS (TypeScript)
- **Banco:** Postgres com pgvector, acessado pelo Drizzle
- **Filas:** BullMQ sobre Redis
- **Modelo:** API da Anthropic pelo SDK oficial
- **Frontend:** React + Vite (entra quando uma fase precisar)

## Como rodar

Requisitos: Node 22+, pnpm 10+, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d              # Postgres (pgvector) e Redis
pnpm --filter api db:migrate      # cria as tabelas
pnpm --filter api db:seed         # carrega os clientes de exemplo
pnpm api:dev                      # http://localhost:3000
```

Confira se está no ar:

```bash
curl http://localhost:3000/health
```

Rode os testes (os testes e2e precisam do banco no ar):

```bash
pnpm api:test
```

## Documentação

- [Passo 1: schema do banco e ferramentas do agente](docs/pt-BR/01-schema-e-ferramentas.md)
- [Registro de decisões](DECISIONS.md) (em inglês): o que foi escolhido, por quê e o que não funcionou
