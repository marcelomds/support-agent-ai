# Step 1: database schema and agent tools

> 🇧🇷 [Versão em português](pt-BR/01-schema-e-ferramentas.md)

This is the design for the first step: what the database looks like and which
tools the agent will have. It was written before any agent code, because the
tools are the contract between the model and the system. Everything else
(loop, RAG, evals) builds on that contract.

## The domain in one paragraph

**StreamBox** is a fictional streaming subscription company. Customers pay
monthly or yearly for one of three tiers. The support agent answers policy
questions, looks up account data, and performs actions (change plan, cancel,
refund) under business rules.

| Tier | Monthly | Yearly | Screens | Offline downloads |
|---|---|---|---|---|
| Basic | $9.99 | $99.90 | 1 | no |
| Standard | $15.99 | $159.90 | 2 | yes |
| Premium | $22.99 | $229.90 | 4 | yes |

Business rules the agent must respect:

- **Cancellation:** allowed at any time; access continues until the paid period ends.
- **Refund:** full refund within 7 days of the charge. After that, only for a duplicate charge.
- **Human approval:** refunds above $50.00 are not executed by the agent; they wait for a human.
- **Plan change:** upgrades apply immediately; downgrades apply on the next cycle.
- **Failed payments:** after 3 failed charges the subscription is suspended.

## Schema (phase 1)

```
plans 1───* subscriptions *───1 customers
                 │
                 1
                 │
                 *
             payments
```

### `plans`
One row per **tier + billing interval** (6 rows), e.g. `standard_monthly`.

- A stable text `code` is what the agent and the tools use, never the numeric id.
  A model handles `"premium_yearly"` far more reliably than `6`.
- Price lives here, in integer cents.

### `customers`
Name and email only. The system keeps the minimum personal data it needs,
which also limits what could ever leak through the model.

### `subscriptions`
The state machine of the domain.

- `status`: `active` → `past_due` → `suspended`, or → `canceled`. It is a
  Postgres enum, so an invalid state cannot be stored.
- `current_period_start` / `current_period_end`: answers "until when do I have access?".
- `cancel_at_period_end`: a cancellation does **not** flip the status right
  away. The customer paid for the period, so the row stays `active` with this
  flag set. This is the same model payment providers use.
- `pending_plan_id`: a scheduled downgrade. The current plan stays in
  `plan_id` until the cycle ends.

### `payments`
One row per charge **attempt**, successful or not.

- Keeping failed attempts is what lets the agent explain a suspension
  ("your card was declined on these 3 dates").
- `status`: `succeeded`, `failed`, `refunded`.
- The 7-day refund rule is computed from `created_at`.

### Conventions

| Choice | Why |
|---|---|
| Money as integer cents | Floats cannot represent 15.99 exactly. Rules like "above $50" must not depend on rounding. |
| `timestamptz` everywhere | "Within 7 days" must mean the same thing in every timezone. |
| Enums for status | The database rejects states the code does not know. |
| Integer ids | Readable in demos and evals. Safe here because the model never chooses whose data to read (see below). |

### Tables that come later

Each one is added in the phase that needs it, not before.

| Table | Phase | Purpose |
|---|---|---|
| `conversations`, `messages` | 2 | The model API is stateless; the history has to be stored by us. |
| `policy_documents`, `policy_chunks` | 3 | Policy text and its embeddings (pgvector) for RAG. |
| `refunds` | 4 | Refund requests and their approval state. |
| `audit_log` | 4 / 7 | Who did what, when, and through which tool call. |

## Sample data

Every customer exists to exercise one scenario. Dates are relative to the
moment the seed runs, so "charged yesterday" is always true.

