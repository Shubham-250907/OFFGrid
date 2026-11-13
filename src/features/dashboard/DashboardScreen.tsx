import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface DashboardScreenProps {
  onOpenSos?: () => void;
  onOpenReport?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenSos,
  onOpenReport
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandTitle}>OFFGRID</Text>
        <View style={styles.meshBadge}>
          <Text style={styles.meshText}>MESH: SEARCHING</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <Text style={styles.mapPlaceholderTitle}>LOCAL OFFLINE MAP</Text>
        <Text style={styles.mapPlaceholderSubtitle}>
          Incident / SOS / Shelter markers (SQLite projections)
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={onOpenReport}
          accessibilityLabel="Create report"
        >
          <Text style={styles.createButtonText}>+ Create Report</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.sosButton}
        onPress={onOpenSos}
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS Button"
      >
        <Text style={styles.sosButtonText}>[ SEND SOS ]</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md
  },
  brandTitle: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightHeavy,
    color: colors.textPrimary
  },
  meshBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4
  },
  meshText: {
    fontSize: typography.fontSizeXs,
    color: colors.warning,
    fontWeight: typography.fontWeightBold
  },
  mapContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  mapPlaceholderTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  mapPlaceholderSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  createButton: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center'
  },
  createButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightMedium
  },
  sosButton: {
    backgroundColor: colors.danger,
    minHeight: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightHeavy,
    letterSpacing: 1.5
  }
});
