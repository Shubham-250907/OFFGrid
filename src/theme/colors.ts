export const colors = {
  background: '#0B0F19',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  border: '#475569',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  
  // Emergency action colors
  danger: '#EF4444',
  dangerDark: '#991B1B',
  warning: '#F59E0B',
  warningDark: '#B45309',
  success: '#10B981',
  successDark: '#047857',
  info: '#3B82F6',
  infoDark: '#1D4ED8',

  // Status badges
  badgeUnverified: '#64748B',
  badgeHighConfidence: '#10B981',
  badgeDisputed: '#EF4444'
} as const;

export type ColorName = keyof typeof colors;
