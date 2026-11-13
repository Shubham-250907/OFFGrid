import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { LocalOfflineMapView, MapMarkerItem } from '../../maps';

interface DashboardScreenProps {
  onOpenSos?: () => void;
  onOpenReport?: () => void;
  onOpenAddShelter?: () => void;
  onSelectIncident?: (incidentId: string) => void;
  onSelectShelter?: (shelterId: string) => void;
}

type FilterType = 'ALL' | 'SOS' | 'INCIDENT' | 'TRIAGE' | 'SHELTER';

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenSos,
  onOpenReport,
  onOpenAddShelter,
  onSelectIncident,
  onSelectShelter
}) => {
  const {
    services,
    currentLocation,
    batteryLevel,
    peerCount,
    meshState,
    refreshCounter
  } = useApp();

  const [filter, setFilter] = useState<FilterType>('ALL');
  const [markers, setMarkers] = useState<MapMarkerItem[]>([]);

  const loadProjections = useCallback(async () => {
    if (!services) return;

    try {
      const markerList: MapMarkerItem[] = [];

      // 1. Active SOS distress calls
      const activeSos = await services.sosService.getActiveSos();
      for (const s of activeSos) {
        markerList.push({
          id: s.sosId,
          type: 'SOS',
          title: `SOS DISTRESS (${s.headcount} ${s.headcount === 1 ? 'person' : 'people'})`,
          subtitle: s.message ?? 'Emergency rescue requested. Battery: ' + s.batteryLevel + '%',
          badge: 'ACTIVE DISTRESS',
          badgeColor: colors.danger,
          latitude: s.latitude,
          longitude: s.longitude,
          timestamp: s.createdAt,
          data: s
        });
      }

      // 2. Active hazard incidents
      const activeIncidents = await services.incidentService.getActiveIncidents();
      for (const inc of activeIncidents) {
        let badgeColor: string = colors.badgeUnverified;
        if (inc.confidenceBadge === 'HIGH_CONFIDENCE') badgeColor = colors.badgeHighConfidence;
        else if (inc.confidenceBadge === 'DISPUTED') badgeColor = colors.badgeDisputed;

        markerList.push({
          id: inc.incidentId,
          type: 'INCIDENT',
          title: `${inc.category.replace('_', ' ')} (Severity ${inc.severity}/5)`,
          subtitle: inc.description,
          badge: inc.confidenceBadge,
          badgeColor,
          latitude: inc.latitude,
          longitude: inc.longitude,
          timestamp: inc.createdAt,
          data: inc
        });
      }

      // 3. Triage requests
      const triageList = await services.triageService.getAllTriage();
      for (const t of triageList) {
        markerList.push({
          id: t.triageId,
          type: 'TRIAGE',
          title: `TRIAGE: ${t.category} (${t.headcount} ${t.headcount === 1 ? 'person' : 'people'})`,
          subtitle: t.description ?? (t.category === 'SAFE' ? 'Reported safe & unharmed' : 'Aid needed'),
          badge: t.category,
          badgeColor: t.category === 'SAFE' ? colors.success : colors.warning,
          latitude: t.latitude,
          longitude: t.longitude,
          timestamp: t.createdAt,
          data: t
        });
      }

      // 4. Shelters
      const shelters = await services.shelterService.getAllShelters();
      for (const sh of shelters) {
        let badgeColor: string = colors.info;
        if (sh.currentStatus === 'OPEN') badgeColor = colors.success;
        else if (sh.currentStatus === 'FULL') badgeColor = colors.warning;
        else if (sh.currentStatus === 'CLOSED') badgeColor = colors.danger;

        markerList.push({
          id: sh.shelterId,
          type: 'SHELTER',
          title: sh.name,
          subtitle: `${sh.description ?? 'Shelter'} — Capacity: ${sh.capacity ?? 'Unknown'}`,
          badge: sh.currentStatus,
          badgeColor,
          latitude: sh.latitude,
          longitude: sh.longitude,
          timestamp: sh.createdAt,
          data: sh
        });
      }

      setMarkers(markerList);
    } catch (err) {
      console.warn('Failed to load projections into dashboard', err);
    }
  }, [services]);

  useEffect(() => {
    loadProjections();
  }, [loadProjections, refreshCounter]);

  const handleSelectMarker = (item: MapMarkerItem) => {
    if (item.type === 'INCIDENT' && onSelectIncident) {
      onSelectIncident(item.id);
    } else if (item.type === 'SHELTER' && onSelectShelter) {
      onSelectShelter(item.id);
    }
  };

  const getGpsLabel = () => {
    if (!currentLocation) return 'SEARCHING...';
    if (currentLocation.isMock) return 'MOCK DETECTED (REJECTED)';
    if (currentLocation.status === 'AVAILABLE' && currentLocation.accuracyM !== null) {
      return `LOCKED (±${Math.round(currentLocation.accuracyM)}m)`;
    }
    return 'UNAVAILABLE';
  };

  return (
    <View style={styles.container}>
      {/* Top Status Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>OFFGRID</Text>
          <Text style={styles.subTitle}>100% OFFLINE PEER MESH</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              MESH: {peerCount > 0 ? `${peerCount} PEER${peerCount === 1 ? '' : 'S'}` : meshState}
            </Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>GPS: {getGpsLabel()}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={styles.statusPillText}>BATTERY: {batteryLevel}%</Text>
          </View>
        </View>
      </View>

      {/* Action Trigger Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onOpenReport}
          accessibilityRole="button"
          accessibilityLabel="Report Hazard"
        >
          <Text style={styles.actionButtonText}>+ Report Hazard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={onOpenAddShelter}
          accessibilityRole="button"
          accessibilityLabel="Add Shelter"
        >
          <Text style={styles.actionButtonText}>+ Add Shelter</Text>
        </TouchableOpacity>
      </View>

      {/* Filters Bar */}
      <View style={styles.filterBar}>
        {(['ALL', 'SOS', 'INCIDENT', 'TRIAGE', 'SHELTER'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.activeFilterTab]}
            onPress={() => setFilter(f)}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${f}`}
          >
            <Text style={[styles.filterText, filter === f && styles.activeFilterText]}>
              {f === 'INCIDENT' ? 'HAZARDS' : f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Map or Offline Projections List */}
      <View style={styles.mapArea}>
        {services ? (
          <LocalOfflineMapView
            mapService={services.mapService}
            markers={markers}
            userLocation={currentLocation}
            onSelectMarker={handleSelectMarker}
            selectedFilter={filter}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Initializing offline database...</Text>
          </View>
        )}
      </View>

      {/* Big One-Tap SOS Button */}
      <TouchableOpacity
        style={styles.sosButton}
        onPress={onOpenSos}
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS Distress"
        accessibilityHint="Broadcasts an urgent life-safety distress packet over nearby mesh devices"
      >
        <Text style={styles.sosButtonText}>[ SEND SOS ]</Text>
        <Text style={styles.sosButtonSubtext}>One deliberate tap broadcasts distress to peers</Text>
      </TouchableOpacity>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm
  },
  brandTitle: {
    fontSize: typography.fontSizeXl,
    fontWeight: typography.fontWeightHeavy,
    color: colors.textPrimary,
    letterSpacing: 2
  },
  subTitle: {
    fontSize: typography.fontSizeXs,
    color: colors.success,
    fontWeight: typography.fontWeightBold,
    letterSpacing: 1
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4
  },
  statusPill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  statusPillText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 2,
    marginBottom: spacing.sm
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: 4
  },
  activeFilterTab: {
    backgroundColor: colors.surfaceElevated
  },
  filterText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeFilterText: {
    color: colors.info
  },
  mapArea: {
    flex: 1,
    marginBottom: spacing.sm
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm
  },
  sosButton: {
    backgroundColor: colors.danger,
    minHeight: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    shadowColor: colors.danger,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightHeavy,
    letterSpacing: 2
  },
  sosButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: typography.fontSizeXs
  }
});
