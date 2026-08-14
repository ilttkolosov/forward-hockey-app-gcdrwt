import AsyncStorage from "@react-native-async-storage/async-storage";

export interface MessengerLinkPreview {
  url: string;
  title: string;
  imageUrl: string | null;
  siteName: string;
  hostname: string;
}

interface CachedPreview {
  url: string;
  savedAt: number;
  preview: MessengerLinkPreview | null;
}

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const CACHE_PREFIX = "@messenger/link-preview/v1/";
const SUCCESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_CHARACTERS = 300_000;
const MAX_CONCURRENT_FETCHES = 2;

const memoryCache = new Map<
  string,
  { expiresAt: number; preview: MessengerLinkPreview | null }
>();
const inFlight = new Map<string, Promise<MessengerLinkPreview | null>>();
const queue: (() => void)[] = [];
let activeFetches = 0;

function trimUrlPunctuation(value: string): string {
  let result = value;
  while (/[.,!?;:]$/u.test(result)) result = result.slice(0, -1);
  while (/[\]}]$/u.test(result)) result = result.slice(0, -1);
  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) || []).length;
    const closes = (result.match(/\)/g) || []).length;
    if (closes <= opens) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function normalizeMessageUrl(value: string): string | null {
  const candidate = trimUrlPunctuation(value.trim());
  if (!candidate || candidate.length > 2_048) return null;
  try {
    const parsed = new URL(
      candidate.startsWith("www.") ? `https://${candidate}` : candidate,
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface MessengerTextSegment {
  text: string;
  url: string | null;
}

export function splitMessengerTextLinks(text: string): MessengerTextSegment[] {
  const segments: MessengerTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const trimmed = trimUrlPunctuation(raw);
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), url: null });
    }
    segments.push({ text: trimmed, url: normalizeMessageUrl(trimmed) });
    const punctuation = raw.slice(trimmed.length);
    if (punctuation) segments.push({ text: punctuation, url: null });
    cursor = index + raw.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), url: null });
  return segments.length ? segments : [{ text, url: null }];
}

export function firstMessengerMessageUrl(text: string): string | null {
  return splitMessengerTextLinks(text).find((segment) => segment.url)?.url ?? null;
}

function hashUrl(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function privatePreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "»",
  };
  return value
    .replace(/&#(\d+);/g, (_, number: string) =>
      String.fromCodePoint(Number(number)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number: string) =>
      String.fromCodePoint(Number.parseInt(number, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) =>
      named[name.toLowerCase()] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tagAttribute(tag: string, attribute: string): string | null {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function metaValues(html: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = tagAttribute(tag, "property") || tagAttribute(tag, "name");
    const content = tagAttribute(tag, "content");
    if (key && content && !values.has(key.toLowerCase())) {
      values.set(key.toLowerCase(), content);
    }
  }
  return values;
}

function absoluteHttpUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function withFetchLane<T>(operation: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  activeFetches += 1;
  try {
    return await operation();
  } finally {
    activeFetches = Math.max(0, activeFetches - 1);
    queue.shift()?.();
  }
}

async function fetchPreview(url: string): Promise<MessengerLinkPreview | null> {
  const parsedUrl = new URL(url);
  if (privatePreviewHost(parsedUrl.hostname)) return null;
  return withFetchLane(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Range: `bytes=0-${MAX_HTML_CHARACTERS - 1}`,
        },
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
        return null;
      }
      const html = (await response.text()).slice(0, MAX_HTML_CHARACTERS);
      const meta = metaValues(html);
      const documentTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const title = decodeHtml(
        meta.get("og:title") ||
          meta.get("twitter:title") ||
          documentTitle ||
          parsedUrl.hostname,
      ).slice(0, 180);
      const siteName = decodeHtml(
        meta.get("og:site_name") || parsedUrl.hostname.replace(/^www\./i, ""),
      ).slice(0, 80);
      const imageUrl = absoluteHttpUrl(
        meta.get("og:image") ||
          meta.get("twitter:image") ||
          meta.get("twitter:image:src"),
        url,
      );
      return {
        url,
        title: title || siteName,
        imageUrl,
        siteName,
        hostname: parsedUrl.hostname.replace(/^www\./i, ""),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  });
}

export function getMessengerLinkPreview(
  url: string,
): Promise<MessengerLinkPreview | null> {
  const normalized = normalizeMessageUrl(url);
  if (!normalized) return Promise.resolve(null);
  const memory = memoryCache.get(normalized);
  if (memory && memory.expiresAt > Date.now()) {
    return Promise.resolve(memory.preview);
  }
  const running = inFlight.get(normalized);
  if (running) return running;

  const promise = (async () => {
    const key = `${CACHE_PREFIX}${hashUrl(normalized)}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      const cached = raw ? (JSON.parse(raw) as CachedPreview) : null;
      const ttl = cached?.preview ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
      if (
        cached?.url === normalized &&
        Number.isFinite(cached.savedAt) &&
        Date.now() - cached.savedAt < ttl
      ) {
        memoryCache.set(normalized, {
          expiresAt: cached.savedAt + ttl,
          preview: cached.preview,
        });
        return cached.preview;
      }
    } catch {
      // A damaged preview entry is disposable and can be rebuilt.
    }

    const preview = await fetchPreview(normalized);
    const ttl = preview ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
    memoryCache.set(normalized, {
      expiresAt: Date.now() + ttl,
      preview,
    });
    const cached: CachedPreview = {
      url: normalized,
      savedAt: Date.now(),
      preview,
    };
    void AsyncStorage.setItem(key, JSON.stringify(cached)).catch(() => undefined);
    return preview;
  })().finally(() => {
    inFlight.delete(normalized);
  });
  inFlight.set(normalized, promise);
  return promise;
}
