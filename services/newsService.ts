import { fetchWithTimeout } from './httpClient';
import { readPersistentCache, writePersistentCache } from './persistentCache';
import { getConfiguredSiteOrigin } from './startupConfigRuntime';

export interface NewsArticle {
  id: number;
  date: string;
  title: string;
  excerpt: string;
  content: string;
  link: string;
}

interface WordPressPost {
  id: number;
  date: string;
  link: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
}

const NEWS_CACHE_KEY = '@offline/home-news/v1';
const NEWS_CACHE_TTL_MS = 10 * 60 * 1_000;

const decodeHtmlEntities = (value: string): string => value
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&laquo;/gi, '«')
  .replace(/&raquo;/gi, '»')
  .replace(/&ndash;/gi, '–')
  .replace(/&mdash;/gi, '—')
  .replace(/&hellip;/gi, '…');

export const wordpressHtmlToText = (html = ''): string => decodeHtmlEntities(
  html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' '),
)
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const normalizePost = (post: WordPressPost): NewsArticle => ({
  id: Number(post.id),
  date: post.date || '',
  link: post.link || '',
  title: wordpressHtmlToText(post.title?.rendered),
  excerpt: wordpressHtmlToText(post.excerpt?.rendered),
  content: wordpressHtmlToText(post.content?.rendered),
});

const requestPosts = async (path: string): Promise<WordPressPost | WordPressPost[]> => {
  const response = await fetchWithTimeout(`${getConfiguredSiteOrigin()}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Сайт вернул HTTP ${response.status}`);
  return response.json() as Promise<WordPressPost | WordPressPost[]>;
};

export const getLatestNews = async (force = false, limit = 5): Promise<NewsArticle[]> => {
  const cached = await readPersistentCache<NewsArticle[]>(NEWS_CACHE_KEY);
  if (!force && cached && Date.now() - cached.savedAt < NEWS_CACHE_TTL_MS) return cached.data;
  try {
    const fields = 'id,date,link,title,excerpt';
    const payload = await requestPosts(`/wp-json/wp/v2/posts?per_page=${limit}&_fields=${fields}`);
    if (!Array.isArray(payload)) throw new Error('Некорректный список новостей');
    const articles = payload.map(normalizePost).filter(article => article.id && article.title);
    await writePersistentCache(NEWS_CACHE_KEY, articles);
    return articles;
  } catch (error) {
    if (cached) {
      console.warn('[Новости] Сайт недоступен, используется сохранённый список:', error);
      return cached.data;
    }
    throw error;
  }
};

export const getNewsArticle = async (id: string): Promise<NewsArticle> => {
  const cached = await readPersistentCache<NewsArticle[]>(NEWS_CACHE_KEY);
  const cachedArticle = cached?.data.find(article => String(article.id) === id);
  try {
    const fields = 'id,date,link,title,content';
    const payload = await requestPosts(`/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_fields=${fields}`);
    if (Array.isArray(payload)) throw new Error('Некорректная новость');
    return normalizePost(payload);
  } catch (error) {
    if (cachedArticle) return cachedArticle;
    throw error;
  }
};
