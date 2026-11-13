import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { IncidentProjection } from '../../data/projections';
import { haversineDistance } from '../../domain/algorithms/haversine';
import { StoredVote } from '../../domain/policies/voteConflict';

interface IncidentDetailScreenProps {
  incidentId: string;
  onBack: () => void;
}

export const IncidentDetailScreen: React.FC<IncidentDetailScreenProps> = ({
  incidentId,
  onBack
}) => {
  const { services, identity, currentLocation, triggerRefresh } = useApp();

  const [incident, setIncident] = useState<IncidentProjection | null>(null);
  const [existingVote, setExistingVote] = useState<StoredVote | null>(null);
  const [effectiveConfirmCount, setEffectiveConfirmCount] = useState<number>(0);
  const [effectiveDisputeCount, setEffectiveDisputeCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isVoting, setIsVoting] = useState<boolean>(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!services || !identity) return;
    setIsLoading(true);

    try {
      const inc = await services.incidentService.getIncidentById(incidentId);
      setIncident(inc);

      // Check existing vote by current user
      const votes = await services.db.query<any>(
        `SELECT * FROM votes WHERE incident_id = ? AND voter_public_key = ?;`,
        [incidentId, identity.publicKey]
      );
      if (votes.length > 0) {
        setExistingVote({
          voteId: votes[0].vote_id,
          incidentId: votes[0].incident_id,
          voterPublicKey: votes[0].voter_public_key,
          voteType: votes[0].vote_type,
          authorTimestamp: votes[0].created_at,
          eventId: votes[0].event_id
        });
      }

      // Count effective votes
      const allVotes = await services.db.query<any>(
        `SELECT vote_type, COUNT(*) as cnt FROM votes WHERE incident_id = ? AND effective = 1 GROUP BY vote_type;`,
        [incidentId]
      );
      let confirms = 0;
      let disputes = 0;
      for (const row of allVotes) {
        if (row.vote_type === 'CONFIRM') confirms = row.cnt;
        if (row.vote_type === 'DISPUTE') disputes = row.cnt;
      }
      setEffectiveConfirmCount(confirms);
      setEffectiveDisputeCount(disputes);
    } catch (err) {
      console.warn('Failed to load incident detail', err);
    } finally {
      setIsLoading(false);
    }
  }, [services, identity, incidentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCastVote = async (voteType: 'CONFIRM' | 'DISPUTE') => {
    if (!services || !identity || !currentLocation || existingVote) return;

    setIsVoting(true);
    setVoteError(null);

    try {
      await services.voteService.castVote(
        {
          incidentId,
          voteType,
          location: currentLocation
        },
        identity
      );

      triggerRefresh();
      await loadData();
    } catch (err: any) {
      setVoteError(err?.message ?? 'Failed to cast vote');
    } finally {
      setIsVoting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.info} />
        <Text style={styles.loadingText}>Loading incident verification ledger...</Text>
      </View>
    );
  }

  if (!incident) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Incident Not Found</Text>
        <Text style={styles.errorSubtitle}>
          This incident record is not present in local SQLite event store.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Return to Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let distLabel = 'Distance unavailable';
  if (currentLocation?.latitude && currentLocation?.longitude) {
    const meters = haversineDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      incident.latitude,
      incident.longitude
    );
    distLabel = meters < 1000 ? `${Math.round(meters)}m away` : `${(meters / 1000).toFixed(1)}km away`;
  }

  let badgeColor: string = colors.badgeUnverified;
  if (incident.confidenceBadge === 'HIGH_CONFIDENCE') badgeColor = colors.badgeHighConfidence;
  else if (incident.confidenceBadge === 'DISPUTED') badgeColor = colors.badgeDisputed;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backPill} onPress={onBack}>
          <Text style={styles.backPillText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerType}>{incident.category.replace('_', ' ')}</Text>
      </View>

      {/* Main Details Card */}
      <View style={styles.mainCard}>
        <View style={styles.badgeRow}>
          <View style={[styles.badgeContainer, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{incident.confidenceBadge}</Text>
          </View>
          <Text style={styles.severityTag}>Severity: Level {incident.severity}/5</Text>
        </View>

        <Text style={styles.descriptionText}>{incident.description}</Text>

        <View style={styles.metaBox}>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Distance: </Text>
            <Text style={styles.metaValue}>{distLabel}</Text>
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>GPS Coordinates: </Text>
            <Text style={styles.metaValue}>
              {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)} (±
              {Math.round(incident.accuracyM)}m)
            </Text>
          </Text>
          <Text style={styles.metaItem}>
            <Text style={styles.metaLabel}>Reported: </Text>
            <Text style={styles.metaValue}>{new Date(incident.createdAt).toLocaleString()}</Text>
          </Text>
        </View>
      </View>

      {/* Verification Evidence Breakdown */}
      <View style={styles.verificationCard}>
        <Text style={styles.sectionHeading}>COMMUNITY VERIFICATION EVIDENCE</Text>
        <Text style={styles.evidenceExplanation}>
          Confidence is a mathematical evidence calculation based on physical proximity and time decay,
          not an absolute guarantee of truth.
        </Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreNumber}>{incident.confidenceScore.toFixed(2)}</Text>
            <Text style={styles.scoreLabel}>Confidence Score [-1, +1]</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreNumber}>{effectiveConfirmCount}</Text>
            <Text style={styles.scoreLabel}>Confirm Votes</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreNumber}>{effectiveDisputeCount}</Text>
            <Text style={styles.scoreLabel}>Dispute Votes</Text>
          </View>
        </View>
      </View>

      {/* Voting Actions Section */}
      <View style={styles.votingCard}>
        <Text style={styles.sectionHeading}>VERIFY THIS HAZARD REPORT</Text>
        {existingVote ? (
          <View style={styles.alreadyVotedBox}>
            <Text style={styles.alreadyVotedText}>
              ✓ You have already cast a vote for this incident:
            </Text>
            <Text style={styles.votedBadge}>
              {existingVote.voteType === 'CONFIRM' ? 'CONFIRMED' : 'DISPUTED'}
            </Text>
            <Text style={styles.singleVoteNotice}>
              (Decentralized policy: One effective vote per public key per incident)
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.votePrompt}>
              Are you near this location? Can you confirm or dispute this hazard?
            </Text>

            {voteError && (
              <View style={styles.errorNotice}>
                <Text style={styles.errorNoticeText}>{voteError}</Text>
              </View>
            )}

            <View style={styles.voteButtonRow}>
              <TouchableOpacity
                style={[styles.voteButton, styles.confirmVoteButton]}
                onPress={() => handleCastVote('CONFIRM')}
                disabled={isVoting}
                accessibilityRole="button"
                accessibilityLabel="Confirm Hazard"
              >
                {isVoting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.voteButtonText}>CONFIRM HAZARD</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.voteButton, styles.disputeVoteButton]}
                onPress={() => handleCastVote('DISPUTE')}
                disabled={isVoting}
                accessibilityRole="button"
                accessibilityLabel="Dispute Hazard"
              >
                {isVoting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.voteButtonText}>DISPUTE HAZARD</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  loadingContainer: {
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
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
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
  headerType: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold
  },
  mainCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  badgeContainer: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeXs
  },
  severityTag: {
    color: colors.warning,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
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
  verificationCard: {
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
  evidenceExplanation: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    lineHeight: 18,
    marginBottom: spacing.md
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  scoreBox: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6,
    alignItems: 'center'
  },
  scoreNumber: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold
  },
  scoreLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    textAlign: 'center',
    marginTop: 2
  },
  votingCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  alreadyVotedBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: 6,
    alignItems: 'center'
  },
  alreadyVotedText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.xs
  },
  votedBadge: {
    color: colors.info,
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeMd,
    marginBottom: spacing.xs
  },
  singleVoteNotice: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  votePrompt: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.md
  },
  errorNotice: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.sm
  },
  errorNoticeText: {
    color: colors.danger,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  voteButtonRow: {
    flexDirection: 'row',
    gap: spacing.md
  },
  voteButton: {
    flex: 1,
    minHeight: spacing.minTouchTarget,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  confirmVoteButton: {
    backgroundColor: colors.success
  },
  disputeVoteButton: {
    backgroundColor: colors.danger
  },
  voteButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  }
});
