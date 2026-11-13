import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { DashboardScreen } from '../../features/dashboard';
import { TriageScreen } from '../../features/triage';
import { ChatScreen } from '../../features/chat';
import { ShelterScreen, ShelterDetailScreen } from '../../features/shelters';
import { MeshStatusScreen } from '../../features/mesh-status';
import { SosModal } from '../../features/sos';
import { IncidentReportScreen, IncidentDetailScreen } from '../../features/incidents';
import { colors, typography } from '../../theme';

type Tab = 'Dashboard' | 'Alerts' | 'Chat' | 'Shelters' | 'MeshStatus';

export const AppNavigator: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<Tab>('Dashboard');
  const [sosVisible, setSosVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedShelterId, setSelectedShelterId] = useState<string | null>(null);

  const renderScreen = () => {
    // 1. Incident Report Fullscreen Screen
    if (reportVisible) {
      return (
        <IncidentReportScreen
          onSuccess={() => setReportVisible(false)}
          onCancel={() => setReportVisible(false)}
        />
      );
    }

    // 2. Incident Detail / Verification Screen
    if (selectedIncidentId) {
      return (
        <IncidentDetailScreen
          incidentId={selectedIncidentId}
          onBack={() => setSelectedIncidentId(null)}
        />
      );
    }

    // 3. Shelter Detail & Status Updates Screen
    if (selectedShelterId) {
      return (
        <ShelterDetailScreen
          shelterId={selectedShelterId}
          onBack={() => setSelectedShelterId(null)}
        />
      );
    }

    // 4. Main Tabs
    switch (currentTab) {
      case 'Dashboard':
        return (
          <DashboardScreen
            onOpenSos={() => setSosVisible(true)}
            onOpenReport={() => setReportVisible(true)}
            onSelectIncident={(id) => setSelectedIncidentId(id)}
            onSelectShelter={(id) => setSelectedShelterId(id)}
          />
        );
      case 'Alerts':
        return <TriageScreen />;
      case 'Chat':
        return <ChatScreen />;
      case 'Shelters':
        return (
          <ShelterScreen
            onSelectShelter={(id) => setSelectedShelterId(id)}
          />
        );
      case 'MeshStatus':
        return <MeshStatusScreen />;
    }
  };

  const clearOverlays = () => {
    setReportVisible(false);
    setSelectedIncidentId(null);
    setSelectedShelterId(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderScreen()}</View>

      <SosModal
        visible={sosVisible}
        onCancel={() => setSosVisible(false)}
        onSosCreated={() => setSosVisible(false)}
      />

      {/* Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'Dashboard' && styles.activeTab]}
          onPress={() => {
            clearOverlays();
            setCurrentTab('Dashboard');
          }}
          accessibilityRole="tab"
          accessibilityLabel="Map Tab"
        >
          <Text style={[styles.tabText, currentTab === 'Dashboard' && styles.activeTabText]}>
            Map
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'Alerts' && styles.activeTab]}
          onPress={() => {
            clearOverlays();
            setCurrentTab('Alerts');
          }}
          accessibilityRole="tab"
          accessibilityLabel="Alerts Tab"
        >
          <Text style={[styles.tabText, currentTab === 'Alerts' && styles.activeTabText]}>
            Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'Chat' && styles.activeTab]}
          onPress={() => {
            clearOverlays();
            setCurrentTab('Chat');
          }}
          accessibilityRole="tab"
          accessibilityLabel="Chat Tab"
        >
          <Text style={[styles.tabText, currentTab === 'Chat' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'Shelters' && styles.activeTab]}
          onPress={() => {
            clearOverlays();
            setCurrentTab('Shelters');
          }}
          accessibilityRole="tab"
          accessibilityLabel="Shelters Tab"
        >
          <Text style={[styles.tabText, currentTab === 'Shelters' && styles.activeTabText]}>
            Shelters
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'MeshStatus' && styles.activeTab]}
          onPress={() => {
            clearOverlays();
            setCurrentTab('MeshStatus');
          }}
          accessibilityRole="tab"
          accessibilityLabel="Mesh Status Tab"
        >
          <Text style={[styles.tabText, currentTab === 'MeshStatus' && styles.activeTabText]}>
            Mesh
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  tabItem: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center'
  },
  activeTab: {
    borderTopWidth: 2,
    borderTopColor: colors.info
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium
  },
  activeTabText: {
    color: colors.info,
    fontWeight: typography.fontWeightBold
  }
});
