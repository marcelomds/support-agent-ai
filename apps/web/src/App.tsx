import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccountPanel } from './AccountPanel'
import { getAccount, listCustomers, type Account, type Customer } from './api'
import { Approvals } from './Approvals'
import { Audit } from './Audit'
import { Chat } from './Chat'
import { Home } from './Home'
import { Metrics } from './Metrics'
import { LANGUAGES, useI18n, type Language } from './i18n'
import { ApprovalIcon, AuditIcon, ChatIcon, GlobeIcon, Logo, MetricsIcon } from './icons'

type Page = 'chat' | 'approvals' | 'audit' | 'metrics'

export default function App() {
  const { t, language, setLanguage } = useI18n()
  // The app opens on the start screen; the console comes after.
  const [entered, setEntered] = useState(false)
  const [page, setPage] = useState<Page>('chat')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [apiDown, setApiDown] = useState(false)

  useEffect(() => {
    listCustomers()
      .then((list) => {
        setCustomers(list)
        setCustomerId(list[0]?.id ?? null)
      })
      .catch(() => setApiDown(true))
  }, [])

  const loadAccount = useCallback(() => {
    if (customerId === null) return
    getAccount(customerId)
      .then(setAccount)
      .catch(() => setAccount(null))
  }, [customerId])
  useEffect(loadAccount, [loadAccount])

  const selectCustomer = (id: number) => {
    setAccount(null)
    setCustomerId(id)
  }

  const customer = customers.find((c) => c.id === customerId)
  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])

  const pages = [
    { id: 'chat', label: t.navChat, icon: <ChatIcon />, title: t.chatTitle, subtitle: t.chatSubtitle },
    { id: 'approvals', label: t.navApprovals, icon: <ApprovalIcon />, title: t.approvalsTitle, subtitle: t.approvalsSubtitle },
    { id: 'audit', label: t.navAudit, icon: <AuditIcon />, title: t.auditTitle, subtitle: t.auditSubtitle },
    { id: 'metrics', label: t.navMetrics, icon: <MetricsIcon />, title: t.metricsTitle, subtitle: t.metricsSubtitle },
  ] as const
  const current = pages.find((p) => p.id === page)!

  if (!entered) return <Home onEnter={() => setEntered(true)} />

  return (
    <div className="shell">
      <aside className="sidebar">
        <button type="button" className="brand brand-link" onClick={() => setEntered(false)} title={t.homeBack}>
          <div className="avatar logo">
            <Logo />
          </div>
          <div>
            <strong>StreamBox</strong>
            <span>{t.brandTagline}</span>
          </div>
        </button>

        <nav>
          {pages.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <label className="language">
            <GlobeIcon />
            <span className="sr-only">{t.language}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label={t.language}>
              {LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p>{t.demoNote}</p>
        </div>
      </aside>

      <main>
        <div className="page-head">
          <h1>{current.title}</h1>
          <p>{current.subtitle}</p>
        </div>

        {apiDown && <p className="notice error">{t.apiDown}</p>}

        {page === 'chat' && customer && (
          <div className="chat-layout">
            {/* The key resets the chat when the customer or the language changes. */}
            <Chat key={`${customer.id}-${language}`} customer={customer} onAnswered={loadAccount} />
            <AccountPanel customers={customers} customerId={customer.id} onSelect={selectCustomer} account={account} />
          </div>
        )}
        {page === 'approvals' && <Approvals />}
        {page === 'audit' && <Audit customerNames={customerNames} />}
        {page === 'metrics' && <Metrics />}
      </main>
    </div>
  )
}
