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
  navMetrics: 'Metrics',
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
  actor: { agent: 'Agent', human: 'Human', customer: 'Customer' },
  inputAndResult: 'Input and result',

  cardTitle: 'Confirm this action',
  cardNothingYet: 'Nothing has changed yet.',
  cardConfirm: 'Confirm',
  cardCancel: 'Cancel',
  cardConfirmed: 'Confirmed',
  cardDeclined: 'Cancelled',
  cardReplaced: 'No longer valid',
  pressedConfirm: 'Pressed Confirm',
  pressedCancel: 'Pressed Cancel',
  cardRefundNow: 'Refund {amount} to your original payment method.',
  cardRefundReview: 'Send a refund request of {amount} for review by our team.',
  cardPlanNow: 'Change to {plan} now. Charged today: {amount}. New price: {price}.',
  cardPlanLater: 'Change to {plan} from {date}. New price: {price}.',
  cardCancelLater: 'Cancel the subscription. You keep access until {date}.',
  cardCancelNow: 'Cancel the subscription now.',

  metricsTitle: 'Metrics',
  metricsSubtitle: 'What the agent costs and how it behaves, across every conversation.',
  metricsEmpty: 'No answers recorded yet. Talk to the agent to see numbers here.',
  kpiAnswers: 'Answers',
  kpiCost: 'Total cost',
  kpiCostPerAnswer: 'Cost per answer',
  kpiLatency: 'Average time',
  kpiP95: '95% answered within',
  kpiCache: 'Input served from cache',
  kpiIncomplete: 'Did not finish normally',
  toolsUsed: 'Tools called',
  toolCallsLabel: 'calls',
  toolErrorsLabel: 'errors',
  confirmations: 'Confirmation cards',
  actionStatus: { pending: 'Waiting', confirmed: 'Confirmed', declined: 'Cancelled', superseded: 'Replaced', expired: 'Expired' },
  recentAnswers: 'Latest answers',
  colModelCalls: 'Model calls',
  colTokens: 'Tokens in / out',
  colCost: 'Cost',
  colTime: 'Time',

  homeEyebrow: 'AI support agent · demo',
  homeTitle: 'An agent that answers, acts and stays within the rules',
  homeLead: 'It answers customers from their own account and the company policies, prepares refunds, plan changes and cancellations, and only acts when the customer presses Confirm.',
  homeEnter: 'Open the console',
  homeBack: 'Back to the start',
  homeFeature1Title: 'Talks from real data',
  homeFeature1Text: 'Every fact comes from the account or the policies, looked up at the moment of the question.',
  homeFeature2Title: 'Rules it cannot bend',
  homeFeature2Text: 'Refund limits live in the code. Actions wait for a button press, and large refunds for a person.',
  homeFeature3Title: 'Everything on record',
  homeFeature3Text: 'Each tool call and each decision is written to an audit log you can read.',
  homeFeature4Title: 'Measured, not assumed',
  homeFeature4Text: 'Cost and time per answer, and a set of test conversations graded on every change.',
}

type Dictionary = typeof en

const pt: Dictionary = {
  brandTagline: 'Console de atendimento',
  navChat: 'Chat do cliente',
  navApprovals: 'Aprovação de reembolsos',
  navAudit: 'Auditoria',
  navMetrics: 'Métricas',
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
  actor: { agent: 'Agente', human: 'Humano', customer: 'Cliente' },
  inputAndResult: 'Entrada e resultado',

  cardTitle: 'Confirme esta ação',
  cardNothingYet: 'Nada foi alterado ainda.',
  cardConfirm: 'Confirmar',
  cardCancel: 'Cancelar',
  cardConfirmed: 'Confirmado',
  cardDeclined: 'Cancelado',
  cardReplaced: 'Não vale mais',
  pressedConfirm: 'Apertou Confirmar',
  pressedCancel: 'Apertou Cancelar',
  cardRefundNow: 'Reembolsar {amount} na forma de pagamento original.',
  cardRefundReview: 'Enviar um pedido de reembolso de {amount} para análise da nossa equipe.',
  cardPlanNow: 'Mudar para {plan} agora. Cobrança hoje: {amount}. Novo preço: {price}.',
  cardPlanLater: 'Mudar para {plan} a partir de {date}. Novo preço: {price}.',
  cardCancelLater: 'Cancelar a assinatura. Você mantém o acesso até {date}.',
  cardCancelNow: 'Cancelar a assinatura agora.',

  metricsTitle: 'Métricas',
  metricsSubtitle: 'Quanto o agente custa e como ele se comporta, somando todas as conversas.',
  metricsEmpty: 'Nenhuma resposta registrada ainda. Converse com o agente para ver os números aqui.',
  kpiAnswers: 'Respostas',
  kpiCost: 'Custo total',
  kpiCostPerAnswer: 'Custo por resposta',
  kpiLatency: 'Tempo médio',
  kpiP95: '95% respondidas em até',
  kpiCache: 'Entrada servida do cache',
  kpiIncomplete: 'Não terminaram normalmente',
  toolsUsed: 'Ferramentas chamadas',
  toolCallsLabel: 'chamadas',
  toolErrorsLabel: 'erros',
  confirmations: 'Cartões de confirmação',
  actionStatus: { pending: 'Aguardando', confirmed: 'Confirmados', declined: 'Cancelados', superseded: 'Substituídos', expired: 'Expirados' },
  recentAnswers: 'Últimas respostas',
  colModelCalls: 'Chamadas ao modelo',
  colTokens: 'Tokens entrada / saída',
  colCost: 'Custo',
  colTime: 'Tempo',

  homeEyebrow: 'Agente de atendimento com IA · demonstração',
  homeTitle: 'Um agente que responde, age e respeita as regras',
  homeLead: 'Ele responde ao cliente com base na conta dele e nas políticas da empresa, prepara reembolsos, trocas de plano e cancelamentos, e só age quando o cliente aperta Confirmar.',
  homeEnter: 'Abrir o console',
  homeBack: 'Voltar ao início',
  homeFeature1Title: 'Fala com dados reais',
  homeFeature1Text: 'Cada informação vem da conta ou das políticas, consultadas na hora da pergunta.',
  homeFeature2Title: 'Regras que ele não dobra',
  homeFeature2Text: 'Os limites de reembolso ficam no código. Ações esperam um botão, e reembolsos altos esperam uma pessoa.',
  homeFeature3Title: 'Tudo registrado',
  homeFeature3Text: 'Cada ferramenta chamada e cada decisão ficam num log de auditoria que você pode ler.',
  homeFeature4Title: 'Medido, não presumido',
  homeFeature4Text: 'Custo e tempo por resposta, e um conjunto de conversas de teste corrigidas a cada mudança.',
}

