import { describe, expect, it } from 'vitest';

import { resolveSessionToken } from '../src/sessionToken.js';

const KEY = 'catavasia.serverToken';

function page(href: string) {
  const p = {
    location: { href },
    history: {
      state: { keep: 1 } as unknown,
      replaceState(_data: unknown, _unused: string, url: string) {
        p.location.href = new URL(url, p.location.href).href;
      },
    },
  };
  return p;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('resolveSessionToken', () => {
  it('saves the URL token and removes it from the address bar', () => {
    const p = page('http://127.0.0.1:3200/?a=1&token=fake-url-token#office');
    const store = memoryStorage();
    expect(resolveSessionToken(p, () => store)).toBe('fake-url-token');
    expect(store.data.get(KEY)).toBe('fake-url-token');
    expect(p.location.href).toBe('http://127.0.0.1:3200/?a=1#office');
  });

  it('uses the saved token when the URL has none (a reload)', () => {
    const p = page('http://127.0.0.1:3200/');
    const store = memoryStorage({ [KEY]: 'fake-saved-token' });
    expect(resolveSessionToken(p, () => store)).toBe('fake-saved-token');
  });

  it('a new URL token replaces the saved one', () => {
    const store = memoryStorage({ [KEY]: 'fake-old-token' });
    expect(resolveSessionToken(page('http://h/?token=fake-new-token'), () => store)).toBe(
      'fake-new-token',
    );
    expect(store.data.get(KEY)).toBe('fake-new-token');
  });

  it('returns null with no URL token and nothing saved', () => {
    expect(resolveSessionToken(page('http://h/'), () => memoryStorage())).toBeNull();
  });

  it('keeps the URL token in the address bar when storage is not available', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    const p = page('http://h/?token=fake-url-token');
    expect(resolveSessionToken(p, blocked)).toBe('fake-url-token');
    expect(p.location.href).toBe('http://h/?token=fake-url-token');
    expect(resolveSessionToken(page('http://h/'), blocked)).toBeNull();
    expect(resolveSessionToken(page('http://h/?token=fake-url-token'), () => null)).toBe(
      'fake-url-token',
    );
  });

  it('keeps the URL token when saving throws (quota)', () => {
    const p = page('http://h/?token=fake-url-token');
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(resolveSessionToken(p, () => full)).toBe('fake-url-token');
    expect(p.location.href).toBe('http://h/?token=fake-url-token');
  });
});
