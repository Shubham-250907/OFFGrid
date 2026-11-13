import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { LIMITS } from '../../shared/constants/config';
import { SosProjection } from '../../data/repositories/SosRepository';

interface SosModalProps {
  visible: boolean;
  onCancel: () => void;
  onSosCreated?: () => void;
}

export const SosModal: React.FC<SosModalProps> = ({
  visible,
  onCancel,
  onSosCreated
}) => {
  const {
    services,
    identity,
    currentLocation,
    batteryLevel,
    refreshLocation,
    triggerRefresh
  } = useApp();

  const [headcount, setHeadcount] = useState<number>(1);
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [activeUserSos, setActiveUserSos] = useState<SosProjection | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  // Check if current device already has an active SOS
  useEffect(() => {
    let active = true;
    async function checkExisting() {
      if (!services || !visible) return;
      try {
        const activeList = await services.sosService.getActiveSos();
        if (!active) return;
        if (activeList.length > 0) {
          // If any SOS is active
          setActiveUserSos(activeList[0] ?? null);
        } else {
          setActiveUserSos(null);
        }
      } catch {
        // Ignore
      }
    }
    checkExisting();
    return () => {
      active = false;
    };
  }, [services, visible]);

  const handleConfirm = async () => {
    if (!services || !identity) return;

    setIsSubmitting(true);
    setErrorNotice(null);

    try {
      // 1. Try refreshing GPS (without blocking if it fails or is unavailable)
      let freshLoc = currentLocation;
      try {
        freshLoc = await refreshLocation();
      } catch {
        // Allow locationless SOS per Section 10.1 & 12.1
      }

      // 2. Create signed SOS distress
      await services.sosService.createSos(
        {
          headcount,
          message: message.trim() || undefined,
          location: freshLoc,
          batteryLevel
        },
        identity
      );

      triggerRefresh();
      if (onSosCreated) onSosCreated();
      onCancel();
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to broadcast SOS');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveSos = async () => {
    if (!services || !identity || !activeUserSos) return;

    setIsResolving(true);
    setErrorNotice(null);

    try {
      await services.sosService.resolveSos(activeUserSos.sosId, identity);
      setActiveUserSos(null);
      triggerRefresh();
      onCancel();
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to resolve SOS');
    } finally {
      setIsResolving(false);
    }
  };

  const gpsSummary = () => {
    if (!currentLocation) return 'Location: Acquiring GPS signal...';
    if (currentLocation.isMock) return 'Location: Mock GPS detected (Excluded)';
    if (currentLocation.status === 'AVAILABLE' && currentLocation.accuracyM !== null) {
      return `Location: ±${Math.round(currentLocation.accuracyM)}m (${currentLocation.latitude?.toFixed(4)}, ${currentLocation.longitude?.toFixed(4)})`;
    }
    return 'Location: Unavailable (Proceeding locationless)';
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>EMERGENCY SOS DISTRESS</Text>
            <Text style={styles.warningDescription}>
              This broadcasts an urgent life-safety beacon over nearby peer radios.
              No internet or cellular connectivity is required.
            </Text>

            {/* Active SOS Banner if already active */}
            {activeUserSos && (
              <View style={styles.activeSosBanner}>
                <Text style={styles.activeSosTitle}>⚠️ ACTIVE SOS IN PROGRESS</Text>
                <Text style={styles.activeSosDetails}>
                  Headcount: {activeUserSos.headcount} | Battery: {activeUserSos.batteryLevel}%
                </Text>
                <TouchableOpacity
                  style={styles.resolveButton}
                  onPress={handleResolveSos}
                  disabled={isResolving}
                  accessibilityRole="button"
                  accessibilityLabel="Resolve SOS"
                >
                  {isResolving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.resolveButtonText}>I AM SAFE — RESOLVE SOS</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Live Sensors Status */}
            <View style={styles.metadataBox}>
              <Text style={styles.metaRow}>
                <Text style={styles.metaLabel}>GPS: </Text>
                <Text style={styles.metaValue}>{gpsSummary()}</Text>
              </Text>
              <Text style={styles.metaRow}>
                <Text style={styles.metaLabel}>Battery: </Text>
                <Text style={styles.metaValue}>{batteryLevel}%</Text>
              </Text>
              <Text style={styles.metaRow}>
                <Text style={styles.metaLabel}>Persistence: </Text>
                <Text style={styles.metaValue}>Saved to SQLite before radio broadcast</Text>
              </Text>
              <Text style={styles.metaRow}>
                <Text style={styles.metaLabel}>Priority: </Text>
                <Text style={styles.metaValue}>10 (Highest radio priority)</Text>
              </Text>
            </View>

            {/* Headcount Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Number of People in Need of Rescue:</Text>
              <View style={styles.headcountRow}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setHeadcount((prev) => Math.max(1, prev - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease headcount"
                >
                  <Text style={styles.stepperText}>-</Text>
                </TouchableOpacity>

                <Text style={styles.headcountValue}>{headcount}</Text>

                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setHeadcount((prev) => Math.min(100, prev + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Increase headcount"
                >
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Optional Distress Message */}
            <View style={styles.inputGroup}>
              <View style={styles.labelCountRow}>
                <Text style={styles.inputLabel}>Distress Message (Optional):</Text>
                <Text style={styles.charCount}>
                  {message.length}/{LIMITS.MAX_SOS_MESSAGE_CHARS}
                </Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Trapped on roof due to rising water"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={LIMITS.MAX_SOS_MESSAGE_CHARS}
                value={message}
                onChangeText={setMessage}
                accessibilityLabel="Distress message"
              />
            </View>

            {errorNotice && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorNotice}</Text>
              </View>
            )}

            {/* Confirmation Button */}
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Confirm SOS Broadcast"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmText}>CONFIRM EMERGENCY SOS</Text>
              )}
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.danger
  },
  scrollContent: {
    paddingBottom: spacing.sm
  },
  title: {
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightHeavy,
    color: colors.danger,
    marginBottom: spacing.xs,
    textAlign: 'center',
    letterSpacing: 1.5
  },
  warningDescription: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 18
  },
  activeSosBanner: {
    backgroundColor: colors.dangerDark,
    padding: spacing.md,
    borderRadius: 6,
    marginBottom: spacing.md,
    alignItems: 'center'
  },
  activeSosTitle: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.xs
  },
  activeSosDetails: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    marginBottom: spacing.sm
  },
  resolveButton: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 4,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%'
  },
  resolveButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  },
  metadataBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  metaRow: {
    marginBottom: 4
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs
  },
  inputGroup: {
    marginBottom: spacing.md
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  labelCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  charCount: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  headcountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  stepperButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepperText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightBold
  },
  headcountValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold,
    minWidth: 40,
    textAlign: 'center'
  },
  textInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: typography.fontSizeSm
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: spacing.sm,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.md
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  confirmButton: {
    backgroundColor: colors.danger,
    minHeight: 56,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightHeavy,
    fontSize: typography.fontSizeMd,
    letterSpacing: 1.5
  },
  cancelButton: {
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium
  }
});
