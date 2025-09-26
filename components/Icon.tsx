
import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { ViewStyle } from 'react-native';

interface IconProps {
  name: keyof typeof MaterialIcons.glyphMap;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export default function Icon({ name, size = 24, color = '#000', style }: IconProps) {
  return <MaterialIcons name={name} size={size} color={color} style={style} />;
}