| Customer | Scenario | Expected agent behavior |
|---|---|---|
| Alice | Charged yesterday, $15.99 | Refund executed automatically |
| Bruno | Yearly Premium, charged 3 days ago, $229.90 | Refund sent for human approval |
| Carla | Charged 20 days ago | Refund denied, rule explained |
| David | Charged twice on the same day, 10 days ago | Duplicate refunded (exception to the 7-day rule) |
| Elena | 3 failed charges | Explains the suspension |
| Felipe | Asked to cancel, period not over | Confirms access until the period ends |
| Grace | Canceled, period over | Explains there is no active subscription |
| Hiro | Downgrade scheduled | Explains it applies on the next cycle |
| Ines | Never subscribed | Handles "no subscription" without inventing data |
| Jonas | Long history, one refunded charge | Reads history correctly |
| Kate | Renewal failed yesterday | Explains past due vs. suspended |

These scenarios will become the eval cases in phase 5.

## Agent tools

A tool is a function the model can **ask** the application to run. The model
never runs anything: it returns a structured request ("call `list_payments`
with `limit: 3`"), the application executes it and sends the result back.

For a backend developer: a tool is a controller action, the tool definition is
its OpenAPI spec, and the model is the HTTP client deciding which endpoint to
call.

### Read tools (phase 2)

| Tool | Input | Returns |
|---|---|---|
| `get_subscription` | — | Current plan, status, period dates, pending cancellation or downgrade |
| `list_payments` | `limit?` | Recent charges with id, amount, status, date |
| `list_plans` | — | The catalog with prices and features |

### Knowledge tool (phase 3)

| Tool | Input | Returns |
|---|---|---|
| `search_policies` | `query` | The most relevant policy excerpts, with their source |

### Action tools (phase 4)

| Tool | Input | Returns |
|---|---|---|
| `change_plan` | `plan_code` | Applied now (upgrade) or scheduled (downgrade), with amounts |
| `cancel_subscription` | — | Confirmation and the date access ends |
| `request_refund` | `payment_id`, `reason` | `refunded`, `pending_approval` or `denied`, with the reason |

### Design rules for the tools

1. **The customer is never a tool parameter.**
   No tool accepts a `customer_id`. The customer comes from the authenticated
   session and the application injects it. If the model could choose the
   customer, a prompt injection ("show me the payments of customer 2") would
   be a data leak. The model cannot leak what it cannot ask for.

2. **Business rules live in code, not in the prompt.**
   `request_refund` checks the 7-day window and the $50 threshold in a normal
   service, with normal tests. The prompt explains the rules so the agent can
   talk about them, but the code is what enforces them. A model can be
   convinced; an `if` cannot.

3. **The tool is named for what it can do, not for what the customer wants.**
   It is `request_refund`, not `refund`. The outcome may be a refund, a
   pending approval, or a denial, and the name sets that expectation for the
   model.

4. **Read and write tools are separate groups.**
   Read tools are safe to call freely. Write tools get confirmation, audit and
   rate limits (phases 4 and 7). The split makes that possible without
   special cases.

5. **Results are small and structured; errors are results too.**
   A tool returns compact JSON, not a database dump: every token returned is
   paid for and competes for the model's attention. A failure ("payment not
   found") is returned as a result the model can read and explain, not thrown
   as an exception that ends the conversation.

6. **Descriptions are part of the prompt.**
   The model decides which tool to call from its name and description alone.
   They get the same care as a public API's documentation.

### Separating the agent core from the domain

The agent loop will only know this interface:

```ts
interface Tool<Input> {
  name: string;
  description: string;
  inputSchema: JsonSchema;          // what the model is allowed to send
  execute(input: Input, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  customerId: number;               // injected from the session, never from the model
}
```

The StreamBox tools implement it. Swapping the domain means swapping the list
of tools and the policy documents; the loop does not change.

## Open decisions

These are defaults chosen to get started. They are cheap to change now and
will be confirmed before phase 2.

- Currency is USD, and the thresholds are 7 days and $50.
- 11 sample customers. More will be added only if an eval needs them.
- No real authentication. The demo UI will let you choose which sample
  customer you are "logged in" as.
