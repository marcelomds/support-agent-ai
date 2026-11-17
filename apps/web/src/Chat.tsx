import { useEffect, useRef, useState, type FormEvent } from 'react'
import { streamChat, type ChatResult, type Customer } from './api'

interface ToolStep {
  name: string
  input: unknown
  ok?: boolean
  result?: unknown
}

interface Turn {
  role: 'user' | 'assistant'
  text: string
  tools: ToolStep[]
  result?: ChatResult
  error?: string
}

const SUGGESTIONS = [
  'What plan am I on?',
  'When was my last charge?',
  'Can I get a refund?',
  'What happens if I cancel today?',
]

export function Chat({ customer }: { customer: Customer }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationId = useRef<string | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  // Updates the assistant turn being streamed (always the last one).
  const updateLast = (change: (turn: Turn) => Turn) =>
    setTurns((all) => all.map((turn, i) => (i === all.length - 1 ? change(turn) : turn)))

  async function send(message: string) {
    if (!message.trim() || busy) return
    setDraft('')
    setBusy(true)
    setTurns((all) => [
      ...all,
      { role: 'user', text: message, tools: [] },
      { role: 'assistant', text: '', tools: [] },
    ])
    try {
      await streamChat({ customerId: customer.id, conversationId: conversationId.current, message }, (event) => {
        if (event.type === 'text') {
          updateLast((t) => ({ ...t, text: t.text + event.delta }))
        } else if (event.type === 'tool_call') {
          updateLast((t) => ({ ...t, tools: [...t.tools, { name: event.name, input: event.input }] }))
        } else if (event.type === 'tool_result') {
          updateLast((t) => ({
            ...t,
            tools: t.tools.map((tool, i) =>
              i === t.tools.length - 1 ? { ...tool, ok: event.ok, result: event.result } : tool,
            ),
          }))
        } else if (event.type === 'done') {
          conversationId.current = event.conversationId
          updateLast((t) => ({ ...t, text: event.reply, result: event }))
        } else if (event.type === 'error') {
          updateLast((t) => ({ ...t, error: event.message }))
        }
      })
    } catch (error) {
      updateLast((t) => ({ ...t, error: error instanceof Error ? error.message : 'Request failed' }))
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  return (
    <section className="chat">
      <div className="messages">
        {turns.length === 0 && (
          <div className="empty">
            <p>
              You are signed in as <strong>{customer.name}</strong>. Ask about your subscription, payments or
              StreamBox policies.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`turn ${turn.role}`}>
            {turn.tools.length > 0 && <Trace tools={turn.tools} />}
            {turn.text && <div className="bubble">{turn.text}</div>}
            {turn.role === 'assistant' && !turn.text && !turn.error && <div className="bubble muted">Thinking…</div>}
            {turn.error && <div className="bubble error">{turn.error}</div>}
            {turn.result && <Stats result={turn.result} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message"
          aria-label="Message"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}

/** What the agent did before answering: each tool call and its result. */
function Trace({ tools }: { tools: ToolStep[] }) {
  return (
    <details className="trace">
      <summary>
        {tools.length} tool {tools.length === 1 ? 'call' : 'calls'}: {tools.map((t) => t.name).join(' → ')}
      </summary>
      {tools.map((tool, i) => (
        <div key={i} className="tool">
          <div className="tool-name">
            {tool.name}
            {tool.ok === false && <span className="badge bad">error</span>}
          </div>
          <pre>{JSON.stringify(tool.input, null, 2)}</pre>
          {tool.result !== undefined && <pre>{JSON.stringify(tool.result, null, 2)}</pre>}
        </div>
      ))}
    </details>
  )
}

function Stats({ result }: { result: ChatResult }) {
  const { usage } = result
  const input = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  return (
    <div className="stats">
      {result.steps} model {result.steps === 1 ? 'call' : 'calls'} · {input.toLocaleString()} tokens in
      {usage.cacheReadTokens > 0 && ` (${usage.cacheReadTokens.toLocaleString()} cached)`} ·{' '}
      {usage.outputTokens.toLocaleString()} out
      {result.costUsd !== null && ` · $${result.costUsd.toFixed(4)}`} · {(result.latencyMs / 1000).toFixed(1)}s
      {result.stopReason !== 'completed' && <span className="badge bad">{result.stopReason}</span>}
    </div>
  )
}
