import { describe, it, expect, vi } from 'vitest';
import {
  fetchGalleryURL,
  normaliseGalleryURL,
} from '@/lib/import/gallery-fetch';

describe('normaliseGalleryURL', () => {
  it('passes through a bare raw.githubusercontent.com URL', () => {
    const out = normaliseGalleryURL(
      'https://raw.githubusercontent.com/pqrs-org/KE-complex_modifications/main/public/json/caps_escape.json',
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.wasDeepLink).toBe(false);
    expect(out.value.url).toContain('caps_escape.json');
  });

  it('extracts the inner https URL from a karabiner:// deep-link', () => {
    const out = normaliseGalleryURL(
      'karabiner://karabiner/assets/complex_modifications/import?url=https://raw.githubusercontent.com/pqrs-org/KE-complex_modifications/main/public/json/caps_escape.json',
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.wasDeepLink).toBe(true);
    expect(out.value.url).toContain(
      'raw.githubusercontent.com/pqrs-org/KE-complex_modifications',
    );
  });

  it('extracts a gist URL from a karabiner:// deep-link', () => {
    const out = normaliseGalleryURL(
      'karabiner://karabiner/assets/complex_modifications/import?url=https://gist.githubusercontent.com/user/abc/raw/example.json',
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.url).toContain('gist.githubusercontent.com');
  });

  it('rejects non-https schemes', () => {
    const out = normaliseGalleryURL(
      'http://raw.githubusercontent.com/foo/bar.json',
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/https/i);
  });

  it('rejects hosts outside the allow-list', () => {
    const out = normaliseGalleryURL('https://example.com/karabiner.json');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/allow-list/);
  });

  it('rejects deep-links with no `?url=` query', () => {
    const out = normaliseGalleryURL(
      'karabiner://karabiner/assets/complex_modifications/import',
    );
    expect(out.ok).toBe(false);
  });

  it('rejects deep-links whose inner URL is malformed', () => {
    const out = normaliseGalleryURL(
      'karabiner://karabiner/assets/complex_modifications/import?url=not-a-url',
    );
    expect(out.ok).toBe(false);
  });

  it('rejects empty input', () => {
    const out = normaliseGalleryURL('   ');
    expect(out.ok).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const out = normaliseGalleryURL(
      '   https://raw.githubusercontent.com/x/y/main/z.json   ',
    );
    expect(out.ok).toBe(true);
  });
});

describe('fetchGalleryURL', () => {
  it('returns the response body on 200', async () => {
    const body = '{"title":"Test","rules":[]}';
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 200 }));
    const out = await fetchGalleryURL(
      'https://raw.githubusercontent.com/x/y/main/z.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.json).toBe(body);
    expect(out.wasDeepLink).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
    // Issued WITHOUT custom headers so the request is "simple" (no preflight).
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });

  it('marks the result as deep-linked when input was karabiner://', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('{"rules":[]}', { status: 200 }));
    const out = await fetchGalleryURL(
      'karabiner://karabiner/assets/complex_modifications/import?url=https://raw.githubusercontent.com/x/y/main/z.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.wasDeepLink).toBe(true);
  });

  it('returns an error on non-2xx response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('not found', { status: 404 }));
    const out = await fetchGalleryURL(
      'https://raw.githubusercontent.com/x/y/main/z.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/404/);
  });

  it('returns an error when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('NetworkError'));
    const out = await fetchGalleryURL(
      'https://raw.githubusercontent.com/x/y/main/z.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/NetworkError/);
  });

  it('returns an error on empty response body', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('   ', { status: 200 }));
    const out = await fetchGalleryURL(
      'https://raw.githubusercontent.com/x/y/main/z.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(false);
  });

  it('does NOT fetch when the URL is invalid', async () => {
    const mockFetch = vi.fn();
    const out = await fetchGalleryURL(
      'https://example.com/karabiner.json',
      mockFetch as unknown as typeof fetch,
    );
    expect(out.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
