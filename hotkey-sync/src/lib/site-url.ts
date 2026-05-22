/**
 * Canonical site URL used for SEO metadata (openGraph, sitemap, robots,
 * canonical link). Matches the URL emitted in the AHK generator header.
 *
 * When NEXT_PUBLIC_SITE_URL is set (e.g. on a Vercel preview), that wins —
 * keeps preview deploys self-referential rather than pointing at the prod
 * canonical. In production this env var resolves to the same string anyway.
 */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://hotkeysync.app';
