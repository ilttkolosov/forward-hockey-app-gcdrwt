import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});Fimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});iimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});limport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});eimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
}); import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});dimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});oimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});eimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});simport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
}); import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});nimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});oimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});timport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
}); import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});eimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});ximport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});iimport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});simport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});timport React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});.import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';

interface SeasonPillProps {
  season: string;
  isActive: boolean;
  onPress: (season: string) => void;
}

export default function SeasonPill({ season, isActive, onPress }: SeasonPillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        isActive && styles.activePill
      ]}
      onPress={() => onPress(season)}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.pillText,
        isActive && styles.activePillText
      ]}>
        {season}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  activePillText: {
    color: colors.background,
    fontWeight: '600',
  },
});