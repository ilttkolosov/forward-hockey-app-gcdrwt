
import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'small' | 'large';
}

export default function LoadingSpinner({ text = 'Загрузка...', size = 'large' }: LoadingSpinnerProps) {
  return (
    <View style={commonStyles.loadingContainer}>
      <ActivityIndicator size={size} color={colors.primary} />
      {text && <Text style={commonStyles.loadingText}>{text}</Text>}
    </View>
  );
}
