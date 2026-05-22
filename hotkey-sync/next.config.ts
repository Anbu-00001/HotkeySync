import type { NextConfig } from 'next';

/**
 * HotkeySync is a fully static client app (no API routes, no SSR). The CSP
 * here is the strongest static policy we can ship without a `proxy.ts`
 * middleware (which Next's nonce-based CSP guide requires). The trade-off:
 *   - 'unsafe-inline' on script-src is needed for Next's small inlined
 *     hydration shim that fires before the React runtime loads.
 *   - 'unsafe-inline' on style-src is needed for Tailwind + shadcn's inline
 *     style attributes.
 * If we ever move to dynamic rendering, escalate to nonce-based CSP per
 * `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
 *
 * connect-src allowances mirror the gallery-fetch host allow-list in
 * `src/lib/import/gallery-fetch.ts` — keep them in sync.
 */
// 'wasm-unsafe-eval' is required because the CodePreview uses Shiki's
// oniguruma regex engine, which is a WebAssembly module instantiated
// client-side. The directive is a CSP3 addition supported in Chrome 95+,
// Safari 16+, Firefox 121+ that allows WebAssembly without permitting
// generic JavaScript eval(). Older browsers fail closed — CodePreview's
// fallback in `code-preview.tsx` renders plain text in that case.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://raw.githubusercontent.com https://gist.githubusercontent.com https://ke-complex-modifications.pqrs.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  // Explicit even though `false` is the default — keeps intent obvious to
  // future readers and survives any future default change.
  productionBrowserSourceMaps: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
