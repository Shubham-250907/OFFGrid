declare module 'react-native' {
  import * as React from 'react';

  export interface ViewProps {
    style?: any;
    children?: React.ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }
  export const View: React.FC<ViewProps>;

  export interface TextProps {
    style?: any;
    children?: React.ReactNode;
    numberOfLines?: number;
    accessibilityLabel?: string;
  }
  export const Text: React.FC<TextProps>;

  export interface TouchableOpacityProps {
    style?: any;
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }
  export const TouchableOpacity: React.FC<TouchableOpacityProps>;

  export interface ModalProps {
    visible?: boolean;
    transparent?: boolean;
    animationType?: 'none' | 'slide' | 'fade';
    children?: React.ReactNode;
  }
  export const Modal: React.FC<ModalProps>;

  export interface StatusBarProps {
    barStyle?: 'default' | 'light-content' | 'dark-content';
    backgroundColor?: string;
  }
  export const StatusBar: React.FC<StatusBarProps>;

  export const StyleSheet: {
    create<T extends Record<string, any>>(styles: T): T;
  };

  export const NativeModules: {
    [key: string]: any;
  };

  export const AppRegistry: {
    registerComponent(appKey: string, componentProvider: () => React.ComponentType<any>): void;
  };
}
