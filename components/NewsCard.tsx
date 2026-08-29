import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NewsArticle } from '../services/newsService';
import { colors } from '../styles/commonStyles';
import Icon from './Icon';

const formatNewsDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function NewsCard({ article }: { article: NewsArticle }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      accessibilityLabel={`Открыть новость «${article.title}»`}
      accessibilityRole="button"
      activeOpacity={0.72}
      onPress={() => router.push(`/news/${article.id}`)}
      style={styles.card}
    >
      <View style={styles.metaRow}>
        <View style={styles.badge}><Text style={styles.badgeText}>НОВОСТЬ</Text></View>
        <Text style={styles.date}>{formatNewsDate(article.date)}</Text>
      </View>
      <Text numberOfLines={3} style={styles.title}>{article.title}</Text>
      {article.excerpt && <Text numberOfLines={4} style={styles.excerpt}>{article.excerpt}</Text>}
      <View style={styles.moreRow}>
        <Text style={styles.more}>Читать полностью</Text>
        <Icon color={colors.primary} name="chevron-forward" size={17} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primary },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  date: { color: colors.textSecondary, fontSize: 12 },
  title: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  excerpt: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 9 },
  moreRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 12 },
  more: { color: colors.primary, fontSize: 13, fontWeight: '700', marginRight: 2 },
});
