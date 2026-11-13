import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { ShelterProjection } from '../../data/projections';
import { ShelterUpdateProjection } from '../../data/repositories/ShelterRepository';
import { ShelterStatus } from '../../mesh/protocol/contracts';
import { haversineDistance } from '../../domain/algorithms/haversine';
import { LIMITS } from '../../shared/constants/config';

interface ShelterDetailScreenProps {
  shelterId: string;
  onBack: () => void;
}

const SHELTER_STATUSES: ShelterStatus[] = [
  'OPEN',
  'FULL',
  'MEDICAL_AID_AVAILABLE',
  'CLOSED',
  'UNKNOWN'
];

export const ShelterDetailScreen: React.FC<ShelterDetailScreenProps> = ({
  shelterId,
  onBack
}) => {
  const { services, identity, currentLocation, triggerRefresh } = useApp();

  const [shelter, setShelter] = useState<ShelterProjection | null>(null);
  const [updates, setUpdates] = useState<ShelterUpdateProjection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Update Form State
  const [newStatus, setNewStatus] = useState<ShelterStatus>('OPEN');
  const [availableCapacity, setAvailableCapacity] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!services) return;
    setIsLoading(true);

    try {
      const sh = await services.shelterService.getShelterById(shelterId);
      setShelter(sh);
      if (sh) setNewStatus(sh.currentStatus as ShelterStatus);

      const updateHistory = await services.shelterService.getShelterUpdates(shelterId);
      setUpdates(updateHistory);
    } catch (err) {
      console.warn('Failed to load shelter detail', err);
    } finally {
      setIsLoading(false);
    }
  }, [services, shelterId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateStatus = async () => {
    if (!services || !identity || !shelter) return;

    if (!currentLocation || currentLocation.status !== 'AVAILABLE') {
      setUpdateError('Valid GPS coordinates required to broadcast shelter status update');
      return;
    }

    if (currentLocation.isMock) {
      setUpdateError('Mock location provider detected; shelter update rejected');
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const parsedCapacity = availableCapacity ? parseInt(availableCapacity, 10) : undefined;
      await services.shelterService.updateShelterStatus(
        {
          shelterId,
          status: newStatus,
          availableCapacity: parsedCapacity,
          note: note.trim() || undefined,
          location: currentLocation
        },
        identity
      );

      triggerRefresh();
      setNote('');
      setAvailableCapacity('');
      await loadData();
    } catch (err: any) {
      setUpdateError(err?.message ?? 'Failed to update shelter');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.info} />
        <Text style={styles.loadingText}>Loading shelter status ledger...</Text>
      </View>
    );
  }

  if (!shelter) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Shelter Not Found</Text>
        <Text style={styles.errorSubtitle}>Record does not exist in local SQLite store.</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Return to Shelters</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let distLabel = 'Distance unavailable';
  if (currentLocation?.latitude && currentLocation?.longitude) {
    const meters = haversineDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      shelter.latitude,
      shelter.longitude
    );
    distLabel = meters < 1000 ? `${Math.round(meters)}m away` : `${(meters / 1000).toFixed(1)}km away`;
  }

  let badgeColor: string = colors.info;
  if (shelter.currentStatus === 'OPEN') badgeColor = colors.success;
  else if (shelter.currentStatus === 'FULL') badgeColor = colors.warning;
  else if (shelter.currentStatus === 'CLOSED') badgeColor = colors.danger;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backPill} onPress={onBack}>
          <Text style={styles.backPillText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {shelter.name}
        </Text>
      </View>

      {/* Main Info Card */}
      <View style={styles.mainCard}>
        <View style={styles.statusRow}>
          <Text style={styles.currentStatusLabel}>CURRENT STATUS:</Text>
          <View style={[styles.badgeContainer, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{shelter.currentStatus}</Text>
          </View>
        </View>

        <Text style={styles.descriptionText}>
          {shelter.description ?? 'Emergency shelter facility.'}
        </Text>

        <View style={styles.metaBox}>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Distance: </Text>
            <Text style={styles.metaValue}>{distLabel}</Text>
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Total Capacity: </Text>
            <Text style={styles.metaValue}>
              {shelter.capacity !== undefined ? `${shelter.capacity} people` : 'Unspecified'}
            </Text>
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>GPS Coordinates: </Text>
            <Text style={styles.metaValue}>
              {shelter.latitude.toFixed(5)}, {shelter.longitude.toFixed(5)} (±
              {Math.round(shelter.accuracyM)}m)
            </Text>
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Registered: </Text>
            <Text style={styles.metaValue}>{new Date(shelter.createdAt).toLocaleString()}</Text>
          </Text>
        </View>
      </View>

      {/* Status Update Form */}
      <View style={styles.updateCard}>
        <Text style={styles.sectionHeading}>BROADCAST STATUS UPDATE</Text>
        <Text style={styles.updateDescription}>
          Append a signed SHELTER_UPDATE event. Current status is deterministically projected from the
          latest valid update by (authorTimestamp, eventId).
        </Text>

        <Text style={styles.subHeading}>Change Status to:</Text>
        <View style={styles.statusGrid}>
          {SHELTER_STATUSES.map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.statusOption, newStatus === st && styles.activeStatusOption]}
              onPress={() => setNewStatus(st)}
              accessibilityRole="button"
              accessibilityLabel={st}
            >
              <Text style={[styles.statusOptionText, newStatus === st && styles.activeStatusOptionText]}>
                {st.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.subHeading}>Available Remaining Capacity (Optional):</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 45"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={availableCapacity}
          onChangeText={setAvailableCapacity}
          accessibilityLabel="Available Capacity"
        />

        <Text style={styles.subHeading}>Update Note (Optional):</Text>
        <TextInput
          style={styles.textArea}
          placeholder="e.g. Red Cross volunteers arrived with 50 meal rations..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={LIMITS.MAX_DESCRIPTION_CHARS}
          value={note}
          onChangeText={setNote}
          accessibilityLabel="Status Note"
        />

        {updateError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{updateError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.updateButton, isUpdating && styles.disabledButton]}
          onPress={handleUpdateStatus}
          disabled={isUpdating}
          accessibilityRole="button"
          accessibilityLabel="Broadcast Shelter Update"
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.updateButtonText}>BROADCAST STATUS UPDATE (PRIORITY 7)</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Chronological History of Updates */}
      <View style={styles.historyCard}>
        <Text style={styles.sectionHeading}>STATUS UPDATE HISTORY ({updates.length})</Text>
        {updates.length === 0 ? (
          <Text style={styles.noUpdatesText}>
            No updates broadcast yet. Initial status: {shelter.initialStatus}
          </Text>
        ) : (
          updates.map((up) => (
            <View key={up.updateId} style={styles.historyItem}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyStatus}>{up.status}</Text>
                <Text style={styles.historyTime}>
                  {new Date(up.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {up.availableCapacity !== undefined && (
                <Text style={styles.historyCapacity}>
                  Available Capacity: {up.availableCapacity}
                </Text>
              )}
              {up.note ? <Text style={styles.historyNote}>{up.note}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginTop: spacing.md
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  errorSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  backButton: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6
  },
  backButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md
  },
  backPill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    minHeight: 36,
    justifyContent: 'center'
  },
  backPillText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold,
    flex: 1
  },
  mainCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  currentStatusLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  badgeContainer: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeXs
  },
  descriptionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    lineHeight: 22,
    marginBottom: spacing.md
  },
  metaBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6,
    gap: 4
  },
  metaItem: {
    fontSize: typography.fontSizeXs
  },
  metaLabel: {
    color: colors.textMuted,
    fontWeight: typography.fontWeightBold
  },
  metaValue: {
    color: colors.textSecondary
  },
  updateCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  sectionHeading: {
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs
  },
  updateDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    lineHeight: 18,
    marginBottom: spacing.md
  },
  subHeading: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md
  },
  statusOption: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: 'center'
  },
  activeStatusOption: {
    borderColor: colors.info,
    borderWidth: 2
  },
  statusOptionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  activeStatusOptionText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold
  },
  textInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 44,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.md
  },
  textArea: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.md
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.md
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  updateButton: {
    backgroundColor: colors.info,
    minHeight: 52,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledButton: {
    opacity: 0.5
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeMd,
    letterSpacing: 1
  },
  historyCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  noUpdatesText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeSm,
    fontStyle: 'italic',
    marginTop: spacing.xs
  },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2
  },
  historyStatus: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold
  },
  historyTime: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  historyCapacity: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    marginBottom: 2
  },
  historyNote: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs
  }
});
