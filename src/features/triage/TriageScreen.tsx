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
import { TriagePayload } from '../../mesh/protocol/contracts';
import { LIMITS } from '../../shared/constants/config';
import { TriageProjection } from '../../data/repositories/TriageRepository';
import { haversineDistance } from '../../domain/algorithms/haversine';

const CATEGORIES: Array<{
  key: TriagePayload['category'];
  label: string;
  isSafe?: boolean;
}> = [
  { key: 'MEDICAL', label: 'Medical Assistance Needed' },
  { key: 'TRAPPED', label: 'Trapped / Evacuation Needed' },
  { key: 'FOOD_WATER', label: 'Food / Drinking Water Needed' },
  { key: 'SAFE', label: 'I Am Safe & Unharmed', isSafe: true }
];

export const TriageScreen: React.FC = () => {
  const { services, identity, currentLocation, refreshCounter, triggerRefresh } = useApp();

  const [activeTab, setActiveTab] = useState<'FEED' | 'SUBMIT'>('FEED');
  const [filter, setFilter] = useState<string>('ALL');
  const [triageList, setTriageList] = useState<TriageProjection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [category, setCategory] = useState<TriagePayload['category']>('MEDICAL');
  const [headcount, setHeadcount] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadTriage = useCallback(async () => {
    if (!services) return;
    setIsLoading(true);

    try {
      const all = await services.triageService.getAllTriage();
      setTriageList(all);
    } catch (err) {
      console.warn('Failed to load triage items', err);
    } finally {
      setIsLoading(false);
    }
  }, [services]);

  useEffect(() => {
    loadTriage();
  }, [loadTriage, refreshCounter]);

  const handleSubmit = async () => {
    if (!services || !identity) return;

    setIsSubmitting(true);
    setErrorNotice(null);

    try {
      await services.triageService.submitTriage(
        {
          category,
          headcount,
          description: description.trim() || undefined,
          location: currentLocation
        },
        identity
      );

      triggerRefresh();
      setDescription('');
      setActiveTab('FEED');
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to submit triage request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTriage = triageList.filter((item) => {
    if (filter === 'ALL') return true;
    return item.category === filter;
  });

  const renderTriageCard = ({ item }: { item: TriageProjection }) => {
    const isSafe = item.category === 'SAFE';

    let distLabel = 'Location unavailable';
    if (currentLocation?.latitude && currentLocation?.longitude && item.latitude && item.longitude) {
      const meters = haversineDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        item.latitude,
        item.longitude
      );
      distLabel = meters < 1000 ? `${Math.round(meters)}m away` : `${(meters / 1000).toFixed(1)}km away`;
    }

    return (
      <View style={[styles.triageCard, isSafe && styles.safeCard]}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, isSafe ? styles.safeBadge : styles.urgentBadge]}>
            <Text style={styles.badgeText}>
              {isSafe ? '✓ SAFE & UNHARMED' : `AID: ${item.category}`}
            </Text>
          </View>
          <Text style={styles.headcountTag}>
            Headcount: {item.headcount} {item.headcount === 1 ? 'person' : 'people'}
          </Text>
        </View>

        {item.description ? (
          <Text style={styles.triageDescription}>{item.description}</Text>
        ) : isSafe ? (
          <Text style={styles.safeNotice}>User reported safe; not an active request for aid.</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.distanceText}>{distLabel}</Text>
          <Text style={styles.timeText}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Need Help / Triage</Text>
        <Text style={styles.subtitle}>
          Humanitarian triage coordination and safe status reporting.
        </Text>
      </View>

      {/* Mode Toggle Bar */}
      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'FEED' && styles.activeToggleButton]}
          onPress={() => setActiveTab('FEED')}
          accessibilityRole="tab"
          accessibilityLabel="Triage Feed"
        >
          <Text style={[styles.toggleText, activeTab === 'FEED' && styles.activeToggleText]}>
            Active Triage Queue ({triageList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'SUBMIT' && styles.activeToggleButton]}
          onPress={() => setActiveTab('SUBMIT')}
          accessibilityRole="tab"
          accessibilityLabel="Submit Triage"
        >
          <Text style={[styles.toggleText, activeTab === 'SUBMIT' && styles.activeToggleText]}>
            + Request Aid / Mark Safe
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'SUBMIT' ? (
        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={styles.sectionHeading}>TRIAGE CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.categoryOption,
                  category === c.key && styles.activeCategoryOption,
                  c.isSafe && styles.safeOption
                ]}
                onPress={() => setCategory(c.key)}
                accessibilityRole="button"
                accessibilityLabel={c.label}
              >
                <Text
                  style={[
                    styles.categoryOptionText,
                    category === c.key && styles.activeCategoryOptionText,
                    c.isSafe && styles.safeOptionText
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionHeading}>HEADCOUNT (NUMBER OF PEOPLE)</Text>
          <View style={styles.headcountRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setHeadcount((p) => Math.max(1, p - 1))}
              accessibilityRole="button"
              accessibilityLabel="Decrease headcount"
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>

            <Text style={styles.headcountValue}>{headcount}</Text>

            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setHeadcount((p) => Math.min(1000, p + 1))}
              accessibilityRole="button"
              accessibilityLabel="Increase headcount"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.labelCountRow}>
            <Text style={styles.sectionHeading}>ADDITIONAL DETAILS (OPTIONAL)</Text>
            <Text style={styles.charCount}>
              {description.length}/{LIMITS.MAX_DESCRIPTION_CHARS}
            </Text>
          </View>
          <TextInput
            style={styles.textArea}
            placeholder="e.g. Diabetics need insulin, elderly requires stretcher..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={LIMITS.MAX_DESCRIPTION_CHARS}
            value={description}
            onChangeText={setDescription}
            accessibilityLabel="Triage Details"
          />

          {errorNotice && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorNotice}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Broadcast Triage Event"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {category === 'SAFE' ? 'BROADCAST SAFE STATUS' : 'BROADCAST TRIAGE REQUEST'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.feedContainer}>
          {/* Filter Pills */}
          <View style={styles.filterRow}>
            {['ALL', 'MEDICAL', 'TRAPPED', 'FOOD_WATER', 'SAFE'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, filter === f && styles.activeFilterPill]}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${f}`}
              >
                <Text style={[styles.filterPillText, filter === f && styles.activeFilterPillText]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={colors.info} />
            </View>
          ) : filteredTriage.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Zero Triage Records</Text>
              <Text style={styles.emptySubtitle}>
                No active triage requests or safe declarations stored in local SQLite ledger.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredTriage}
              keyExtractor={(item) => item.triageId}
              renderItem={renderTriageCard}
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
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 4
  },
  activeToggleButton: {
    backgroundColor: colors.surfaceElevated
  },
  toggleText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeToggleText: {
    color: colors.textPrimary
  },
  formContent: {
    paddingBottom: spacing.xxl
  },
  sectionHeading: {
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs
  },
  categoryGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  categoryOption: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center'
  },
  activeCategoryOption: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.info,
    borderWidth: 2
  },
  categoryOptionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium
  },
  activeCategoryOptionText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold
  },
  safeOption: {
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  safeOptionText: {
    color: colors.success
  },
  headcountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md
  },
  stepperBtn: {
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
  labelCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  charCount: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  textArea: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
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
  submitButton: {
    backgroundColor: colors.info,
    minHeight: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledButton: {
    opacity: 0.5
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeMd,
    letterSpacing: 1
  },
  feedContainer: {
    flex: 1
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm
  },
  filterPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.surface
  },
  activeFilterPill: {
    backgroundColor: colors.surfaceElevated
  },
  filterPillText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeFilterPillText: {
    color: colors.info
  },
  listContent: {
    paddingBottom: spacing.md
  },
  triageCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm
  },
  safeCard: {
    borderColor: colors.success
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4
  },
  urgentBadge: {
    backgroundColor: colors.warningDark
  },
  safeBadge: {
    backgroundColor: colors.successDark
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  headcountTag: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  triageDescription: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.sm
  },
  safeNotice: {
    color: colors.success,
    fontSize: typography.fontSizeXs,
    marginBottom: spacing.sm
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  distanceText: {
    color: colors.info,
    fontSize: typography.fontSizeXs
  },
  timeText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
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