const es: Dictionary = {
  brandTagline: 'Consola de soporte',
  navChat: 'Chat del cliente',
  navApprovals: 'Aprobación de reembolsos',
  navAudit: 'Auditoría',
  navMetrics: 'Métricas',
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
  actor: { agent: 'Agente', human: 'Humano', customer: 'Cliente' },
  inputAndResult: 'Entrada y resultado',

  cardTitle: 'Confirma esta acción',
  cardNothingYet: 'Todavía no ha cambiado nada.',
  cardConfirm: 'Confirmar',
  cardCancel: 'Cancelar',
  cardConfirmed: 'Confirmado',
  cardDeclined: 'Cancelado',
  cardReplaced: 'Ya no es válido',
  pressedConfirm: 'Pulsó Confirmar',
  pressedCancel: 'Pulsó Cancelar',
  cardRefundNow: 'Reembolsar {amount} al método de pago original.',
  cardRefundReview: 'Enviar una solicitud de reembolso de {amount} para revisión de nuestro equipo.',
  cardPlanNow: 'Cambiar a {plan} ahora. Cobro hoy: {amount}. Nuevo precio: {price}.',
  cardPlanLater: 'Cambiar a {plan} a partir del {date}. Nuevo precio: {price}.',
  cardCancelLater: 'Cancelar la suscripción. Mantienes el acceso hasta el {date}.',
  cardCancelNow: 'Cancelar la suscripción ahora.',

  metricsTitle: 'Métricas',
  metricsSubtitle: 'Cuánto cuesta el agente y cómo se comporta, sumando todas las conversaciones.',
  metricsEmpty: 'Aún no hay respuestas registradas. Habla con el agente para ver los números aquí.',
  kpiAnswers: 'Respuestas',
  kpiCost: 'Coste total',
  kpiCostPerAnswer: 'Coste por respuesta',
  kpiLatency: 'Tiempo medio',
  kpiP95: '95% respondidas en menos de',
  kpiCache: 'Entrada servida desde caché',
  kpiIncomplete: 'No terminaron con normalidad',
  toolsUsed: 'Herramientas llamadas',
  toolCallsLabel: 'llamadas',
  toolErrorsLabel: 'errores',
  confirmations: 'Tarjetas de confirmación',
  actionStatus: { pending: 'En espera', confirmed: 'Confirmadas', declined: 'Canceladas', superseded: 'Sustituidas', expired: 'Caducadas' },
  recentAnswers: 'Últimas respuestas',
  colModelCalls: 'Llamadas al modelo',
  colTokens: 'Tokens entrada / salida',
  colCost: 'Coste',
  colTime: 'Tiempo',

  homeEyebrow: 'Agente de soporte con IA · demostración',
  homeTitle: 'Un agente que responde, actúa y respeta las reglas',
  homeLead: 'Responde al cliente a partir de su cuenta y de las políticas de la empresa, prepara reembolsos, cambios de plan y cancelaciones, y solo actúa cuando el cliente pulsa Confirmar.',
  homeEnter: 'Abrir la consola',
  homeBack: 'Volver al inicio',
  homeFeature1Title: 'Habla con datos reales',
  homeFeature1Text: 'Cada dato viene de la cuenta o de las políticas, consultadas en el momento de la pregunta.',
  homeFeature2Title: 'Reglas que no puede saltarse',
  homeFeature2Text: 'Los límites de reembolso están en el código. Las acciones esperan un botón, y los reembolsos altos, a una persona.',
  homeFeature3Title: 'Todo queda registrado',
  homeFeature3Text: 'Cada herramienta llamada y cada decisión quedan en un registro de auditoría que puedes leer.',
  homeFeature4Title: 'Medido, no supuesto',
  homeFeature4Text: 'Coste y tiempo por respuesta, y un conjunto de conversaciones de prueba corregidas en cada cambio.',
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
