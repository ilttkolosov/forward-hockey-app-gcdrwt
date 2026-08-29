import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
      {article.imageUrl && (
        <Image
          accessibilityLabel={article.imageAlt || article.title}
          resizeMode="cover"
          source={{ uri: article.imageUrl }}
          style={styles.image}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.date}>{formatNewsDate(article.date)}</Text>
        <Text numberOfLines={2} style={styles.title}>{article.title}</Text>
        {article.excerpt && <Text numberOfLines={2} style={styles.excerpt}>{article.excerpt}</Text>}
        <View style={styles.moreRow}>
          <Text style={styles.more}>Читать</Text>
          <Icon color={colors.primary} name="chevron-forward" size={17} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.border },
  content: { padding: 15 },
  date: { color: colors.textSecondary, fontSize: 12, marginBottom: 7 },
  title: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  excerpt: { color: colors.textSecondary, fontSize: 14, lineHeight: 19, marginTop: 7 },
  moreRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 9 },
  more: { color: colors.primary, fontSize: 13, fontWeight: '700', marginRight: 2 },
});
