import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getNewsArticle, type NewsArticle } from '../../services/newsService';
import { getConfiguredSiteOrigin } from '../../services/startupConfigRuntime';
import { colors, commonStyles } from '../../styles/commonStyles';

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildArticleHtml = (article: NewsArticle): string => {
  const date = new Date(article.date).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const image = article.imageUrl
    ? `<img class="featured" src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt || article.title)}">`
    : '';
  const content = article.htmlContent || `<p>${escapeHtml(article.content || article.excerpt)}</p>`;
  return `<!doctype html>
<html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#17212b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{padding:18px 18px 120px;font-size:16px;line-height:1.55}.date{font-size:13px;color:#6b7280;margin:0 0 10px}
h1{font-size:27px;line-height:1.2;margin:0 0 18px;font-weight:800}h2{font-size:22px;line-height:1.3;margin:26px 0 12px}h3,h4{line-height:1.3}
.featured{display:block;width:calc(100% + 36px);max-width:none;height:auto;margin:0 -18px 22px}p{margin:0 0 16px}a{color:#e51d35;text-decoration:none;font-weight:600}
img{max-width:100%;height:auto}figure{max-width:100%;margin:18px 0}.wp-block-gallery{display:flex;gap:8px;flex-wrap:wrap}
.sp-table-caption{margin:22px 0 0;padding:13px;background:#174f86;color:#fff;text-align:center;text-transform:uppercase;font-size:16px}
.sp-table-wrapper{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 22px;border:1px solid #c9ced5;border-top:0}
table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px}th,td{padding:9px 7px;border-right:1px solid #c9ced5;border-bottom:1px solid #d7dbe0;text-align:center;white-space:nowrap}
th{background:#eef0f2;font-weight:800}th.data-name,td.data-name{text-align:left;min-width:210px}tbody tr:nth-child(odd){background:#f4f5f6}tbody tr.highlighted td{background:#fff0f1;font-weight:800;color:#b41427}
.team-logo{display:inline-flex;vertical-align:middle;margin-right:7px}.team-logo img{width:24px!important;height:24px!important;object-fit:contain}.sp-paginated-table tbody tr{display:table-row!important}
</style></head><body><p class="date">${escapeHtml(date)}</p><h1>${escapeHtml(article.title)}</h1>${image}<main>${content}</main></body></html>`;
};

export default function NewsArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
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
    }
  }, [id]);

  useEffect(() => { void loadArticle(); }, [loadArticle]);
  const html = useMemo(() => article ? buildArticleHtml(article) : '', [article]);
  const siteOrigin = getConfiguredSiteOrigin();
  if (loading) return <SafeAreaView style={commonStyles.container}><LoadingSpinner /></SafeAreaView>;
  if (error || !article) {
    return <SafeAreaView style={commonStyles.container}><ErrorMessage message={error || 'Новость не найдена'} onRetry={loadArticle} /></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.headerTitle}>Новости</Text>
      </View>
      <WebView
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: siteOrigin }}
        onShouldStartLoadWithRequest={request => {
          if (
            request.url === 'about:blank'
            || request.url.startsWith('data:')
            || request.url === siteOrigin
            || request.url === `${siteOrigin}/`
          ) return true;
          void Linking.openURL(request.url);
          return false;
        }}
        style={styles.webView}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 6, marginRight: 8 },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1 },
  webView: { flex: 1, backgroundColor: colors.background },
});
