import { useEffect, useRef, useState, type FormEvent } from 'react'
import { streamChat, type ChatResult, type Customer } from './api'
import { useI18n } from './i18n'
import { Logo, SendIcon } from './icons'

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

interface Props {
  customer: Customer
  /** Called after each answer, so the account panel can show what changed. */
  onAnswered: () => void
}

export function Chat({ customer, onAnswered }: Props) {
  const { t, fill, language } = useI18n()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationId = useRef<string | undefined>(undefined)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
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
      await streamChat(
        { customerId: customer.id, conversationId: conversationId.current, message, language },
        (event) => {
          if (event.type === 'text') {
            updateLast((turn) => ({ ...turn, text: turn.text + event.delta }))
          } else if (event.type === 'tool_call') {
            updateLast((turn) => ({ ...turn, tools: [...turn.tools, { name: event.name, input: event.input }] }))
          } else if (event.type === 'tool_result') {
            updateLast((turn) => ({
              ...turn,
              tools: turn.tools.map((tool, i) =>
                i === turn.tools.length - 1 ? { ...tool, ok: event.ok, result: event.result } : tool,
              ),
            }))
          } else if (event.type === 'done') {
            conversationId.current = event.conversationId
            updateLast((turn) => ({ ...turn, text: event.reply, result: event }))
          } else if (event.type === 'error') {
            updateLast((turn) => ({ ...turn, error: event.message }))
          }
        },
      )
    } catch (error) {
      updateLast((turn) => ({ ...turn, error: error instanceof Error ? error.message : t.requestFailed }))
    } finally {
      setBusy(false)
      onAnswered()
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const reset = () => {
    conversationId.current = undefined
    setTurns([])
  }

  return (
    <section className="card chat">
      <div className="chat-head">
        <div className="avatar logo">
          <Logo />
        </div>
        <div className="chat-head-text">
          <strong>{t.assistantName}</strong>
          <span>{t.assistantStatus}</span>
        </div>
        {turns.length > 0 && (
          <button type="button" className="ghost" onClick={reset} disabled={busy}>
            {t.newChat}
          </button>
        )}
      </div>

      <div className="messages" ref={scroller}>
        {turns.length === 0 && (
          <div className="empty">
            <p>{fill(t.emptyGreeting, { name: customer.name.split(' ')[0] })}</p>
            <div className="suggestions">
              {t.suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`turn ${turn.role}`}>
            {turn.tools.length > 0 && <Trace tools={turn.tools} />}
            {turn.text && <div className="bubble">{turn.text}</div>}
            {turn.role === 'assistant' && !turn.text && !turn.error && (
              <div className="bubble typing" aria-label={t.thinking}>
                <span />
                <span />
                <span />
              </div>
            )}
            {turn.error && <div className="bubble error">{turn.error}</div>}
            {turn.result && <Stats result={turn.result} />}
          </div>
        ))}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          disabled={busy}
        />
        <button type="submit" className="primary icon" disabled={busy || !draft.trim()} aria-label={t.send}>
          <SendIcon />
        </button>
      </form>
    </section>
  )
}

/** What the agent did before answering: each tool call and its result. */
function Trace({ tools }: { tools: ToolStep[] }) {
  const { t, fill } = useI18n()
  return (
    <details className="trace">
      <summary>
        {fill(t.toolCalls, { count: tools.length })}
        {tools.map((tool, i) => (
          <code key={i}>{tool.name}</code>
        ))}
      </summary>
      {tools.map((tool, i) => (
        <div key={i} className="tool">
          <div className="tool-name">
            {tool.name}
            {tool.ok === false && <span className="badge bad">{t.toolError}</span>}
          </div>
          <pre>{JSON.stringify(tool.input, null, 2)}</pre>
          {tool.result !== undefined && <pre>{JSON.stringify(tool.result, null, 2)}</pre>}
        </div>
      ))}
    </details>
  )
}

function Stats({ result }: { result: ChatResult }) {
  const { t, fill, number } = useI18n()
  const { usage } = result
  const input = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const parts = [
    fill(t.statsCalls, { count: result.steps }),
    fill(t.statsIn, { count: number(input) }) +
      (usage.cacheReadTokens > 0 ? ` (${fill(t.statsCached, { count: number(usage.cacheReadTokens) })})` : ''),
    fill(t.statsOut, { count: number(usage.outputTokens) }),
    result.costUsd !== null ? `US$ ${result.costUsd.toFixed(4)}` : null,
    `${(result.latencyMs / 1000).toFixed(1)}s`,
  ].filter(Boolean)
  return (
    <div className="stats">
      {parts.join(' · ')}
      {result.stopReason !== 'completed' && <span className="badge bad">{result.stopReason}</span>}
    </div>
  )
}
