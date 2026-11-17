export interface Customer {
  id: number
  name: string
  email: string
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface ChatResult {
  conversationId: string
  reply: string
  stopReason: 'completed' | 'max_steps' | 'refusal' | 'truncated'
  steps: number
  model: string
  usage: Usage
  costUsd: number | null
  latencyMs: number
  pendingAction?: ActionCard
}

/** An action the agent proposed. It runs only if the customer presses Confirm. */
export interface ActionCard {
  id: string
  tool: 'request_refund' | 'change_plan' | 'cancel_subscription'
  preview: {
    outcome: string
    amount_cents?: number
    to_plan?: string
    charged_now_cents?: number
    new_price_cents?: number
    effective_at?: string
    access_until?: string
  }
  expiresAt: string
}

export interface Metrics {
  totals: {
    runs: number
    costMicroUsd: number
    inputTokens: number
    cachedTokens: number
    outputTokens: number
    modelCalls: number
    avgLatencyMs: number
    p95LatencyMs: number
    notCompleted: number
  }
  tools: { name: string; calls: number; errors: number }[]
  actions: Partial<Record<'pending' | 'confirmed' | 'declined' | 'superseded' | 'expired', number>>
  recent: {
    id: number
    createdAt: string
    customerName: string | null
    stopReason: string
    modelCalls: number
    toolCalls: number
    inputTokens: number
    cachedTokens: number
    outputTokens: number
    costMicroUsd: number | null
    latencyMs: number
  }[]
}

export interface Account {
  customer: Customer
  subscription:
    | { has_subscription: false }
    | {
        has_subscription: true
        status: 'active' | 'past_due' | 'suspended' | 'canceled'
        plan: { code: string; name: string; price_cents: number }
        current_period_end: string
        cancel_at_period_end: boolean
        pending_downgrade_to: string | null
      }
  payments: {
    payment_id: number
    amount_cents: number
    status: 'succeeded' | 'failed' | 'refunded'
    charged_at: string
  }[]
}

export interface Refund {
  id: number
  status: 'pending_approval' | 'refunded' | 'rejected'
  amountCents: number
  reason: string
  rule: 'within_window' | 'duplicate_charge'
  customerName: string
  customerEmail: string
  decidedBy: string | null
  createdAt: string
}

export interface AuditEntry {
  id: number
  customerId: number | null
  actor: 'agent' | 'human' | 'customer'
  action: string
  input: unknown
  result: unknown
  createdAt: string
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; result: unknown }
  | { type: 'action_pending'; action: ActionCard }
  | ({ type: 'done' } & ChatResult)
  | { type: 'error'; status: number; message: string }

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? `Request failed (${response.status})`)
  }
  return response.json()
}

export const listCustomers = () => json<Customer[]>('/customers')
export const getAccount = (customerId: number) => json<Account>(`/customers/${customerId}/account`)
export const listRefunds =() => json<Refund[]>('/refunds')
export const getMetrics = () => json<Metrics>('/metrics')
export const listAudit = () => json<AuditEntry[]>('/audit')
export const decideRefund = (id: number, decision: 'approve' | 'reject', decidedBy: string) =>
  json<Refund>(`/refunds/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, decidedBy }),
  })

/**
 * Sends a message and calls `onEvent` for each Server-Sent Event as it arrives.
 * EventSource only supports GET, so the stream is read from fetch directly.
 */
export function streamChat(
  body: { customerId: number; conversationId?: string; message: string; language: string },
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return streamPost('/chat/stream', body, onEvent)
}

/** The customer pressed Confirm or Cancel on a confirmation card. */
export function streamDecision(
  actionId: string,
  body: { customerId: number; decision: 'confirm' | 'decline'; language: string },
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return streamPost(`/chat/actions/${actionId}/decision/stream`, body, onEvent)
}

async function streamPost(path: string, body: unknown, onEvent: (event: StreamEvent) => void): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message ?? `Request failed (${response.status})`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    // Events are separated by a blank line.
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const type = /^event: (.+)$/m.exec(chunk)?.[1]
      const data = /^data: (.+)$/m.exec(chunk)?.[1]
      if (type && data) onEvent({ type, ...JSON.parse(data) } as StreamEvent)
    }
  }
}
