import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'en' | 'pt' | 'es'

export const LANGUAGES: { code: Language; label: string; locale: string }[] = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'pt', label: 'Português', locale: 'pt-BR' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
]

const en = {
  brandTagline: 'Support console',
  navChat: 'Customer chat',
  navApprovals: 'Refund approvals',
  navAudit: 'Audit log',
  language: 'Language',
  demoNote: 'Demo with fictional data',
  apiDown: 'Could not reach the API. Is it running on port 3000?',
  loading: 'Loading…',
  requestFailed: 'Request failed',

  chatTitle: 'Customer chat',
  chatSubtitle: 'Talk to the agent as one of the sample customers.',
  assistantName: 'StreamBox Assistant',
  assistantStatus: 'AI agent · answers from your account and our policies',
  emptyGreeting: 'Hi {name}. Ask about your subscription, payments or StreamBox policies.',
  suggestions: [
    'What plan am I on?',
    'When was my last charge?',
    'I want a refund for my last charge',
    'What happens if I cancel today?',
  ],
  thinking: 'Thinking…',
  placeholder: 'Type your message',
  send: 'Send',
  newChat: 'New chat',
  toolCalls: 'Tool calls ({count})',
  toolError: 'error',
  statsCalls: 'Model calls: {count}',
  statsIn: '{count} tokens in',
  statsCached: '{count} cached',
  statsOut: '{count} out',

  accountTitle: 'Account',
  signedInAs: 'Signed in as',
  plan: 'Plan',
  noSubscription: 'No subscription',
  perMonth: '/month',
  perYear: '/year',
  accessUntil: 'Access until',
  renewsOn: 'Renews on',
  cancelScheduled: 'Cancellation scheduled',
  downgradeScheduled: 'Downgrade to {plan} scheduled',
  recentPayments: 'Recent payments',
  noPayments: 'No payments yet.',
  subscriptionStatus: {
    active: 'Active',
    past_due: 'Past due',
    suspended: 'Suspended',
    canceled: 'Canceled',
  },
  paymentStatus: { succeeded: 'Paid', failed: 'Failed', refunded: 'Refunded' },

  approvalsTitle: 'Refund approvals',
  approvalsSubtitle: 'Refunds above $50.00 wait here for a person to decide.',
  approvalsEmpty: 'No refund requests yet. Ask the agent for a refund as Bruno to create one.',
  colCustomer: 'Customer',
  colAmount: 'Amount',
  colReason: 'Reason',
  colRule: 'Rule',
  colStatus: 'Status',
  approve: 'Approve',
  reject: 'Reject',
  decidedBy: 'by {name}',
  refundStatus: {
    pending_approval: 'Waiting for approval',
    refunded: 'Refunded',
    rejected: 'Rejected',
  },
  refundRule: { within_window: 'Within 7 days', duplicate_charge: 'Duplicate charge' },

  auditTitle: 'Audit log',
  auditSubtitle: 'Every tool call the agent made and every human decision.',
  auditEmpty: 'Nothing recorded yet.',
  colWhen: 'When',
  colActor: 'Actor',
  colAction: 'Action',
  colDetails: 'Details',
  actor: { agent: 'Agent', human: 'Human' },
  inputAndResult: 'Input and result',
}

type Dictionary = typeof en

