import { useEffect, useState } from 'react'
import { getMetrics, type Metrics as MetricsData } from './api'
import { useI18n } from './i18n'

const usd = (microUsd: number, digits: number) => `US$ ${(microUsd / 1e6).toFixed(digits)}`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** What the agent costs and how it behaves, read from the recorded runs. */
export function Metrics() {
  const { t, number, dateTime } = useI18n()
  const [data, setData] = useState<MetricsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMetrics()
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="notice error">{error}</p>
  if (!data) return <p className="notice">{t.loading}</p>
  const { totals } = data
  if (totals.runs === 0) return <p className="notice">{t.metricsEmpty}</p>

  const cacheShare = totals.inputTokens > 0 ? Math.round((totals.cachedTokens / totals.inputTokens) * 100) : 0
  const mostCalls = Math.max(1, ...data.tools.map((tool) => tool.calls))
  const statuses = ['confirmed', 'declined', 'pending', 'superseded', 'expired'] as const

  return (
    <div className="metrics">
      <div className="kpis">
        <Kpi label={t.kpiAnswers} value={number(totals.runs)} />
        <Kpi label={t.kpiCost} value={usd(totals.costMicroUsd, 2)} />
        <Kpi label={t.kpiCostPerAnswer} value={usd(totals.costMicroUsd / totals.runs, 4)} />
        <Kpi label={t.kpiLatency} value={seconds(totals.avgLatencyMs)} />
        <Kpi label={t.kpiP95} value={seconds(totals.p95LatencyMs)} />
        <Kpi label={t.kpiCache} value={`${cacheShare}%`} />
        <Kpi label={t.kpiIncomplete} value={number(totals.notCompleted)} warn={totals.notCompleted > 0} />
      </div>

      <div className="metrics-row">
        <section className="card panel">
          <h3>{t.toolsUsed}</h3>
          <ul className="bars">
            {data.tools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <div className="bar-track">
                  <div className="bar" style={{ width: `${(tool.calls / mostCalls) * 100}%` }} />
                </div>
                <span>
                  {number(tool.calls)} {t.toolCallsLabel}
                  {tool.errors > 0 && (
                    <span className="badge bad">
                      {number(tool.errors)} {t.toolErrorsLabel}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card panel">
          <h3>{t.confirmations}</h3>
          <ul className="counts">
            {statuses.map((status) => (
              <li key={status}>
                <span>{t.actionStatus[status]}</span>
                <strong>{number(data.actions[status] ?? 0)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card table-card">
        <h3 className="table-title">{t.recentAnswers}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t.colWhen}</th>
              <th>{t.colCustomer}</th>
              <th>{t.colModelCalls}</th>
              <th>{t.colTokens}</th>
              <th>{t.colCost}</th>
              <th>{t.colTime}</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((run) => (
              <tr key={run.id}>
                <td className="nowrap">{dateTime(run.createdAt)}</td>
                <td>{run.customerName ?? '—'}</td>
                <td>
                  {number(run.modelCalls)}
                  {run.stopReason !== 'completed' && <span className="badge bad">{run.stopReason}</span>}
                </td>
                <td className="nowrap">
                  {number(run.inputTokens)} / {number(run.outputTokens)}
                </td>
                <td className="nowrap">{run.costMicroUsd === null ? '—' : usd(run.costMicroUsd, 4)}</td>
                <td>{seconds(run.latencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`card kpi ${warn ? 'warn' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
