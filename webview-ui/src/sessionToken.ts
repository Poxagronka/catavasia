/**
 * The server token, the page's edit rights. One module for every caller.
 *
 * `pa` (and the CLI) open the office at `/?token=...`. The page saves that
 * token in localStorage (per origin, so per port) and removes it from the
 * address bar, so a reload or a bookmark still has edit rights and the token
 * does not sit in the URL. A page opened without `?token=` uses the saved one.
 * When storage is not available, the token stays in the URL: a reload must
 * not lose it.
 */

const STORAGE_KEY = 'catavasia.serverToken';

interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PageLocation {
  location: { href: string };
  history: { state: unknown; replaceState(data: unknown, unused: string, url: string): void };
}

/** Read the token from the URL (and save it) or from storage. Exported for tests. */
export function resolveSessionToken(
  page: PageLocation,
  storage: () => TokenStorage | null,
): string | null {
  const url = new URL(page.location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    try {
      const store = storage();
      if (!store) return fromUrl;
      store.setItem(STORAGE_KEY, fromUrl);
    } catch {
      return fromUrl; // Not saved: keep it in the URL so a reload still works.
    }
    url.searchParams.delete('token');
    page.history.replaceState(page.history.state, '', url.pathname + url.search + url.hash);
    return fromUrl;
  }
  try {
    return storage()?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

// Typed without the DOM lib: the node-side tests import this module too.
const page = (globalThis as { window?: PageLocation & { localStorage: TokenStorage } }).window;

export const sessionToken: string | null = page
  ? resolveSessionToken(page, () => page.localStorage)
  : null;

/** A served attachment with the page token (the route needs it; an <img> sends no header). */
export function attachmentHref(url: string): string {
  return sessionToken ? `${url}?token=${encodeURIComponent(sessionToken)}` : url;
}
