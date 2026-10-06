// Piezas dentales (numeración FDI) y estados del odontograma.

export const DIENTES_SUPERIORES = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const DIENTES_INFERIORES = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

export const ESTADOS_INFO: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  Sano:       { label: 'Sano', color: 'var(--success-text)', bg: 'rgba(16, 185, 129, 0.1)', icon: '🟢' },
  Caries:     { label: 'Caries', color: 'var(--danger-text)', bg: 'rgba(239, 68, 68, 0.1)', icon: '🔴' },
  Corona:     { label: 'Corona', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.1)', icon: '👑' },
  Endodoncia: { label: 'Endodoncia', color: 'var(--diente-endodoncia)', bg: 'rgba(59, 130, 246, 0.1)', icon: '⚡' },
  Implante:   { label: 'Implante', color: 'var(--diente-implante)', bg: 'rgba(139, 92, 246, 0.1)', icon: '🔩' },
  Ausente:    { label: 'Ausente', color: 'var(--text-muted)', bg: 'rgba(100, 116, 139, 0.1)', icon: '❌' },
}
