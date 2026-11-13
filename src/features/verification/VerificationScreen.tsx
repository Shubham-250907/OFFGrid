import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { IncidentProjection } from '../../data/projections';
import { haversineDistance } from '../../domain/algorithms/haversine';

interface VerificationScreenProps {
  onSelectIncident?: (incidentId: string) => void;
}

export const VerificationScreen: React.FC<VerificationScreenProps> = ({
  onSelectIncident
}) => {
  const { services, currentLocation, refreshCounter } = useApp();

  const [incidents, setIncidents] = useState<IncidentProjection[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadIncidents = useCallback(async () => {
    if (!services) return;
    setIsLoading(true);

    try {
      const active = await services.incidentService.getActiveIncidents();
      setIncidents(active);
    } catch (err) {
      console.warn('Failed to load incidents for verification', err);
    } finally {
      setIsLoading(false);
    }
  }, [services]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents, refreshCounter]);

  const renderIncidentCard = ({ item }: { item: IncidentProjection }) => {
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

    let badgeColor: string = colors.badgeUnverified;
    if (item.confidenceBadge === 'HIGH_CONFIDENCE') badgeColor = colors.badgeHighConfidence;
    else if (item.confidenceBadge === 'DISPUTED') badgeColor = colors.badgeDisputed;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onSelectIncident && onSelectIncident(item.incidentId)}
        accessibilityRole="button"
        accessibilityLabel={`Verify incident: ${item.category}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.categoryTitle}>{item.category.replace('_', ' ')}</Text>
          <View style={[styles.badgeContainer, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{item.confidenceBadge}</Text>
          </View>
        </View>

        <Text style={styles.descriptionText} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.distanceText}>{distLabel}</Text>
          <Text style={styles.scoreText}>Score: {item.confidenceScore.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Incident Verification Queue</Text>
        <Text style={styles.notice}>
          Confidence scores are calculated from nearby peer votes weighted by physical distance and
          decayed over time. They are mathematical evidence scores, not absolute truth guarantees.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.info} />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : incidents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No Hazards to Verify</Text>
          <Text style={styles.emptySubtitle}>
            There are currently zero hazard incidents stored in the local SQLite ledger.
          </Text>
        </View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.incidentId}
          renderItem={renderIncidentCard}
          contentContainerStyle={styles.listContent}
        />
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
    marginBottom: spacing.md
  },
  title: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  notice: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted,
    lineHeight: 18
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginTop: spacing.sm
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
  categoryTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold
  },
  badgeContainer: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  descriptionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.sm
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  distanceText: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  scoreText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
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
