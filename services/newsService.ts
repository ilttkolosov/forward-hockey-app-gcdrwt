import { fetchWithTimeout } from './httpClient';
import {
  getMetadata,
  loadNewsArticleFromDatabase,
  loadNewsArticlesByIds,
  loadNewsPageFromDatabase,
  saveNewsArticleContent,
  setMetadata,
  upsertNewsIndexes,
  type NewsArticleRecord,
} from '../database/repository';
import { getConfiguredSiteOrigin } from './startupConfigRuntime';

export interface NewsArticle {
  id: number;
  date: string;
  modified: string;
  title: string;
  excerpt: string;
  content: string;
  htmlContent: string;
  link: string;
  featuredMediaId: number;
  imageUrl?: string;
  imageAlt?: string;
}

export interface NewsPage {
  articles: NewsArticle[];
  page: number;
  totalPages: number;
  backgroundRefresh?: Promise<NewsPage>;
}

interface WordPressPost {
  id: number;
  date: string;
  modified: string;
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

const NEWS_INDEX_TTL_MS = 10 * 60 * 1_000;

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

const activateFooGalleryImages = (html: string): string => html.replace(
  /<img([^>]*?)data-src-fg="([^"]+)"([^>]*?)>/gi,
  (_match, before: string, lazyUrl: string, after: string) => {
    const responsiveUrl = lazyUrl.replace(/\/w_\d+(?:,h_\d+)?\//i, '/w_720,h_480/');
    const attributes = `${before} ${after}`
      .replace(/\sdata-src-fg="[^"]*"/gi, '')
      .replace(/\ssrc="[^"]*"/gi, '')
      .replace(/\sloading="[^"]*"/gi, '');
    return `<img${attributes} src="${responsiveUrl}" loading="lazy">`;
  },
);

export const sanitizeWordPressHtml = (html = ''): string => activateFooGalleryImages(html)
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

const recordToArticle = (record: NewsArticleRecord): NewsArticle => ({
  id: record.id,
  date: record.published_at,
  modified: record.modified_at,
  title: record.title,
  excerpt: record.excerpt,
  content: record.content_text,
  htmlContent: record.content_html,
  link: record.link,
  featuredMediaId: record.featured_media_id,
  imageUrl: record.image_url || undefined,
  imageAlt: record.image_alt || undefined,
});

const postToIndexRecord = async (
  post: WordPressPost,
  existing?: NewsArticleRecord,
): Promise<NewsArticleRecord> => {
  const mediaId = Number(post.featured_media || 0);
  const canReuseImage = existing?.featured_media_id === mediaId && Boolean(existing.image_url);
  const media = canReuseImage
    ? { imageUrl: existing?.image_url || undefined, imageAlt: existing?.image_alt || undefined }
    : await loadMedia(mediaId);
  return {
    id: Number(post.id),
    published_at: post.date || '',
    modified_at: post.modified || post.date || '',
    title: wordpressHtmlToText(post.title?.rendered),
    excerpt: wordpressHtmlToText(post.excerpt?.rendered),
    link: post.link || '',
    featured_media_id: mediaId,
    image_url: media.imageUrl || null,
    image_alt: media.imageAlt || null,
    content_text: existing?.content_text || '',
    content_html: existing?.content_html || '',
    content_loaded: existing?.content_loaded || 0,
  };
};

const refreshNewsPage = async (page: number, perPage: number): Promise<NewsPage> => {
  const fields = 'id,date,modified,link,title,excerpt,featured_media';
  const { data, response } = await requestJson<WordPressPost[]>(
    `/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=${fields}`,
  );
  if (!Array.isArray(data)) throw new Error('Некорректный список новостей');
  const existingRows = await loadNewsArticlesByIds(data.map(post => Number(post.id)));
  const existing = new Map(existingRows.map(row => [row.id, row]));
  const records = await Promise.all(data.map(post => postToIndexRecord(post, existing.get(Number(post.id)))));
  await upsertNewsIndexes(records);
  const totalPages = Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || page);
  await Promise.all([
    setMetadata('news_total_pages', String(totalPages)),
    setMetadata(`news_page_${page}_checked_at`, String(Date.now())),
  ]);
  const stored = await loadNewsPageFromDatabase((page - 1) * perPage, perPage);
  return { articles: stored.map(recordToArticle), page, totalPages };
};

export const getNewsPage = async (page = 1, perPage = 3, force = false): Promise<NewsPage> => {
  const requestedPage = Math.max(1, page);
  const localRows = await loadNewsPageFromDatabase((requestedPage - 1) * perPage, perPage);
  const totalPages = Math.max(1, Number(await getMetadata('news_total_pages')) || requestedPage);
  const checkedAt = Number(await getMetadata(`news_page_${requestedPage}_checked_at`)) || 0;
  if (localRows.length > 0 && !force) {
    const result: NewsPage = { articles: localRows.map(recordToArticle), page: requestedPage, totalPages };
    if (Date.now() - checkedAt >= NEWS_INDEX_TTL_MS) {
      result.backgroundRefresh = refreshNewsPage(requestedPage, perPage).catch(error => {
        console.warn(`[Новости] Страница ${requestedPage} не обновлена:`, error);
        return result;
      });
    }
    return result;
  }
  try {
    return await refreshNewsPage(requestedPage, perPage);
  } catch (error) {
    if (localRows.length > 0) {
      console.warn(`[Новости] Страница ${requestedPage} открыта из SQLite:`, error);
      return { articles: localRows.map(recordToArticle), page: requestedPage, totalPages };
    }
    throw error;
  }
};

export const getStoredNewsArticle = async (id: string): Promise<NewsArticle | null> => {
  const row = await loadNewsArticleFromDatabase(Number(id));
  return row?.content_loaded ? recordToArticle(row) : null;
};

export const refreshNewsArticle = async (id: string): Promise<NewsArticle> => {
  const numericId = Number(id);
  const existing = await loadNewsArticleFromDatabase(numericId);
  if (existing?.content_loaded) {
    const fields = 'id,modified';
    const { data: revision } = await requestJson<WordPressPost>(
      `/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_fields=${fields}`,
    );
    if ((revision.modified || '') === existing.modified_at) return recordToArticle(existing);
  }

  const fields = 'id,date,modified,link,title,excerpt,content,featured_media';
  const { data } = await requestJson<WordPressPost>(
    `/wp-json/wp/v2/posts/${encodeURIComponent(id)}?_fields=${fields}`,
    30_000,
  );
  const indexRecord = await postToIndexRecord(data, existing || undefined);
  const contentRecord: NewsArticleRecord = {
    ...indexRecord,
    content_text: wordpressHtmlToText(data.content?.rendered),
    content_html: sanitizeWordPressHtml(data.content?.rendered),
    content_loaded: 1,
  };
  await saveNewsArticleContent(contentRecord);
  return recordToArticle(contentRecord);
};
