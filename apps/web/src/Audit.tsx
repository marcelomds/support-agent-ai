import { useEffect, useState } from 'react'
import { listAudit, type AuditEntry } from './api'
import { useI18n } from './i18n'

/** Every tool call the agent made and every human decision, newest first. */
export function Audit({ customerNames }: { customerNames: Map<number, string> }) {
  const { t, dateTime } = useI18n()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAudit()
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="notice error">{error}</p>
  if (!entries) return <p className="notice">{t.loading}</p>
  if (entries.length === 0) return <p className="notice">{t.auditEmpty}</p>

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>{t.colWhen}</th>
            <th>{t.colActor}</th>
            <th>{t.colAction}</th>
            <th>{t.colCustomer}</th>
            <th>{t.colDetails}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="nowrap">{dateTime(entry.createdAt)}</td>
              <td>
                <span className={`badge ${entry.actor}`}>{t.actor[entry.actor]}</span>
              </td>
              <td>
                <code>{entry.action}</code>
              </td>
              <td>{entry.customerId ? (customerNames.get(entry.customerId) ?? entry.customerId) : '—'}</td>
              <td>
                <details>
                  <summary>{t.inputAndResult}</summary>
                  <pre>{JSON.stringify({ input: entry.input, result: entry.result }, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
