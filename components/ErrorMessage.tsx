
import React from 'react';
import { View, Text } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';

interface ErrorMessageProps {
  message: string;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.errorText}>{message}</Text>
    </View>
  );
}
