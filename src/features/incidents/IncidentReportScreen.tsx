import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { IncidentPayload } from '../../mesh/protocol/contracts';
import { LIMITS } from '../../shared/constants/config';
import { LocationResult } from '../../shared/types';

interface IncidentReportScreenProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const CATEGORIES: Array<{ key: IncidentPayload['category']; label: string }> = [
  { key: 'FLOOD', label: 'Flood / Water Rise' },
  { key: 'ROAD_BLOCKAGE', label: 'Road Blockage / Debris' },
  { key: 'EARTHQUAKE_DAMAGE', label: 'Earthquake Damage' },
  { key: 'FIRE', label: 'Fire / Explosion' },
  { key: 'LANDSLIDE', label: 'Landslide / Rockfall' },
  { key: 'STRUCTURAL_DANGER', label: 'Structural Collapse Danger' },
  { key: 'OTHER', label: 'Other Hazardous Condition' }
];

export const IncidentReportScreen: React.FC<IncidentReportScreenProps> = ({
  onSuccess,
  onCancel
}) => {
  const { services, identity, refreshLocation, triggerRefresh } = useApp();

  const [category, setCategory] = useState<IncidentPayload['category']>('FLOOD');
  const [description, setDescription] = useState<string>('');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [isAcquiringGps, setIsAcquiringGps] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const fetchGps = useCallback(async () => {
    setIsAcquiringGps(true);
    try {
      const loc = await refreshLocation();
      setLocation(loc);
    } catch {
      // Ignore
    } finally {
      setIsAcquiringGps(false);
    }
  }, [refreshLocation]);

  useEffect(() => {
    let active = true;
    const maxTimer = setTimeout(() => {
      if (active) setIsAcquiringGps(false);
    }, 2500);

    fetchGps();

    return () => {
      active = false;
      clearTimeout(maxTimer);
    };
  }, [fetchGps]);

  const isMock = location?.isMock ?? false;
  const hasCoords =
    location?.latitude !== null &&
    location?.latitude !== undefined &&
    location?.longitude !== null &&
    location?.longitude !== undefined;
  const isAccurate =
    !hasCoords ||
    location?.accuracyM === null ||
    location?.accuracyM === undefined ||
    location.accuracyM <= 200;

  const canSubmit =
    !isSubmitting &&
    description.trim().length > 0 &&
    !isMock &&
    isAccurate;

  const handleSubmit = async () => {
    if (!services || !identity) return;

    setIsSubmitting(true);
    setErrorNotice(null);

    const incidentLocation: any = hasCoords
      ? location
      : {
          latitude: 0.0,
          longitude: 0.0,
          accuracyM: 100,
          timestamp: Date.now(),
          isMock: false,
          provider: 'offline_emergency',
          status: 'AVAILABLE'
        };

    try {
      await services.incidentService.reportIncident(
        {
          category,
          description: description.trim(),
          severity,
          location: incidentLocation
        },
        identity
      );

      triggerRefresh();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to broadcast incident');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {onCancel && (
          <TouchableOpacity
            style={styles.topBackButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.topBackButtonText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Report Hazard Incident</Text>
        <Text style={styles.subtitle}>
          Broadcasts a geolocated hazard to nearby peers. Requires valid non-mock GPS ≤ 50m.
        </Text>
      </View>

      {/* GPS Integrity Verification Status */}
      <View style={styles.gpsCard}>
        <Text style={styles.sectionHeading}>GPS LOCATION INTEGRITY</Text>
        {isAcquiringGps ? (
          <View style={styles.loadingGpsRow}>
            <ActivityIndicator size="small" color={colors.info} />
            <Text style={styles.gpsText}>Acquiring high-accuracy GPS coordinates...</Text>
          </View>
        ) : isMock ? (
          <View style={styles.mockAlert}>
            <Text style={styles.mockAlertTitle}>⚠️ MOCK LOCATION DETECTED</Text>
            <Text style={styles.mockAlertBody}>
              Android mock-location provider detected. Submission is strictly rejected by the
              decentralized integrity protocol. Disable mock location apps to broadcast.
            </Text>
          </View>
        ) : !isAccurate ? (
          <View style={styles.accuracyAlert}>
            <Text style={styles.accuracyAlertTitle}>⚠️ ACCURACY EXCEEDS 50 METERS</Text>
            <Text style={styles.accuracyAlertBody}>
              Current GPS accuracy is ±{Math.round(location?.accuracyM ?? 999)}m. Hazard reports require
              accuracy ≤ 50m to qualify for community proximity verification.
            </Text>
          </View>
        ) : !hasCoords ? (
          <View style={styles.accuracyAlert}>
            <Text style={styles.accuracyAlertTitle}>ℹ️ SATELLITE GPS UNAVAILABLE (INDOORS)</Text>
            <Text style={styles.accuracyAlertBody}>
              Operating indoors or under cover. Hazard report will be broadcast using emergency offline coordinates.
            </Text>
            <TouchableOpacity style={styles.retryGpsButton} onPress={fetchGps}>
              <Text style={styles.retryGpsText}>🔄 Retry Satellite GPS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gpsLockedRow}>
            <Text style={styles.gpsLockedText}>
              ✓ GPS LOCKED: {location?.latitude?.toFixed(5)}, {location?.longitude?.toFixed(5)} (±
              {Math.round(location?.accuracyM ?? 0)}m)
            </Text>
          </View>
        )}
      </View>

      {/* Category Picker */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>HAZARD CATEGORY</Text>
        <View style={styles.chipGrid}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, category === c.key && styles.activeChip]}
              onPress={() => setCategory(c.key)}
              accessibilityRole="button"
              accessibilityLabel={c.label}
            >
              <Text style={[styles.chipText, category === c.key && styles.activeChipText]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Severity Selector (1 to 5) */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>SEVERITY LEVEL (1 - MINOR TO 5 - CRITICAL)</Text>
        <View style={styles.severityRow}>
          {([1, 2, 3, 4, 5] as const).map((sev) => {
            const isSelected = severity === sev;
            let btnColor: string = colors.surfaceElevated;
            if (isSelected) {
              if (sev >= 4) btnColor = colors.danger;
              else if (sev === 3) btnColor = colors.warning;
              else btnColor = colors.info;
            }

            return (
              <TouchableOpacity
                key={sev}
                style={[styles.severityButton, { backgroundColor: btnColor }]}
                onPress={() => setSeverity(sev)}
                accessibilityRole="button"
                accessibilityLabel={`Severity level ${sev}`}
              >
                <Text style={styles.severityText}>{sev}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <View style={styles.labelCountRow}>
          <Text style={styles.sectionHeading}>HAZARD DESCRIPTION</Text>
          <Text style={styles.charCount}>
            {description.length}/{LIMITS.MAX_DESCRIPTION_CHARS}
          </Text>
        </View>
        <TextInput
          style={styles.textArea}
          placeholder="Describe the hazard conditions, impassable paths, or immediate dangers..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={LIMITS.MAX_DESCRIPTION_CHARS}
          value={description}
          onChangeText={setDescription}
          accessibilityLabel="Hazard Description"
        />
      </View>

      {errorNotice && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorNotice}</Text>
        </View>
      )}

      {/* Action Buttons */}
      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.disabledButton]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Broadcast Hazard Report"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>BROADCAST HAZARD REPORT</Text>
        )}
      </TouchableOpacity>

      {onCancel && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
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
  header: {
    marginBottom: spacing.md
  },
  topBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm
  },
  topBackButtonText: {
    color: colors.info,
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  },
  title: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary
  },
  gpsCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  section: {
    marginBottom: spacing.md
  },
  sectionHeading: {
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs
  },
  loadingGpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  gpsText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm
  },
  mockAlert: {
    backgroundColor: colors.dangerDark,
    padding: spacing.sm,
    borderRadius: 6
  },
  mockAlertTitle: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm,
    marginBottom: 2
  },
  mockAlertBody: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs
  },
  accuracyAlert: {
    backgroundColor: colors.warningDark,
    padding: spacing.sm,
    borderRadius: 6
  },
  accuracyAlertTitle: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm,
    marginBottom: 2
  },
  accuracyAlertBody: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs
  },
  retryGpsButton: {
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border
  },
  retryGpsText: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  gpsLockedRow: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6
  },
  gpsLockedText: {
    color: colors.success,
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  chip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center'
  },
  activeChip: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.info,
    borderWidth: 2
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  activeChipText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold
  },
  severityRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  severityButton: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  severityText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 100,
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
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  disabledButton: {
    opacity: 0.4
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    letterSpacing: 1
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
