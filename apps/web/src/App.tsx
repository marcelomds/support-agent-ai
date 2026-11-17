import { useEffect, useState } from 'react'
import { listCustomers, type Customer } from './api'
import { Approvals } from './Approvals'
import { Audit } from './Audit'
import { Chat } from './Chat'

type Tab = 'chat' | 'approvals' | 'audit'
const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Customer chat' },
  { id: 'approvals', label: 'Refund approvals' },
  { id: 'audit', label: 'Audit log' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCustomers()
      .then((list) => {
        setCustomers(list)
        setCustomerId(list[0]?.id ?? null)
      })
      .catch(() => setError('Could not reach the API. Is it running on port 3000?'))
  }, [])

  const customer = customers.find((c) => c.id === customerId)

  return (
    <div className="app">
      <header>
        <h1>StreamBox Support Agent</h1>
        <nav>
          {TABS.map(({ id, label }) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        {tab === 'chat' && customers.length > 0 && (
          <label className="picker">
            Signed in as
            <select value={customerId ?? ''} onChange={(e) => setCustomerId(Number(e.target.value))}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      <main>
        {error && <p className="notice error">{error}</p>}
        {/* The key resets the chat when the customer changes: a new conversation. */}
        {tab === 'chat' && customer && <Chat key={customer.id} customer={customer} />}
        {tab === 'approvals' && <Approvals />}
        {tab === 'audit' && <Audit />}
      </main>
    </div>
  )
}
