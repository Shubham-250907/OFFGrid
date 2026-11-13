import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export const TriageScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Need Help Triage</Text>
      <Text style={styles.subtitle}>
        Categorize urgent civilian needs or mark as SAFE.
      </Text>
      <View style={styles.content}>
        <Text style={styles.emptyNotice}>No active triage submissions.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md
  },
  title: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.md
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyNotice: {
    color: colors.textMuted,
    fontSize: typography.fontSizeMd
  }
});
