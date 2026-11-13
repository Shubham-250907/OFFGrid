import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { colors } from '../../theme';
import { AppContextProvider, AppServices } from '../context/AppContext';

interface AppProvidersProps {
  children: React.ReactNode;
  initialServices?: AppServices;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children, initialServices }) => {
  return (
    <AppContextProvider initialServices={initialServices}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        {children}
      </View>
    </AppContextProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  }
});
