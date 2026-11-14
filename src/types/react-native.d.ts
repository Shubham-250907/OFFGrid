declare module 'react-native' {
  import * as React from 'react';

  export interface ViewProps {
    style?: any;
    children?: React.ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
  }
  export const View: React.FC<ViewProps>;

  export interface TextProps {
    style?: any;
    children?: React.ReactNode;
    numberOfLines?: number;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
  }
  export const Text: React.FC<TextProps>;

  export interface TouchableOpacityProps {
    style?: any;
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
  }
  export const TouchableOpacity: React.FC<TouchableOpacityProps>;

  export interface TextInputProps {
    style?: any;
    value?: string;
    placeholder?: string;
    placeholderTextColor?: string;
    onChangeText?: (text: string) => void;
    multiline?: boolean;
    maxLength?: number;
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
    accessibilityLabel?: string;
    accessibilityHint?: string;
  }
  export const TextInput: React.FC<TextInputProps>;

  export interface ScrollViewProps {
    style?: any;
    contentContainerStyle?: any;
    children?: React.ReactNode;
    accessibilityLabel?: string;
  }
  export const ScrollView: React.FC<ScrollViewProps>;

  export interface FlatListProps<T = any> {
    data: T[] | null | undefined;
    keyExtractor: (item: T, index: number) => string;
    renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
    contentContainerStyle?: any;
    ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
  }
  export class FlatList<T = any> extends React.Component<FlatListProps<T>> {}

  export interface ActivityIndicatorProps {
    size?: 'small' | 'large' | number;
    color?: string;
    style?: any;
  }
  export const ActivityIndicator: React.FC<ActivityIndicatorProps>;

  export interface ModalProps {
    visible?: boolean;
    transparent?: boolean;
    animationType?: 'none' | 'slide' | 'fade';
    children?: React.ReactNode;
    onRequestClose?: () => void;
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

  export const Alert: {
    alert(title: string, message?: string, buttons?: any[], options?: any): void;
  };

  export const NativeModules: {
    [key: string]: any;
  };

  export const DeviceEventEmitter: {
    addListener(event: string, callback: (...args: any[]) => void): { remove: () => void };
    emit(event: string, ...args: any[]): void;
  };

  export const AppRegistry: {
    registerComponent(appKey: string, componentProvider: () => React.ComponentType<any>): void;
  };

  export const Platform: {
    OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
    Version: number | string;
  };

  export const PermissionsAndroid: {
    PERMISSIONS: Record<string, string>;
    RESULTS: Record<string, string>;
    request(permission: string, rationale?: any): Promise<string>;
    requestMultiple(permissions: string[]): Promise<Record<string, string>>;
    check(permission: string): Promise<boolean>;
  };
}
