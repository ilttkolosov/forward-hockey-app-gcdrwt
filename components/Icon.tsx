// components/Icon.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/commonStyles';

// Типы для поддерживаемых наборов
type IconType = 'ion' | 'material' | 'material-community';

// Типы имен иконок для каждого набора
type IconName =
  | keyof typeof Ionicons.glyphMap
  | keyof typeof MaterialIcons.glyphMap
  | keyof typeof MaterialCommunityIcons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  style?: object;
  color?: string;
  type?: IconType; // 'ion' (по умолчанию), 'material', 'material-community'
}

export default function Icon({
  name,
  size = 40,
  style,
  color = 'black',
  type = 'ion',
}: IconProps) {
  const renderIcon = () => {
    switch (type) {
      case 'material':
        return <MaterialIcons name={name as any} size={size} color={color} />;
      case 'material-community':
        return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
      case 'ion':
      default:
        return <Ionicons name={name as any} size={size} color={color} />;
    }
  };

  return <View style={[styles.iconContainer, style]}>{renderIcon()}</View>;
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});