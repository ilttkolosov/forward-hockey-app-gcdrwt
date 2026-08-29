import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getNewsArticle, type NewsArticle } from '../../services/newsService';
import { colors, commonStyles } from '../../styles/commonStyles';
import { usePersistentBottomNavigationInset } from '../../components/PersistentBottomNavigation';

export default function NewsArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomInset = usePersistentBottomNavigationInset();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadArticle = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setArticle(await getNewsArticle(id));
    } catch {
      setError('Не удалось загрузить новость.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { void loadArticle(); }, [loadArticle]);
  if (loading) return <SafeAreaView style={commonStyles.container}><LoadingSpinner /></SafeAreaView>;
  if (error || !article) {
    return <SafeAreaView style={commonStyles.container}><ErrorMessage message={error || 'Новость не найдена'} onRetry={loadArticle} /></SafeAreaView>;
  }

  const date = new Date(article.date).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.headerTitle}>Новости</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadArticle(); }} />}
      >
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.title}>{article.title}</Text>
        <Text style={styles.body}>{article.content || article.excerpt}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 6, marginRight: 8 },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1 },
  content: { padding: 20, paddingBottom: 50 },
  date: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  title: { color: colors.text, fontSize: 25, lineHeight: 32, fontWeight: '800', marginBottom: 20 },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
});
