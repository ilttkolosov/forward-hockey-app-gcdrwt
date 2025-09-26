
import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors } from '../styles/commonStyles';

interface PlayerSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    marginLeft: 12,
    padding: 4,
  },
});

export default function PlayerSearchBar({ 
  value, 
  onChangeText, 
  onClear, 
  placeholder = 'Поиск...',
  autoFocus = false
}: PlayerSearchBarProps) {
  return (
    <View style={styles.container}>
      <Icon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        returnKeyType="search"
        clearButtonMode="never"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Icon name="close" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}
