import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface OnboardingScreenProps {
  onComplete?: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to OFFGRID</Text>
      <Text style={styles.description}>
        Decentralized emergency communication. No accounts, no cell towers, no internet required. Your device identity is generated securely inside your phone's Keystore.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onComplete}
        accessibilityRole="button"
        accessibilityLabel="Get Started"
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: typography.fontSizeHero,
    fontWeight: typography.fontWeightHeavy,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center'
  },
  description: {
    fontSize: typography.fontSizeMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl
  },
  button: {
    backgroundColor: colors.info,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
    minHeight: spacing.minTouchTarget,
    justifyContent: 'center'
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold
  }
});
