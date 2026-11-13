import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { ShelterStatus } from '../../mesh/protocol/contracts';
import { LIMITS } from '../../shared/constants/config';
import { ShelterProjection } from '../../data/projections';
import { haversineDistance } from '../../domain/algorithms/haversine';

interface ShelterScreenProps {
  onSelectShelter?: (shelterId: string) => void;
}

const SHELTER_STATUSES: ShelterStatus[] = [
  'OPEN',
  'FULL',
  'MEDICAL_AID_AVAILABLE',
  'CLOSED',
  'UNKNOWN'
];

export const ShelterScreen: React.FC<ShelterScreenProps> = ({ onSelectShelter }) => {
  const { services, identity, currentLocation, refreshCounter, triggerRefresh } = useApp();

  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');
  const [shelters, setShelters] = useState<ShelterProjection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [capacity, setCapacity] = useState<string>('');
  const [status, setStatus] = useState<ShelterStatus>('OPEN');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadShelters = useCallback(async () => {
    if (!services) return;
    setIsLoading(true);

    try {
      const all = await services.shelterService.getAllShelters();
      setShelters(all);
    } catch (err) {
      console.warn('Failed to load shelters', err);
    } finally {
      setIsLoading(false);
    }
  }, [services]);

  useEffect(() => {
    loadShelters();
  }, [loadShelters, refreshCounter]);

  const handleCreateShelter = async () => {
    if (!services || !identity) return;

    if (!currentLocation || currentLocation.status !== 'AVAILABLE') {
      setErrorNotice('Valid GPS coordinates required to register a shelter');
      return;
    }

    if (currentLocation.isMock) {
      setErrorNotice('Mock GPS detected; shelter registration rejected by policy');
      return;
    }

    setIsSubmitting(true);
    setErrorNotice(null);

    try {
      const parsedCapacity = capacity ? parseInt(capacity, 10) : undefined;
      await services.shelterService.createShelter(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          capacity: parsedCapacity,
          status,
          location: currentLocation
        },
        identity
      );

      triggerRefresh();
      setName('');
      setDescription('');
      setCapacity('');
      setActiveTab('LIST');
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to register shelter');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderShelterCard = ({ item }: { item: ShelterProjection }) => {
    let badgeColor: string = colors.info;
    if (item.currentStatus === 'OPEN') badgeColor = colors.success;
    else if (item.currentStatus === 'FULL') badgeColor = colors.warning;
    else if (item.currentStatus === 'CLOSED') badgeColor = colors.danger;

    let distLabel = 'Distance unavailable';
    if (currentLocation?.latitude && currentLocation?.longitude) {
      const meters = haversineDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        item.latitude,
        item.longitude
      );
      distLabel = meters < 1000 ? `${Math.round(meters)}m away` : `${(meters / 1000).toFixed(1)}km away`;
    }

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onSelectShelter && onSelectShelter(item.shelterId)}
        accessibilityRole="button"
        accessibilityLabel={`Shelter: ${item.name}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{item.currentStatus}</Text>
          </View>
        </View>

        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.capacityText}>
            Capacity: {item.capacity !== undefined ? `${item.capacity} people` : 'Unspecified'}
          </Text>
          <Text style={styles.distanceText}>{distLabel}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Emergency Shelters</Text>
        <Text style={styles.subtitle}>
          Locate safe shelters and broadcast status updates across peer devices.
        </Text>
      </View>

      {/* Mode Toggle */}
      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'LIST' && styles.activeToggleBtn]}
          onPress={() => setActiveTab('LIST')}
          accessibilityRole="tab"
          accessibilityLabel="Shelter Directory"
        >
          <Text style={[styles.toggleBtnText, activeTab === 'LIST' && styles.activeToggleBtnText]}>
            Shelters ({shelters.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'CREATE' && styles.activeToggleBtn]}
          onPress={() => setActiveTab('CREATE')}
          accessibilityRole="tab"
          accessibilityLabel="Register Shelter"
        >
          <Text style={[styles.toggleBtnText, activeTab === 'CREATE' && styles.activeToggleBtnText]}>
            + Register Shelter
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'CREATE' ? (
        <ScrollView contentContainerStyle={styles.formContent}>
          <View style={styles.formGroup}>
            <View style={styles.labelCountRow}>
              <Text style={styles.label}>Shelter Name *</Text>
              <Text style={styles.charCount}>
                {name.length}/{LIMITS.MAX_SHELTER_NAME_CHARS}
              </Text>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. St. Jude High School Gymnasium"
              placeholderTextColor={colors.textMuted}
              maxLength={LIMITS.MAX_SHELTER_NAME_CHARS}
              value={name}
              onChangeText={setName}
              accessibilityLabel="Shelter Name"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Initial Status</Text>
            <View style={styles.statusRow}>
              {SHELTER_STATUSES.map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusOption, status === st && styles.activeStatusOption]}
                  onPress={() => setStatus(st)}
                  accessibilityRole="button"
                  accessibilityLabel={st}
                >
                  <Text style={[styles.statusOptionText, status === st && styles.activeStatusOptionText]}>
                    {st.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Total Capacity (Estimated people, optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 250"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={capacity}
              onChangeText={setCapacity}
              accessibilityLabel="Capacity"
            />
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelCountRow}>
              <Text style={styles.label}>Description & Facilities (Optional)</Text>
              <Text style={styles.charCount}>
                {description.length}/{LIMITS.MAX_DESCRIPTION_CHARS}
              </Text>
            </View>
            <TextInput
              style={styles.textArea}
              placeholder="e.g. Heated shelter, backup generator, water filters available..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={LIMITS.MAX_DESCRIPTION_CHARS}
              value={description}
              onChangeText={setDescription}
              accessibilityLabel="Description"
            />
          </View>

          {errorNotice && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorNotice}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, (!name.trim() || isSubmitting) && styles.disabledButton]}
            onPress={handleCreateShelter}
            disabled={!name.trim() || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Register Shelter"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>REGISTER SHELTER (PRIORITY 6)</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.listContainer}>
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={colors.info} />
            </View>
          ) : shelters.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={styles.emptyTitle}>Zero Shelter Records</Text>
              <Text style={styles.emptySubtitle}>
                No emergency shelter locations stored in the local SQLite ledger.
              </Text>
            </View>
          ) : (
            <FlatList
              data={shelters}
              keyExtractor={(item) => item.shelterId}
              renderItem={renderShelterCard}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      )}
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
    marginBottom: spacing.sm
  },
  title: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: 2
  },
  subtitle: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary
  },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 2,
    marginBottom: spacing.md
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 4
  },
  activeToggleBtn: {
    backgroundColor: colors.surfaceElevated
  },
  toggleBtnText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeToggleBtnText: {
    color: colors.textPrimary
  },
  formContent: {
    paddingBottom: spacing.xxl
  },
  formGroup: {
    marginBottom: spacing.md
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  labelCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  charCount: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  textInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 48,
    fontSize: typography.fontSizeSm
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  statusOption: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: 'center'
  },
  activeStatusOption: {
    backgroundColor: colors.surfaceElevated,
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
  textArea: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: typography.fontSizeSm
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
  submitButton: {
    backgroundColor: colors.info,
    minHeight: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledButton: {
    opacity: 0.4
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeMd,
    letterSpacing: 1
  },
  listContainer: {
    flex: 1
  },
  listContent: {
    paddingBottom: spacing.md
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    flex: 1,
    marginRight: spacing.sm
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.sm
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  capacityText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  distanceText: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.sm
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizeSm,
    textAlign: 'center'
  }
});
