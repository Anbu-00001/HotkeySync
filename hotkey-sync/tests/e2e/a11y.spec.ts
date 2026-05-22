/**
 * Accessibility smoke tests — gates the deploy on zero critical / serious axe
 * violations across the main interaction states. Runs the same axe-core engine
 * the axe DevTools Chrome extension uses, against WCAG 2.0/2.1 A+AA rules.
 *
 * If a rule legitimately doesn't apply (e.g. a colour-contrast false-positive
 * inside a syntax-highlighted code preview), disable it locally via
 * `.disableRules([...])` on the relevant call. Never disable globally without
 * comment.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Accessibility — axe scan', () => {
  test('Landing page (empty config) has no critical / serious violations', async ({
    page,
  }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      // Radix UI tabs set aria-controls to ids that only exist when the
      // corresponding tabpanel is mounted; inactive tabs reference an unmounted
      // id, which the WAI-ARIA tabs pattern explicitly allows but axe flags
      // anyway. Tracked upstream (radix-ui/primitives) — disable until they
      // align with axe's stricter interpretation.
      .disableRules(['aria-valid-attr-value'])
      .analyze();

    expectNoBlockingViolations(results);
  });

  test('Mid-flow (rule defined, preview rendered) has no critical / serious violations', async ({
    page,
  }) => {
    await page.goto('/');
    // Seed a non-trivial state directly into the persist store — mirrors the
    // simulator-conflict test pattern.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'hotkeysync-config-v1',
        JSON.stringify({
          state: {
            os: 'windows',
            selectedAppIds: ['google-chrome', 'slack'],
            rules: [
              {
                kind: 'basic',
                appId: 'google-chrome',
                trigger: 'ctrl+p',
                action: 'ctrl+comma',
                description: 'prefs',
              },
              {
                kind: 'tap_hold',
                appId: 'slack',
                trigger: 'meta+grave_accent',
                tapAction: 'escape',
                holdAction: 'ctrl+grave_accent',
                tapTimeoutMs: 200,
                description: 'tap esc / hold terminal',
              },
            ],
          },
          version: 2,
        }),
      );
    });
    await page.reload();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .disableRules(['aria-valid-attr-value'])
      // The syntax-highlighted CodePreview uses Shiki's preset palette; some
      // tokens can sub-contrast against pure black backgrounds. We assert
      // contrast on actual UI surfaces only.
      .exclude('pre, code')
      .analyze();

    expectNoBlockingViolations(results);
  });
});

function expectNoBlockingViolations(results: AxeResults) {
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    console.log(
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target),
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking).toEqual([]);
}
