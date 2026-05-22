/**
 * Karabiner community gallery URL → JSON fetcher.
 *
 * Users can paste either:
 *   - a `karabiner://karabiner/assets/complex_modifications/import?url=<X>` deep-link
 *     (the "Import" button on ke-complex-modifications.pqrs.org produces these),
 *   - or the underlying https URL of a .json file directly.
 *
 * We normalise to a plain https URL, validate the host against an allow-list of
 * known content origins, then issue a *simple* GET (no custom headers, no
 * credentials) so the browser does not preflight — raw.githubusercontent.com
 * returns 403 on preflight but is permissive for simple requests.
 *
 * The fetched body is returned as a string; downstream code feeds it to
 * `parseKarabinerJSON`. We deliberately don't parse here — keeping fetch and
 * parse in separate layers makes both easier to test and lets the existing
 * Karabiner import preview UI render warnings the same way it does for pasted
 * JSON.
 */
const ALLOWED_HOSTS = new Set<string>([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'ke-complex-modifications.pqrs.org',
]);

export interface GalleryURLNormalised {
  /** The actual https URL we will fetch. */
  url: string;
  /** True when the input was a karabiner:// deep-link rather than a bare https URL. */
  wasDeepLink: boolean;
}

export type GalleryURLOutcome =
  | { ok: true; value: GalleryURLNormalised }
  | { ok: false; error: string };

/**
 * Parse a user-pasted string into a plain https URL we can fetch.
 *
 * Accepts:
 *   - `karabiner://karabiner/assets/complex_modifications/import?url=<https URL>`
 *   - `https://<allowed-host>/...`
 *
 * Rejects: non-https schemes, hosts outside the allow-list, malformed URLs.
 * The allow-list is intentionally conservative — we don't want to be a generic
 * fetch proxy for arbitrary URLs pasted into an app that runs in the user's
 * browser session.
 */
export function normaliseGalleryURL(input: string): GalleryURLOutcome {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Paste a Karabiner gallery URL first.' };
  }

  let candidate = trimmed;
  let wasDeepLink = false;

  if (candidate.toLowerCase().startsWith('karabiner://')) {
    wasDeepLink = true;
    // The deep-link URI itself is not a standard URL the WHATWG parser can
    // consume reliably across browsers because of the empty authority. Pluck
    // the `url=` query out by string match instead.
    const qIndex = candidate.indexOf('?');
    if (qIndex === -1) {
      return {
        ok: false,
        error: 'Karabiner deep-link is missing its `?url=…` query.',
      };
    }
    const query = candidate.slice(qIndex + 1);
    const params = new URLSearchParams(query);
    const inner = params.get('url');
    if (!inner) {
      return {
        ok: false,
        error: 'Karabiner deep-link does not contain a `url` parameter.',
      };
    }
    candidate = inner;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: `"${candidate}" is not a valid URL.` };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `Only https URLs are supported (got "${parsed.protocol}").`,
    };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return {
      ok: false,
      error: `Host "${parsed.hostname}" is not in the gallery allow-list. Allowed hosts: ${Array.from(
        ALLOWED_HOSTS,
      ).join(', ')}.`,
    };
  }

  return {
    ok: true,
    value: { url: parsed.toString(), wasDeepLink },
  };
}

export interface GalleryFetchSuccess {
  ok: true;
  json: string;
  fetchedUrl: string;
  wasDeepLink: boolean;
}

export interface GalleryFetchFailure {
  ok: false;
  error: string;
}

export type GalleryFetchOutcome = GalleryFetchSuccess | GalleryFetchFailure;

/**
 * Fetch a Karabiner gallery JSON file by URL. The input may be a karabiner://
 * deep-link or a bare https URL. CORS-permitted hosts only (see allow-list).
 *
 * Network failures and non-2xx responses are returned as `{ ok: false, error }`
 * — never thrown — so the UI layer renders them inline next to the URL input.
 */
export async function fetchGalleryURL(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GalleryFetchOutcome> {
  const normalised = normaliseGalleryURL(input);
  if (!normalised.ok) return { ok: false, error: normalised.error };

  let response: Response;
  try {
    response = await fetchImpl(normalised.value.url, {
      method: 'GET',
      // Deliberately no headers / credentials so the request stays "simple"
      // (no CORS preflight). raw.githubusercontent.com rejects preflight.
      credentials: 'omit',
      redirect: 'follow',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { ok: false, error: `Could not reach gallery URL: ${msg}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Gallery URL returned HTTP ${response.status} ${response.statusText}`,
    };
  }

  const json = await response.text();
  if (json.trim().length === 0) {
    return { ok: false, error: 'Gallery URL returned an empty body.' };
  }

  return {
    ok: true,
    json,
    fetchedUrl: normalised.value.url,
    wasDeepLink: normalised.value.wasDeepLink,
  };
}
