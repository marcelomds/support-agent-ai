import { useEffect, useState } from 'react'
import { listAudit, type AuditEntry } from './api'

/** Every tool call the agent made and every human decision, newest first. */
export function Audit() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAudit()
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="notice error">{error}</p>
  if (!entries) return <p className="notice">Loading…</p>
  if (entries.length === 0) return <p className="notice">Nothing recorded yet.</p>

  return (
    <table className="table">
      <thead>
        <tr>
          <th>When</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Customer</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{new Date(entry.createdAt).toLocaleString()}</td>
            <td>
              <span className={`badge ${entry.actor}`}>{entry.actor}</span>
            </td>
            <td>{entry.action}</td>
            <td>{entry.customerId ?? '—'}</td>
            <td>
              <details>
                <summary>input and result</summary>
                <pre>{JSON.stringify({ input: entry.input, result: entry.result }, null, 2)}</pre>
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
