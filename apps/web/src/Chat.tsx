import { useEffect, useRef, useState, type FormEvent } from 'react'
import { streamChat, streamDecision, type ActionCard, type ChatResult, type Customer, type StreamEvent } from './api'
import { useI18n } from './i18n'
import { Logo, SendIcon } from './icons'

interface ToolStep {
  name: string
  input: unknown
  ok?: boolean
  result?: unknown
}

type CardState = 'pending' | 'confirmed' | 'declined' | 'replaced'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  tools: ToolStep[]
  result?: ChatResult
  error?: string
  /** The confirmation card the agent's answer came with, if it proposed an action. */
  card?: ActionCard
  cardState?: CardState
  /** Set on a customer turn that was a button press rather than typed text. */
  pressed?: 'confirm' | 'decline'
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

  const onEvent = (event: StreamEvent) => {
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
    } else if (event.type === 'action_pending') {
      // A new proposal replaces any card still waiting further up.
      setTurns((all) =>
        all.map((turn, i) =>
          i === all.length - 1
            ? { ...turn, card: event.action, cardState: 'pending' }
            : turn.cardState === 'pending'
              ? { ...turn, cardState: 'replaced' }
              : turn,
        ),
      )
    } else if (event.type === 'done') {
      conversationId.current = event.conversationId
      updateLast((turn) => ({ ...turn, text: event.reply, result: event }))
    } else if (event.type === 'error') {
      updateLast((turn) => ({ ...turn, error: event.message }))
    }
  }

  /** Adds the customer's turn and an empty answer, then streams the answer into it. */
  async function exchange(customerTurn: Turn, run: () => Promise<void>) {
    setBusy(true)
    setTurns((all) => [...all, customerTurn, { role: 'assistant', text: '', tools: [] }])
    try {
      await run()
    } catch (error) {
      updateLast((turn) => ({ ...turn, error: error instanceof Error ? error.message : t.requestFailed }))
    } finally {
      setBusy(false)
      onAnswered()
    }
  }

  function send(message: string) {
    if (!message.trim() || busy) return
    setDraft('')
    void exchange({ role: 'user', text: message, tools: [] }, () =>
      streamChat({ customerId: customer.id, conversationId: conversationId.current, message, language }, onEvent),
    )
  }

  function press(card: ActionCard, decision: 'confirm' | 'decline') {
    if (busy) return
    setTurns((all) =>
      all.map((turn) =>
        turn.card?.id === card.id ? { ...turn, cardState: decision === 'confirm' ? 'confirmed' : 'declined' } : turn,
      ),
    )
    void exchange({ role: 'user', text: '', tools: [], pressed: decision }, () =>
      streamDecision(card.id, { customerId: customer.id, decision, language }, onEvent),
    )
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
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
                <button key={suggestion} type="button" onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`turn ${turn.role}`}>
            {turn.tools.length > 0 && <Trace tools={turn.tools} />}
            {turn.pressed && (
              <div className="bubble pressed">{turn.pressed === 'confirm' ? t.pressedConfirm : t.pressedCancel}</div>
            )}
            {turn.text && <div className="bubble">{turn.text}</div>}
            {turn.role === 'assistant' && !turn.text && !turn.error && (
              <div className="bubble typing" aria-label={t.thinking}>
                <span />
                <span />
                <span />
              </div>
            )}
            {turn.error && <div className="bubble error">{turn.error}</div>}
            {turn.card && (
              <Confirmation
                card={turn.card}
                state={turn.cardState ?? 'pending'}
                disabled={busy}
                onPress={(decision) => press(turn.card!, decision)}
              />
            )}
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

/**
 * The confirmation card. The action runs only when the customer presses
 * Confirm here; nothing typed in the chat can trigger it.
 */
function Confirmation({
  card,
  state,
  disabled,
  onPress,
}: {
  card: ActionCard
  state: CardState
  disabled: boolean
  onPress: (decision: 'confirm' | 'decline') => void
}) {
  const { t, fill, money, date } = useI18n()
  const { preview } = card

  const description = () => {
    const amount = money(preview.amount_cents ?? preview.charged_now_cents ?? 0)
    const price = money(preview.new_price_cents ?? 0)
    if (card.tool === 'request_refund') {
      return fill(preview.outcome === 'pending_approval' ? t.cardRefundReview : t.cardRefundNow, { amount })
    }
    if (card.tool === 'change_plan') {
      return preview.outcome === 'scheduled'
        ? fill(t.cardPlanLater, { plan: preview.to_plan ?? '', date: date(preview.effective_at ?? ''), price })
        : fill(t.cardPlanNow, { plan: preview.to_plan ?? '', amount, price })
    }
    return preview.access_until ? fill(t.cardCancelLater, { date: date(preview.access_until) }) : t.cardCancelNow
  }

  const stateLabel = { confirmed: t.cardConfirmed, declined: t.cardDeclined, replaced: t.cardReplaced }

  return (
    <div className={`confirm ${state}`}>
      <strong>{t.cardTitle}</strong>
      <p>{description()}</p>
      {state === 'pending' ? (
        <>
          <span className="confirm-note">{t.cardNothingYet}</span>
          <div className="actions">
            <button type="button" className="primary" disabled={disabled} onClick={() => onPress('confirm')}>
              {t.cardConfirm}
            </button>
            <button type="button" className="secondary" disabled={disabled} onClick={() => onPress('decline')}>
              {t.cardCancel}
            </button>
          </div>
        </>
      ) : (
        <span className={`badge ${state === 'confirmed' ? 'refunded' : ''}`}>{stateLabel[state]}</span>
      )}
    </div>
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
