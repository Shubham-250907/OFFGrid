import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList
} from 'react-native';
import { colors, spacing, typography } from '../theme';
import { OfflineMapService } from './OfflineMapService';
import { haversineDistance } from '../domain/algorithms/haversine';
import { LocationResult } from '../shared/types';

const LayoutView = View as any;

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

const ZOOM_LEVELS = [
  { label: '500m', meters: 500 },
  { label: '1.5km', meters: 1500 },
  { label: '5km', meters: 5000 },
  { label: '15km', meters: 15000 },
  { label: '50km', meters: 50000 }
];

export const LocalOfflineMapView: React.FC<LocalOfflineMapViewProps> = ({
  mapService,
  markers,
  userLocation,
  onSelectMarker,
  selectedFilter
}) => {
  const [viewMode, setViewMode] = useState<'MAP' | 'LIST'>('MAP');
  const [zoomIndex, setZoomIndex] = useState<number>(2); // 5km default
  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({
    width: 340,
    height: 380
  });
  const [activeMarker, setActiveMarker] = useState<MapMarkerItem | null>(null);

  const [hasMap, setHasMap] = useState<boolean>(false);
  const [mapCoverage, setMapCoverage] = useState<'COVERED' | 'OUTSIDE_COVERAGE'>('OUTSIDE_COVERAGE');

  useEffect(() => {
    let active = true;
    async function checkMap() {
      const available = await mapService.hasOfflineMap();
      if (!active) return;
      setHasMap(available);

      if (
        available &&
        userLocation?.latitude !== null &&
        userLocation?.longitude !== null &&
        userLocation?.latitude !== undefined &&
        userLocation?.longitude !== undefined
      ) {
        const status = await mapService.getCoverageStatus(
          userLocation.latitude,
          userLocation.longitude
        );
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

  const filteredMarkers = useMemo(() => {
    return markers.filter((m) => {
      if (selectedFilter === 'ALL') return true;
      return m.type === selectedFilter;
    });
  }, [markers, selectedFilter]);

  // Center coordinate determination
  const centerCoords = useMemo(() => {
    if (userLocation?.latitude && userLocation?.longitude) {
      return { lat: userLocation.latitude, lon: userLocation.longitude };
    }
    const withCoords = filteredMarkers.filter(
      (m) => m.latitude !== null && m.longitude !== null
    );
    if (withCoords.length > 0) {
      const avgLat =
        withCoords.reduce((acc, m) => acc + (m.latitude ?? 0), 0) / withCoords.length;
      const avgLon =
        withCoords.reduce((acc, m) => acc + (m.longitude ?? 0), 0) / withCoords.length;
      return { lat: avgLat, lon: avgLon };
    }
    return { lat: 28.6139, lon: 77.209 }; // Default reference center
  }, [userLocation, filteredMarkers]);

  const zoomMeters = ZOOM_LEVELS[zoomIndex]?.meters ?? 5000;
  const zoomLabel = ZOOM_LEVELS[zoomIndex]?.label ?? '5km';

  const onCanvasLayout = (e: any) => {
    const { width, height } = e?.nativeEvent?.layout ?? {};
    if (width > 0 && height > 0) {
      setCanvasDim({ width, height });
    }
  };

  // Convert (lat, lon) to canvas pixel coordinates relative to center
  const projectToPixel = (lat: number | null, lon: number | null) => {
    if (lat === null || lon === null) return null;

    const latRad = (centerCoords.lat * Math.PI) / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos(latRad);

    const dLatMeters = (lat - centerCoords.lat) * metersPerDegLat;
    const dLonMeters = (lon - centerCoords.lon) * metersPerDegLon;

    const scaleRadius = Math.min(canvasDim.width, canvasDim.height) * 0.42;

    // pixel offsets: positive dLon is East (right), positive dLat is North (up)
    const px = canvasDim.width / 2 + (dLonMeters / zoomMeters) * scaleRadius;
    const py = canvasDim.height / 2 - (dLatMeters / zoomMeters) * scaleRadius;

    return {
      x: Math.max(16, Math.min(canvasDim.width - 16, px)),
      y: Math.max(16, Math.min(canvasDim.height - 16, py)),
      isClamped:
        px < 16 ||
        px > canvasDim.width - 16 ||
        py < 16 ||
        py > canvasDim.height - 16
    };
  };

  const userPixel = useMemo(() => {
    if (userLocation?.latitude && userLocation?.longitude) {
      return projectToPixel(userLocation.latitude, userLocation.longitude);
    }
    return null;
  }, [userLocation, centerCoords, zoomMeters, canvasDim]);

  const handleZoomIn = () => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  };

  const handleZoomOut = () => {
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  };

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
            <View
              style={[
                styles.badgeContainer,
                { backgroundColor: item.badgeColor ?? colors.surfaceElevated }
              ]}
            >
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
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Map Mode Switcher & Status Bar */}
      <View style={styles.topControlRow}>
        <View style={styles.modeToggleGroup}>
          <TouchableOpacity
            style={[styles.modeButton, viewMode === 'MAP' && styles.activeModeButton]}
            onPress={() => setViewMode('MAP')}
          >
            <Text style={[styles.modeButtonText, viewMode === 'MAP' && styles.activeModeText]}>
              🗺️ TACTICAL MAP
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, viewMode === 'LIST' && styles.activeModeButton]}
            onPress={() => setViewMode('LIST')}
          >
            <Text style={[styles.modeButtonText, viewMode === 'LIST' && styles.activeModeText]}>
              📋 CARDS ({filteredMarkers.length})
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.centerBadge}>
          <Text style={styles.centerBadgeText}>
            {hasMap && mapCoverage === 'COVERED' ? '🗺️ MBTILES' : '📡 RADAR'} • {centerCoords.lat.toFixed(3)}°, {centerCoords.lon.toFixed(3)}°
          </Text>
        </View>
      </View>

      {viewMode === 'MAP' ? (
        /* VISUAL TACTICAL SPATIAL MAP CANVAS */
        <LayoutView style={styles.canvasContainer} onLayout={onCanvasLayout}>
          {/* Compass Rose */}
          <View style={styles.compassRose}>
            <Text style={styles.compassText}>▲ N</Text>
          </View>

          {/* Scale Indicator */}
          <View style={styles.scaleBadge}>
            <Text style={styles.scaleText}>Radius: {zoomLabel}</Text>
          </View>

          {/* Concentric Distance Radar Circles */}
          <View
            style={[
              styles.radarRing,
              {
                width: Math.min(canvasDim.width, canvasDim.height) * 0.84,
                height: Math.min(canvasDim.width, canvasDim.height) * 0.84,
                borderRadius: 999
              }
            ]}
          />
          <View
            style={[
              styles.radarRing,
              {
                width: Math.min(canvasDim.width, canvasDim.height) * 0.56,
                height: Math.min(canvasDim.width, canvasDim.height) * 0.56,
                borderRadius: 999
              }
            ]}
          />
          <View
            style={[
              styles.radarRing,
              {
                width: Math.min(canvasDim.width, canvasDim.height) * 0.28,
                height: Math.min(canvasDim.width, canvasDim.height) * 0.28,
                borderRadius: 999
              }
            ]}
          />

          {/* Grid Crosshairs */}
          <View
            style={[styles.gridLineH, { top: canvasDim.height / 2, width: canvasDim.width }]}
          />
          <View
            style={[styles.gridLineV, { left: canvasDim.width / 2, height: canvasDim.height }]}
          />

          {/* User Location Radar Pin */}
          {userPixel && (
            <View
              style={[
                styles.userBeaconContainer,
                { left: userPixel.x - 14, top: userPixel.y - 14 }
              ]}
            >
              <View style={styles.userBeaconPulse} />
              <View style={styles.userBeaconDot} />
              <Text style={styles.userBeaconLabel}>YOU</Text>
            </View>
          )}

          {/* Emergency Markers Projected in Coordinate Space */}
          {filteredMarkers.map((marker) => {
            const pos = projectToPixel(marker.latitude, marker.longitude);
            if (!pos) return null;

            const isSelected = activeMarker?.id === marker.id;
            let markerColor: string = colors.info;
            let markerEmoji = '📌';

            if (marker.type === 'SOS') {
              markerColor = colors.danger;
              markerEmoji = '🚨';
            } else if (marker.type === 'SHELTER') {
              markerColor = colors.success;
              markerEmoji = '🏠';
            } else if (marker.type === 'INCIDENT') {
              markerColor = colors.warning;
              markerEmoji = '⚠️';
            } else if (marker.type === 'TRIAGE') {
              markerColor = colors.info;
              markerEmoji = '🏥';
            }

            return (
              <TouchableOpacity
                key={`${marker.type}-${marker.id}`}
                style={[
                  styles.mapPin,
                  {
                    left: pos.x - 16,
                    top: pos.y - 16,
                    backgroundColor: markerColor,
                    borderColor: isSelected ? '#FFFFFF' : markerColor
                  },
                  isSelected && styles.activePin
                ]}
                onPress={() => {
                  setActiveMarker(marker);
                  onSelectMarker(marker);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${marker.type}: ${marker.title}`}
              >
                <Text style={styles.mapPinIcon}>{markerEmoji}</Text>
                <View style={styles.pinLabelContainer}>
                  <Text style={styles.pinLabelText} numberOfLines={1}>
                    {marker.type === 'SOS'
                      ? `SOS (${marker.data?.headcount ?? 1}p)`
                      : marker.title.slice(0, 10)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Empty Marker Notice on Map */}
          {filteredMarkers.length === 0 && (
            <View style={styles.emptyMapNotice}>
              <Text style={styles.emptyMapTitle}>TACTICAL RADAR ACTIVE</Text>
              <Text style={styles.emptyMapSubtitle}>
                Zero active {selectedFilter !== 'ALL' ? selectedFilter : 'distress'} markers.
                Broadcasting and scanning over BLE & Mesh Relay.
              </Text>
            </View>
          )}

          {/* Zoom & Recenter Controls */}
          <View style={styles.mapControlsColumn}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomIn}
              accessibilityLabel="Zoom In"
            >
              <Text style={styles.controlButtonText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomOut}
              accessibilityLabel="Zoom Out"
            >
              <Text style={styles.controlButtonText}>−</Text>
            </TouchableOpacity>
          </View>

          {/* Interactive Selected Marker Callout Overlay */}
          {activeMarker && (
            <View style={styles.calloutCard}>
              <View style={styles.calloutHeader}>
                <View style={styles.calloutTitleRow}>
                  <Text style={styles.calloutType}>{activeMarker.type}</Text>
                  <Text style={styles.calloutTitle} numberOfLines={1}>
                    {activeMarker.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActiveMarker(null)}
                  style={styles.closeCalloutButton}
                >
                  <Text style={styles.closeCalloutText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.calloutSubtitle} numberOfLines={2}>
                {activeMarker.subtitle}
              </Text>

              <View style={styles.calloutFooter}>
                <Text style={styles.calloutDistance}>
                  {userLocation?.latitude &&
                  userLocation?.longitude &&
                  activeMarker.latitude &&
                  activeMarker.longitude
                    ? `${Math.round(
                        haversineDistance(
                          userLocation.latitude,
                          userLocation.longitude,
                          activeMarker.latitude,
                          activeMarker.longitude
                        )
                      )}m away`
                    : 'Coordinates recorded'}
                </Text>
                <TouchableOpacity
                  style={styles.viewDetailsButton}
                  onPress={() => onSelectMarker(activeMarker)}
                >
                  <Text style={styles.viewDetailsText}>Open Details →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </LayoutView>
      ) : (
        /* LIST FEED MODE */
        <View style={styles.listContainer}>
          {filteredMarkers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>Zero Operational Records</Text>
              <Text style={styles.emptySubtitle}>
                No active {selectedFilter !== 'ALL' ? selectedFilter : 'emergency'} reports stored in
                local database.
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
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  modeToggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 2
  },
  modeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 4
  },
  activeModeButton: {
    backgroundColor: colors.surfaceElevated
  },
  modeButtonText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeModeText: {
    color: colors.info
  },
  centerBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  centerBadgeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightMedium
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#07101E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  compassRose: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10
  },
  compassText: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightHeavy
  },
  scaleBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10
  },
  scaleText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    borderStyle: 'dashed'
  },
  gridLineH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)'
  },
  gridLineV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)'
  },
  userBeaconContainer: {
    position: 'absolute',
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20
  },
  userBeaconPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderColor: colors.info
  },
  userBeaconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.info
  },
  userBeaconLabel: {
    position: 'absolute',
    top: 26,
    color: colors.info,
    fontSize: 9,
    fontWeight: typography.fontWeightHeavy,
    backgroundColor: 'rgba(7, 16, 30, 0.85)',
    paddingHorizontal: 4,
    borderRadius: 2
  },
  mapPin: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 25
  },
  activePin: {
    transform: [{ scale: 1.25 }],
    borderColor: '#FFFFFF',
    borderWidth: 3,
    zIndex: 35
  },
  mapPinIcon: {
    fontSize: 16
  },
  pinLabelContainer: {
    position: 'absolute',
    top: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border
  },
  pinLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: typography.fontWeightBold
  },
  mapControlsColumn: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    gap: 8,
    zIndex: 30
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold
  },
  emptyMapNotice: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 5
  },
  emptyMapTitle: {
    color: colors.info,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightHeavy,
    letterSpacing: 1.5,
    marginBottom: 4
  },
  emptyMapSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    textAlign: 'center'
  },
  calloutCard: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 56,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.info,
    padding: spacing.sm,
    zIndex: 40,
    shadowColor: '#000',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 10
  },
  calloutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2
  },
  calloutTitleRow: {
    flex: 1,
    marginRight: 6
  },
  calloutType: {
    fontSize: 9,
    fontWeight: typography.fontWeightBold,
    color: colors.info,
    letterSpacing: 1
  },
  calloutTitle: {
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold,
    color: '#FFFFFF'
  },
  closeCalloutButton: {
    paddingHorizontal: 4
  },
  closeCalloutText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightBold
  },
  calloutSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeXs,
    marginBottom: spacing.xs
  },
  calloutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  calloutDistance: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  viewDetailsButton: {
    backgroundColor: colors.info,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4
  },
  viewDetailsText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  listContainer: {
    flex: 1
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md
  },
  markerCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  cardType: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted,
    fontWeight: typography.fontWeightBold
  },
  badgeContainer: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  cardTitle: {
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: 2
  },
  cardSubtitle: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.sm
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs
  },
  cardDistance: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted
  },
  cardTime: {
    fontSize: typography.fontSizeXs,
    color: colors.textMuted
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md
  },
  emptyTitle: {
    fontSize: typography.fontSizeLg,
    fontWeight: typography.fontWeightBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  emptySubtitle: {
    fontSize: typography.fontSizeSm,
    color: colors.textSecondary,
    textAlign: 'center'
  }
});