const pt: Dictionary = {
  brandTagline: 'Console de atendimento',
  navChat: 'Chat do cliente',
  navApprovals: 'Aprovação de reembolsos',
  navAudit: 'Auditoria',
  language: 'Idioma',
  demoNote: 'Demonstração com dados fictícios',
  apiDown: 'Não foi possível acessar a API. Ela está rodando na porta 3000?',
  loading: 'Carregando…',
  requestFailed: 'A requisição falhou',

  chatTitle: 'Chat do cliente',
  chatSubtitle: 'Converse com o agente como um dos clientes de exemplo.',
  assistantName: 'Assistente StreamBox',
  assistantStatus: 'Agente de IA · responde com base na sua conta e nas nossas políticas',
  emptyGreeting: 'Olá, {name}. Pergunte sobre sua assinatura, seus pagamentos ou as políticas da StreamBox.',
  suggestions: [
    'Qual é o meu plano?',
    'Quando foi minha última cobrança?',
    'Quero o reembolso da minha última cobrança',
    'O que acontece se eu cancelar hoje?',
  ],
  thinking: 'Pensando…',
  placeholder: 'Digite sua mensagem',
  send: 'Enviar',
  newChat: 'Nova conversa',
  toolCalls: 'Ferramentas chamadas ({count})',
  toolError: 'erro',
  statsCalls: 'Chamadas ao modelo: {count}',
  statsIn: '{count} tokens de entrada',
  statsCached: '{count} em cache',
  statsOut: '{count} de saída',

  accountTitle: 'Conta',
  signedInAs: 'Conectado como',
  plan: 'Plano',
  noSubscription: 'Sem assinatura',
  perMonth: '/mês',
  perYear: '/ano',
  accessUntil: 'Acesso até',
  renewsOn: 'Renova em',
  cancelScheduled: 'Cancelamento agendado',
  downgradeScheduled: 'Mudança para {plan} agendada',
  recentPayments: 'Pagamentos recentes',
  noPayments: 'Nenhum pagamento ainda.',
  subscriptionStatus: {
    active: 'Ativa',
    past_due: 'Em atraso',
    suspended: 'Suspensa',
    canceled: 'Cancelada',
  },
  paymentStatus: { succeeded: 'Pago', failed: 'Falhou', refunded: 'Reembolsado' },

  approvalsTitle: 'Aprovação de reembolsos',
  approvalsSubtitle: 'Reembolsos acima de $50.00 esperam aqui a decisão de uma pessoa.',
  approvalsEmpty: 'Nenhum pedido de reembolso ainda. Peça um reembolso ao agente como Bruno para criar um.',
  colCustomer: 'Cliente',
  colAmount: 'Valor',
  colReason: 'Motivo',
  colRule: 'Regra',
  colStatus: 'Situação',
  approve: 'Aprovar',
  reject: 'Recusar',
  decidedBy: 'por {name}',
  refundStatus: {
    pending_approval: 'Aguardando aprovação',
    refunded: 'Reembolsado',
    rejected: 'Recusado',
  },
  refundRule: { within_window: 'Dentro de 7 dias', duplicate_charge: 'Cobrança duplicada' },

  auditTitle: 'Auditoria',
  auditSubtitle: 'Cada ferramenta que o agente chamou e cada decisão humana.',
  auditEmpty: 'Nada registrado ainda.',
  colWhen: 'Quando',
  colActor: 'Autor',
  colAction: 'Ação',
  colDetails: 'Detalhes',
  actor: { agent: 'Agente', human: 'Humano' },
  inputAndResult: 'Entrada e resultado',
}

