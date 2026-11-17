import type { Account, Customer } from './api'
import { useI18n } from './i18n'

interface Props {
  customers: Customer[]
  customerId: number
  onSelect: (customerId: number) => void
  account: Account | null
}

export const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/** The signed-in customer's account, read from the same data the agent's tools use. */
export function AccountPanel({ customers, customerId, onSelect, account }: Props) {
  const { t, fill, money, date } = useI18n()
  const customer = customers.find((c) => c.id === customerId)
  const subscription = account?.subscription

  return (
    <aside className="card account">
      <label className="field">
        <span>{t.signedInAs}</span>
        <select value={customerId} onChange={(e) => onSelect(Number(e.target.value))}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {customer && (
        <div className="person">
          <div className="avatar">{initials(customer.name)}</div>
          <div>
            <strong>{customer.name}</strong>
            <span>{customer.email}</span>
          </div>
        </div>
      )}

      <div className="section">
        <h3>{t.plan}</h3>
        {!subscription && <p className="muted">{t.loading}</p>}
        {subscription && !subscription.has_subscription && <p className="muted">{t.noSubscription}</p>}
        {subscription?.has_subscription && (
          <>
            <div className="plan-row">
              <strong>{subscription.plan.name}</strong>
              <span className={`badge ${subscription.status}`}>{t.subscriptionStatus[subscription.status]}</span>
            </div>
            <div className="price">
              {money(subscription.plan.price_cents)}
              <span>{subscription.plan.code.endsWith('yearly') ? t.perYear : t.perMonth}</span>
            </div>
            {subscription.status === 'active' && (
              <p className="muted">
                {subscription.cancel_at_period_end ? t.accessUntil : t.renewsOn} {date(subscription.current_period_end)}
              </p>
            )}
            {subscription.cancel_at_period_end && <p className="note">{t.cancelScheduled}</p>}
            {subscription.pending_downgrade_to && (
              <p className="note">{fill(t.downgradeScheduled, { plan: subscription.pending_downgrade_to })}</p>
            )}
          </>
        )}
      </div>

      <div className="section">
        <h3>{t.recentPayments}</h3>
        {account && account.payments.length === 0 && <p className="muted">{t.noPayments}</p>}
        <ul className="payments">
          {account?.payments.map((payment) => (
            <li key={payment.payment_id}>
              <div>
                <strong>{money(payment.amount_cents)}</strong>
                <span>{date(payment.charged_at)}</span>
              </div>
              <span className={`badge ${payment.status}`}>{t.paymentStatus[payment.status]}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
