import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { OfflineMapService } from './OfflineMapService';
import { haversineDistance } from '../domain/algorithms/haversine';
import { LocationResult } from '../shared/types';

export interface MapMarkerItem {
  id: string;
  type: 'SOS' | 'INCIDENT' | 'TRIAGE' | 'SHELTER';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  timestamp: number;
  data: any;
}

interface LocalOfflineMapViewProps {
  mapService: OfflineMapService;
  markers: MapMarkerItem[];
  userLocation: LocationResult | null;
  onSelectMarker: (marker: MapMarkerItem) => void;
  selectedFilter: 'ALL' | 'SOS' | 'INCIDENT' | 'TRIAGE' | 'SHELTER';
}

export const LocalOfflineMapView: React.FC<LocalOfflineMapViewProps> = ({
  mapService,
  markers,
  userLocation,
  onSelectMarker,
  selectedFilter
}) => {
  const [hasMap, setHasMap] = useState<boolean>(false);
  const [mapCoverage, setMapCoverage] = useState<'COVERED' | 'OUTSIDE_COVERAGE'>('OUTSIDE_COVERAGE');

  useEffect(() => {
    let active = true;
    async function checkMap() {
      const available = await mapService.hasOfflineMap();
      if (!active) return;
      setHasMap(available);

      if (available && userLocation?.latitude !== null && userLocation?.longitude !== null && userLocation?.latitude !== undefined && userLocation?.longitude !== undefined) {
        const status = await mapService.getCoverageStatus(userLocation.latitude, userLocation.longitude);
        if (active) setMapCoverage(status);
      } else {
        if (active) setMapCoverage('OUTSIDE_COVERAGE');
      }
    }
    checkMap();
    return () => {
      active = false;
    };
  }, [mapService, userLocation]);

  const filteredMarkers = markers.filter((m) => {
    if (selectedFilter === 'ALL') return true;
    return m.type === selectedFilter;
  });

  const renderMarkerItem = ({ item }: { item: MapMarkerItem }) => {
    let typeBorder: string = colors.border;
    if (item.type === 'SOS') typeBorder = colors.danger;
    else if (item.type === 'INCIDENT') typeBorder = colors.warning;
    else if (item.type === 'TRIAGE') typeBorder = colors.info;
    else if (item.type === 'SHELTER') typeBorder = colors.success;

    let distText = 'Location unavailable';
    if (userLocation?.latitude && userLocation?.longitude && item.latitude && item.longitude) {
      const meters = haversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        item.latitude,
        item.longitude
      );
      distText = meters < 1000 ? `${Math.round(meters)}m away` : `${(meters / 1000).toFixed(1)}km away`;
    }

    return (
      <TouchableOpacity
        style={[styles.markerCard, { borderLeftColor: typeBorder, borderLeftWidth: 6 }]}
        onPress={() => onSelectMarker(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.type}: ${item.title}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardType}>{item.type}</Text>
          {item.badge && (
            <View style={[styles.badgeContainer, { backgroundColor: item.badgeColor ?? colors.surfaceElevated }]}>
              <Text style={styles.badgeText}>{item.badge}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.cardDistance}>{distText}</Text>
          <Text style={styles.cardTime}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Map Availability / Offline Banner */}
      <View style={styles.mapStatusBanner}>
        <Text style={styles.mapStatusIcon}>{hasMap && mapCoverage === 'COVERED' ? '🗺️' : '⚠️'}</Text>
        <View style={styles.mapStatusContent}>
          <Text style={styles.mapStatusTitle}>
            {hasMap && mapCoverage === 'COVERED'
              ? 'LOCAL MBTILES MAP LOADED'
              : 'OFFLINE VECTOR PROJECTION MODE'}
          </Text>
          <Text style={styles.mapStatusSubtitle}>
            {hasMap && mapCoverage === 'COVERED'
              ? 'Displaying offline vector tiles with SQLite markers'
              : 'Operating 100% offline. Live markers originate directly from SQLite.'}
          </Text>
        </View>
      </View>

      {/* Markers Feed (Projected strictly from SQLite) */}
      {filteredMarkers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>Zero Operational Records</Text>
          <Text style={styles.emptySubtitle}>
            No active {selectedFilter !== 'ALL' ? selectedFilter : 'emergency'} reports stored in local database.
            Waiting for peer radio mesh sync or new local report.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMarkers}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderMarkerItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  mapStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm
  },
  mapStatusIcon: {
    fontSize: 20,
    marginRight: spacing.sm
  },
  mapStatusContent: {
    flex: 1
  },
  mapStatusTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  mapStatusSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  listContent: {
    paddingBottom: spacing.md
  },
  markerCard: {
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
  cardType: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold,
    letterSpacing: 1
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
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    marginBottom: spacing.sm
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardDistance: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  cardTime: {
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
    textAlign: 'center',
    lineHeight: 20
  }
});
