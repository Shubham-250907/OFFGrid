import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export const ShelterDetailScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shelter Status & History</Text>
      <View style={styles.content}>
        <Text style={styles.emptyNotice}>No shelter selected.</Text>
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
