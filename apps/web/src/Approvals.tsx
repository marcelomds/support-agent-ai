import { useCallback, useEffect, useState } from 'react'
import { decideRefund, listRefunds, usd, type Refund } from './api'

const STATUS_LABEL: Record<Refund['status'], string> = {
  pending_approval: 'Waiting for approval',
  refunded: 'Refunded',
  rejected: 'Rejected',
}

/** The human side of the loop: review refunds the agent could not approve itself. */
export function Approvals() {
  const [refunds, setRefunds] = useState<Refund[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listRefunds()
      .then(setRefunds)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function decide(id: number, decision: 'approve' | 'reject') {
    setError(null)
    try {
      await decideRefund(id, decision, 'demo-reviewer')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
  }

  if (error) return <p className="notice error">{error}</p>
  if (!refunds) return <p className="notice">Loading…</p>
  if (refunds.length === 0) {
    return <p className="notice">No refund requests yet. Ask the agent for a refund as Bruno to create one.</p>
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Amount</th>
          <th>Reason</th>
          <th>Rule</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {refunds.map((refund) => (
          <tr key={refund.id}>
            <td>
              {refund.customerName}
              <div className="sub">{refund.customerEmail}</div>
            </td>
            <td>{usd(refund.amountCents)}</td>
            <td>{refund.reason}</td>
            <td>{refund.rule.replace('_', ' ')}</td>
            <td>
              <span className={`badge ${refund.status}`}>{STATUS_LABEL[refund.status]}</span>
              {refund.decidedBy && <div className="sub">by {refund.decidedBy}</div>}
            </td>
            <td className="actions">
              {refund.status === 'pending_approval' && (
                <>
                  <button type="button" onClick={() => void decide(refund.id, 'approve')}>
                    Approve
                  </button>
                  <button type="button" className="secondary" onClick={() => void decide(refund.id, 'reject')}>
                    Reject
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
