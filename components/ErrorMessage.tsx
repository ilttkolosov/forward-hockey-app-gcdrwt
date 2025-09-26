
import React from 'react';
import { View, Text } from 'react-native';
import { colors, commonStyles, buttonStyles } from '../styles/commonStyles';
import Button from './Button';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.errorText}>{message}</Text>
      {onRetry && (
        <Button
          text="Try Again"
          onPress={onRetry}
          style={buttonStyles.primary}
          textStyle={{ color: colors.background }}
        />
      )}
    </View>
  );
}
