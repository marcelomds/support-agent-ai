const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** StreamBox mark: a play triangle inside a rounded box. */
export const Logo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M9.5 7.6v8.8a.6.6 0 0 0 .92.5l6.9-4.4a.6.6 0 0 0 0-1l-6.9-4.4a.6.6 0 0 0-.92.5Z" />
  </svg>
)

export const ChatIcon = () => (
  <svg {...base}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />
  </svg>
)

export const ApprovalIcon = () => (
  <svg {...base}>
    <path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 9.6 4.1-1.300 7-5.200 7-9.600V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const AuditIcon = () => (
  <svg {...base}>
    <path d="M8 4h8a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2Z" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </svg>
)

export const MetricsIcon = () => (
  <svg {...base}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </svg>
)

export const GlobeIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.500 2.700 2.500 15.300 0 18M12 3c-2.500 2.700-2.500 15.300 0 18" />
  </svg>
)

export const SendIcon = () => (
  <svg {...base}>
    <path d="M5 12h13M12 6l6 6-6 6" />
  </svg>
)
