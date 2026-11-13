import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export const ChatScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Local Radio Chat</Text>
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          NOTICE: Messages are broadcast or relayed via nearby mesh peers. Direct messages in MVP are not end-to-end encrypted.
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.emptyNotice}>No messages in local store.</Text>
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
  disclaimerBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    marginBottom: spacing.md
  },
  disclaimerText: {
    fontSize: typography.fontSizeXs,
    color: colors.warning
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
