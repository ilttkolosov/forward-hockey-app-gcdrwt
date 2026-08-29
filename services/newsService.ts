import { fetchWithTimeout } from './httpClient';
import { readPersistentCache, writePersistentCache } from './persistentCache';
import { getConfiguredSiteOrigin } from './startupConfigRuntime';

export interface NewsArticle {
  id: number;
  date: string;
  title: string;
  excerpt: string;
  content: string;
  htmlContent: string;
  link: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface NewsPage {
  articles: NewsArticle[];
  page: number;
  totalPages: number;
}

interface WordPressPost {
  id: number;
  date: string;
  link: string;
  featured_media?: number;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
}

interface WordPressMedia {
  source_url?: string;
  alt_text?: string;
  media_details?: { sizes?: Record<string, { source_url?: string }> };
}

interface NewsCache {
  articles: NewsArticle[];
  totalPages: number;
}

const NEWS_CACHE_KEY = '@offline/home-news/v2';
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

export const sanitizeWordPressHtml = (html = ''): string => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  .replace(/<form[\s\S]*?<\/form>/gi, '')
  .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');

const requestJson = async <T>(path: string, timeoutMs?: number): Promise<{ data: T; response: Response }> => {
  const response = await fetchWithTimeout(`${getConfiguredSiteOrigin()}${path}`, {
    headers: { Accept: 'application/json' },
  }, timeoutMs);
  if (!response.ok) throw new Error(`Сайт вернул HTTP ${response.status}`);
  return { data: await response.json() as T, response };
};

const loadMedia = async (mediaId?: number): Promise<{ imageUrl?: string; imageAlt?: string }> => {
  if (!mediaId) return {};
  try {
    const { data } = await requestJson<WordPressMedia>(
      `/wp-json/wp/v2/media/${mediaId}?_fields=source_url,media_details,alt_text`,
    );
    const sizes = data.media_details?.sizes;
    return {
      imageUrl: sizes?.medium_large?.source_url || sizes?.large?.source_url || data.source_url,
      imageAlt: wordpressHtmlToText(data.alt_text),
    };
  } catch (error) {
    console.warn(`[Новости] Не удалось получить изображение ${mediaId}:`, error);
    return {};
  }
};

const normalizePost = async (post: WordPressPost): Promise<NewsArticle> => ({
  id: Number(post.id),
  date: post.date || '',
  link: post.link || '',
  title: wordpressHtmlToText(post.title?.rendered),
  excerpt: wordpressHtmlToText(post.excerpt?.rendered),
  content: wordpressHtmlToText(post.content?.rendered),
  htmlContent: sanitizeWordPressHtml(post.content?.rendered),
  ...(await loadMedia(post.featured_media)),
});

const mergeArticles = (current: NewsArticle[], incoming: NewsArticle[]): NewsArticle[] => {
  const merged = new Map(current.map(article => [article.id, article]));
  incoming.forEach(article => merged.set(article.id, { ...merged.get(article.id), ...article }));
  return [...merged.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const getNewsPage = async (page = 1, perPage = 3, force = false): Promise<NewsPage> => {
  const requestedPage = Math.max(1, page);
  const cached = await readPersistentCache<NewsCache>(NEWS_CACHE_KEY);
  const start = (requestedPage - 1) * perPage;
  const cachedPage = cached?.data.articles.slice(start, start + perPage) || [];
  if (!force && cached && Date.now() - cached.savedAt < NEWS_CACHE_TTL_MS && cachedPage.length === perPage) {
    return { articles: cachedPage, page: requestedPage, totalPages: cached.data.totalPages };
  }
  try {
    const fields = 'id,date,link,title,excerpt,featured_media';
    const { data, response } = await requestJson<WordPressPost[]>(
      `/wp-json/wp/v2/posts?per_page=${perPage}&page=${requestedPage}&_fields=${fields}`,
    );
    if (!Array.isArray(data)) throw new Error('Некорректный список новостей');
    const articles = (await Promise.all(data.map(normalizePost))).filter(article => article.id && article.title);
    const totalPages = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || requestedPage);
    await writePersistentCache(NEWS_CACHE_KEY, {
      articles: mergeArticles(cached?.data.articles || [], articles),
      totalPages,
    });
    return { articles, page: requestedPage, totalPages };
  } catch (error) {
    if (cachedPage.length > 0) {
      console.warn('[Новости] Сайт недоступен, используется сохранённая страница:', error);
      return { articles: cachedPage, page: requestedPage, totalPages: cached?.data.totalPages || requestedPage };
    }
    throw error;
  }
};

export const getNewsArticle = async (id: string): Promise<NewsArticle> => {
  const cached = await readPersistentCache<NewsCache>(NEWS_CACHE_KEY);
  const cachedArticle = cached?.data.articles.find(article => String(article.id) === id);
  try {
    const fields = 'id,date,link,title,content,featured_media';
    const { data } = await requestJson<WordPressPost>(
      `/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_fields=${fields}`,
      30_000,
    );
    const article = await normalizePost(data);
    await writePersistentCache(NEWS_CACHE_KEY, {
      articles: mergeArticles(cached?.data.articles || [], [article]),
      totalPages: cached?.data.totalPages || 1,
    });
    return article;
  } catch (error) {
    if (cachedArticle) return cachedArticle;
    throw error;
  }
};
