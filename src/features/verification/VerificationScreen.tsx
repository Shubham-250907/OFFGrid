import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export const VerificationScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Incident Verification</Text>
      <Text style={styles.notice}>
        Confidence is an evidence calculation based on proximity and time decay, not an absolute truth claim.
      </Text>
      <View style={styles.content}>
        <Text style={styles.emptyNotice}>Select an incident to view verification evidence.</Text>
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
  notice: {
    fontSize: typography.fontSizeSm,
    color: colors.textMuted,
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
