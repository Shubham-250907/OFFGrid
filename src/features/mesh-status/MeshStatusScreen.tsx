import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export const MeshStatusScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Radio & Mesh Sync Status</Text>
      <View style={styles.card}>
        <Text style={styles.statusRow}>
          BLE Radio: <Text style={styles.statusActive}>Active Listening</Text>
        </Text>
        <Text style={styles.statusRow}>
          Connected Peers: <Text style={styles.statusValue}>0</Text>
        </Text>
        <Text style={styles.statusRow}>
          Sync State: <Text style={styles.statusValue}>Searching for nearby devices</Text>
        </Text>
        <Text style={styles.statusRow}>
          Last Peer Sync: <Text style={styles.statusValue}>None</Text>
        </Text>
      </View>
      <Text style={styles.note}>
        OFFGRID synchronizes opportunistically peer-to-peer. Delivery status reflects individual peer synchronization, not global network state.
      </Text>
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
    marginBottom: spacing.md
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  statusRow: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginVertical: 4
  },
  statusActive: {
    color: colors.success,
    fontWeight: typography.fontWeightBold
  },
  statusValue: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightMedium
  },
  note: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted,
    lineHeight: 18
  }
});
