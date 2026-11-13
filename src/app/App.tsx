import React from 'react';
import { AppProviders } from './providers/AppProviders';
import { AppNavigator } from './navigation/AppNavigator';

export const App: React.FC = () => {
  return (
    <AppProviders>
      <AppNavigator />
    </AppProviders>
  );
};

export default App;