const es: Dictionary = {
  brandTagline: 'Consola de soporte',
  navChat: 'Chat del cliente',
  navApprovals: 'Aprobación de reembolsos',
  navAudit: 'Auditoría',
  language: 'Idioma',
  demoNote: 'Demostración con datos ficticios',
  apiDown: 'No se pudo acceder a la API. ¿Está funcionando en el puerto 3000?',
  loading: 'Cargando…',
  requestFailed: 'La solicitud falló',

  chatTitle: 'Chat del cliente',
  chatSubtitle: 'Habla con el agente como uno de los clientes de ejemplo.',
  assistantName: 'Asistente StreamBox',
  assistantStatus: 'Agente de IA · responde según tu cuenta y nuestras políticas',
  emptyGreeting: 'Hola, {name}. Pregunta sobre tu suscripción, tus pagos o las políticas de StreamBox.',
  suggestions: [
    '¿Cuál es mi plan?',
    '¿Cuándo fue mi último cobro?',
    'Quiero el reembolso de mi último cobro',
    '¿Qué pasa si cancelo hoy?',
  ],
  thinking: 'Pensando…',
  placeholder: 'Escribe tu mensaje',
  send: 'Enviar',
  newChat: 'Nueva conversación',
  toolCalls: 'Herramientas llamadas ({count})',
  toolError: 'error',
  statsCalls: 'Llamadas al modelo: {count}',
  statsIn: '{count} tokens de entrada',
  statsCached: '{count} en caché',
  statsOut: '{count} de salida',

  accountTitle: 'Cuenta',
  signedInAs: 'Conectado como',
  plan: 'Plan',
  noSubscription: 'Sin suscripción',
  perMonth: '/mes',
  perYear: '/año',
  accessUntil: 'Acceso hasta',
  renewsOn: 'Se renueva el',
  cancelScheduled: 'Cancelación programada',
  downgradeScheduled: 'Cambio a {plan} programado',
  recentPayments: 'Pagos recientes',
  noPayments: 'Aún no hay pagos.',
  subscriptionStatus: {
    active: 'Activa',
    past_due: 'Con atraso',
    suspended: 'Suspendida',
    canceled: 'Cancelada',
  },
  paymentStatus: { succeeded: 'Pagado', failed: 'Fallido', refunded: 'Reembolsado' },

  approvalsTitle: 'Aprobación de reembolsos',
  approvalsSubtitle: 'Los reembolsos superiores a $50.00 esperan aquí la decisión de una persona.',
  approvalsEmpty: 'Aún no hay solicitudes de reembolso. Pide un reembolso al agente como Bruno para crear una.',
  colCustomer: 'Cliente',
  colAmount: 'Importe',
  colReason: 'Motivo',
  colRule: 'Regla',
  colStatus: 'Estado',
  approve: 'Aprobar',
  reject: 'Rechazar',
  decidedBy: 'por {name}',
  refundStatus: {
    pending_approval: 'Esperando aprobación',
    refunded: 'Reembolsado',
    rejected: 'Rechazado',
  },
  refundRule: { within_window: 'Dentro de 7 días', duplicate_charge: 'Cobro duplicado' },

  auditTitle: 'Auditoría',
  auditSubtitle: 'Cada herramienta que llamó el agente y cada decisión humana.',
  auditEmpty: 'Aún no hay registros.',
  colWhen: 'Cuándo',
  colActor: 'Autor',
  colAction: 'Acción',
  colDetails: 'Detalles',
  actor: { agent: 'Agente', human: 'Humano' },
  inputAndResult: 'Entrada y resultado',
}

const DICTIONARIES: Record<Language, Dictionary> = { en, pt, es }
const STORAGE_KEY = 'streambox.language'

interface I18n {
  language: Language
  setLanguage: (language: Language) => void
  t: Dictionary
  /** Fills {placeholders} in a translated string. */
  fill: (template: string, values: Record<string, string | number>) => string
  money: (cents: number) => string
  date: (iso: string) => string
  dateTime: (iso: string) => string
  number: (value: number) => string
}

const I18nContext = createContext<I18n | null>(null)

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'pt' || saved === 'es') return saved
  } catch {
    // Storage can be unavailable (private windows); fall through to the browser language.
  }
  const browser = navigator.language.slice(0, 2)
  return browser === 'pt' || browser === 'es' ? browser : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Not being able to remember the choice is fine.
    }
  }, [language])

  const value = useMemo<I18n>(() => {
    const locale = LANGUAGES.find((l) => l.code === language)!.locale
    // Prices are in US dollars in every language; only the number format changes.
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' })
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' })
    const number = new Intl.NumberFormat(locale)
    return {
      language,
      setLanguage,
      t: DICTIONARIES[language],
      fill: (template, values) =>
        template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? '')),
      money: (cents) => money.format(cents / 100),
      date: (iso) => date.format(new Date(iso)),
      dateTime: (iso) => dateTime.format(new Date(iso)),
      number: (n) => number.format(n),
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
