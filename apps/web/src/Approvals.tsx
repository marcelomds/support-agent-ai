import { useCallback, useEffect, useState } from 'react'
import { decideRefund, listRefunds, type Refund } from './api'
import { initials } from './AccountPanel'
import { useI18n } from './i18n'

/** The human side of the loop: review refunds the agent could not approve itself. */
export function Approvals() {
  const { t, fill, money, date } = useI18n()
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
      setError(e instanceof Error ? e.message : t.requestFailed)
    }
  }

  if (error) return <p className="notice error">{error}</p>
  if (!refunds) return <p className="notice">{t.loading}</p>
  if (refunds.length === 0) return <p className="notice">{t.approvalsEmpty}</p>

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>{t.colCustomer}</th>
            <th>{t.colAmount}</th>
            <th>{t.colReason}</th>
            <th>{t.colRule}</th>
            <th>{t.colStatus}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {refunds.map((refund) => (
            <tr key={refund.id}>
              <td>
                <div className="person compact">
                  <div className="avatar">{initials(refund.customerName)}</div>
                  <div>
                    <strong>{refund.customerName}</strong>
                    <span>{refund.customerEmail}</span>
                  </div>
                </div>
              </td>
              <td>
                <strong>{money(refund.amountCents)}</strong>
                <div className="sub">{date(refund.createdAt)}</div>
              </td>
              <td>{refund.reason}</td>
              <td>{t.refundRule[refund.rule]}</td>
              <td>
                <span className={`badge ${refund.status}`}>{t.refundStatus[refund.status]}</span>
                {refund.decidedBy && <div className="sub">{fill(t.decidedBy, { name: refund.decidedBy })}</div>}
              </td>
              <td>
                {refund.status === 'pending_approval' && (
                  <div className="actions">
                    <button type="button" className="primary" onClick={() => void decide(refund.id, 'approve')}>
                      {t.approve}
                    </button>
                    <button type="button" className="secondary" onClick={() => void decide(refund.id, 'reject')}>
                      {t.reject}
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
