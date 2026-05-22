import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found — HotkeySync',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="text-3xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        HotkeySync is a single-page tool — there are no other routes. If you
        followed a share link, it may have been malformed or truncated.
      </p>
      <Link
        href="/"
        className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to HotkeySync
      </Link>
    </main>
  );
}
