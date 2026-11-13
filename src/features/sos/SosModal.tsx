import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface SosModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  locationStatus?: string;
  batteryLevel?: number;
}

export const SosModal: React.FC<SosModalProps> = ({
  visible,
  onConfirm,
  onCancel,
  locationStatus = 'SEARCHING',
  batteryLevel = 100
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>EMERGENCY SOS BROADCAST</Text>
          <Text style={styles.description}>
            This broadcasts an urgent distress event over nearby peer devices. No cellular or internet is required.
          </Text>

          <View style={styles.metadataBox}>
            <Text style={styles.metaLabel}>GPS Status: <Text style={styles.metaValue}>{locationStatus}</Text></Text>
            <Text style={styles.metaLabel}>Battery: <Text style={styles.metaValue}>{batteryLevel}%</Text></Text>
            <Text style={styles.metaLabel}>Status: <Text style={styles.metaValue}>Saved locally prior to broadcast</Text></Text>
          </View>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm SOS Broadcast"
          >
            <Text style={styles.confirmText}>CONFIRM SOS BROADCAST</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel SOS"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.danger
  },
  title: {
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightHeavy,
    color: colors.danger,
    marginBottom: spacing.sm,
    textAlign: 'center'
  },
  description: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 20
  },
  metadataBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 4,
    marginBottom: spacing.lg
  },
  metaLabel: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted,
    marginVertical: 2
  },
  metaValue: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightMedium
  },
  confirmButton: {
    backgroundColor: colors.danger,
    minHeight: spacing.minTouchTarget,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeMd
  },
  cancelButton: {
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm
  }
});
