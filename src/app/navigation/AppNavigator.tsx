import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { DashboardScreen } from '../../features/dashboard';
import { TriageScreen } from '../../features/triage';
import { ChatScreen } from '../../features/chat';
import { ShelterScreen } from '../../features/shelters';
import { MeshStatusScreen } from '../../features/mesh-status';
import { SosModal } from '../../features/sos';
import { IncidentReportScreen } from '../../features/incidents';
import { colors, spacing, typography } from '../../theme';

type Tab = 'Dashboard' | 'Alerts' | 'Chat' | 'Shelters' | 'MeshStatus';

export const AppNavigator: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<Tab>('Dashboard');
  const [sosVisible, setSosVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const renderScreen = () => {
    if (reportVisible) {
      return (
        <View style={{ flex: 1 }}>
          <IncidentReportScreen />
          <TouchableOpacity
            style={styles.closeOverlayButton}
            onPress={() => setReportVisible(false)}
          >
            <Text style={styles.closeOverlayText}>Back to Map</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (currentTab) {
      case 'Dashboard':
        return (
          <DashboardScreen
            onOpenSos={() => setSosVisible(true)}
            onOpenReport={() => setReportVisible(true)}
          />
        );
      case 'Alerts':
        return <TriageScreen />;
      case 'Chat':
        return <ChatScreen />;
      case 'Shelters':
        return <ShelterScreen />;
      case 'MeshStatus':
        return <MeshStatusScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderScreen()}</View>

      <SosModal
        visible={sosVisible}
        onConfirm={() => setSosVisible(false)}
        onCancel={() => setSosVisible(false)}
      />

      {/* Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, currentTab === 'Dashboard' && styles.activeTab]}
          onPress={() => {
            setReportVisible(false);
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
            setReportVisible(false);
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
            setReportVisible(false);
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
            setReportVisible(false);
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
            setReportVisible(false);
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
  },
  closeOverlayButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 6
  },
  closeOverlayText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeightBold
  }
});
