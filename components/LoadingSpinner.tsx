
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';

export default function LoadingSpinner() {
  return (
    <View style={commonStyles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
