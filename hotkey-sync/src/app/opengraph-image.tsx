import { ImageResponse } from 'next/og';

export const alt =
  'HotkeySync — generate AutoHotkey & Karabiner configs that standardise hotkeys across all your desktop apps';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Statically generated OG image (no fetch/dynamic data → cached at build).
 * Pure JSX → ImageResponse renders to a 1200×630 PNG that satisfies the
 * Facebook / X / LinkedIn card requirements. Pure CSS, no font loading
 * (relies on the ImageResponse default sans-serif) to keep build fast.
 */
export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            ⌘
          </div>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
            HotkeySync
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              margin: 0,
            }}
          >
            Standardise hotkeys
            <br />
            across every desktop app.
          </h1>
          <p
            style={{
              fontSize: 30,
              lineHeight: 1.3,
              color: '#cbd5e1',
              margin: 0,
              maxWidth: 920,
            }}
          >
            Build one config in the browser, download AutoHotkey for Windows
            or Karabiner for macOS, and stop relearning Ctrl+P in every app.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
            color: '#a5b4fc',
          }}
        >
          <span>AHK · Karabiner · Tap &amp; Hold · URL-shareable</span>
          <span style={{ color: '#e0e7ff', fontWeight: 600 }}>
            hotkeysync.app
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
