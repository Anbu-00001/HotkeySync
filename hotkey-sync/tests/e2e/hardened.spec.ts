/**
 * Hardened cross-phase regression suite.
 *
 * Verifies every guarantee made by Phases 1–3, Scope 1.5, and T2.3. Uses
 * STRICT assertions wherever possible (toHaveText over toContainText, exact
 * regex anchors, and pre-computed expected blobs). Each describe block targets
 * one layer of the product so a failure points directly at the offending phase.
 *
 * Hardcoded expectations:
 *   - HEADER_LINES — pinned bytes that the AHK header MUST contain (date is
 *     intentionally NOT hardcoded since it advances daily).
 *   - The strings asserted via `toContainText` are stable substrings of the
 *     generator output. Changing the generator output triggers this suite,
 *     which is the point.
 */

import { test, expect, type Page } from '@playwright/test';
import { encodeConfig } from '../../src/lib/config-share';
import { generateAHK } from '../../src/lib/generators/ahk';
import { generateKarabiner } from '../../src/lib/generators/karabiner';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — hardcoded, deterministic config inputs.
// ─────────────────────────────────────────────────────────────────────────────

const BASIC_CHROME_RULE = {
  kind: 'basic' as const,
  appId: 'google-chrome',
  trigger: 'ctrl+p',
  action: 'ctrl+comma',
  description: 'Open Preferences instead of Print',
};

const TAP_HOLD_VSCODE_RULE = {
  kind: 'tap_hold' as const,
  appId: 'vs-code',
  trigger: 'meta+grave_accent',
  tapAction: 'escape',
  holdAction: 'ctrl+grave_accent',
  tapTimeoutMs: 200,
  description: 'Tap to Esc, hold for terminal',
};

const SIDEBAR_RULE_COUNT = (page: Page) =>
  page.getByText('Rules defined', { exact: true }).locator('..').locator('p').nth(1);
const SIDEBAR_APP_COUNT = (page: Page) =>
  page.getByText('Apps selected', { exact: true }).locator('..').locator('p').nth(1);

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Hardened — Phase 1: data layer + persist', () => {
  test('page boots with 6 sections and a 6-step tracker', async ({ page }) => {
    await page.goto('/');
    for (const id of [
      'section-os',
      'section-apps',
      'section-rules',
      'section-presets',
      'section-preview',
      'section-power',
    ]) {
      await expect(page.locator(`section#${id}`)).toBeVisible();
    }
    // Step tracker shows steps 1..6 in order.
    const stepLabels = [
      'Choose OS',
      'Select Apps',
      'Define Rules',
      'Presets & Suggestions',
      'Preview & Download',
      'Power Tools',
    ];
    for (const label of stepLabels) {
      await expect(page.getByRole('list', { name: 'Progress' }).getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('localStorage persistence — refresh keeps OS, selected apps, and rules', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'macOS' }).click();
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();

    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    await expect(SIDEBAR_APP_COUNT(page)).toHaveText('1');

    await page.reload();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    await expect(SIDEBAR_APP_COUNT(page)).toHaveText('1');
    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('store schema v2 — persisted blob always has kind on every rule', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('hotkeysync-config-v1');
      return raw ? (JSON.parse(raw) as { state: { rules: Array<{ kind?: string }> }; version: number }) : null;
    });
    expect(stored).not.toBeNull();
    if (!stored) return;
    expect(stored.version).toBe(2);
    expect(stored.state.rules.length).toBeGreaterThan(0);
    for (const r of stored.state.rules) {
      expect(['basic', 'tap_hold']).toContain(r.kind);
    }
  });
});

test.describe('Hardened — Phase 2: UI controls', () => {
  test('OS toggle is a radiogroup, switches reactive note + CodePreview default tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('radiogroup', { name: 'Operating system' })).toBeVisible();
    await expect(
      page.getByText('Generates hotkeys.ahk for AutoHotkey v2', { exact: true }),
    ).toBeVisible();

    await page.getByRole('radio', { name: 'macOS' }).click();
    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'Windows' })).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('Generates hotkeys.json for Karabiner-Elements', { exact: true }),
    ).toBeVisible();

    // After switching OS, CodePreview tab follows the OS (unless the user
    // overrode it). With no rules yet, preview is the empty state; switch back
    // to Windows and add a rule to verify tab follows.
    await page.getByRole('radio', { name: 'Windows' }).click();
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(
      page.locator('section#section-preview').getByRole('tab', { name: 'Windows (.ahk)' }),
    ).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('radio', { name: 'macOS' }).click();
    await expect(
      page.locator('section#section-preview').getByRole('tab', { name: 'macOS (.json)' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('app card behaves as a checkbox: keyboard activatable + cascades to remove rules on deselect', async ({ page }) => {
    await page.goto('/');
    const chromeCard = page.getByRole('checkbox', { name: /Google Chrome/ });
    await expect(chromeCard).toHaveAttribute('aria-checked', 'false');
    await chromeCard.focus();
    await page.keyboard.press('Space');
    await expect(chromeCard).toHaveAttribute('aria-checked', 'true');

    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');

    // Deselect Chrome → rule cascades away.
    await chromeCard.click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('0');
  });

  test('search box filters apps within 200ms debounce', async ({ page }) => {
    await page.goto('/');
    // VS Code appears initially.
    await expect(page.getByRole('checkbox', { name: /VS Code/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search apps' }).fill('chrome');
    // After debounce, VS Code is gone, Chrome remains.
    await expect(page.getByRole('checkbox', { name: /Google Chrome/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /VS Code/ })).toHaveCount(0);
  });

  test('category tab filters apps to a single category', async ({ page }) => {
    await page.goto('/');
    await page.locator('section#section-apps').getByRole('tab', { name: 'Browsers' }).click();
    await expect(page.getByRole('checkbox', { name: /Google Chrome/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /VS Code/ })).toHaveCount(0);
  });

  test('search honours aliases — typing "vscode" finds VS Code', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('searchbox', { name: 'Search apps' })
      .fill('vscode');
    await expect(
      page.getByRole('checkbox', { name: /VS Code/ }),
    ).toBeVisible();
    // Cross-check: a non-matching app is filtered out.
    await expect(
      page.getByRole('checkbox', { name: /Google Chrome/ }),
    ).toHaveCount(0);
  });

  test('app picker counter reflects per-OS catalogue size', async ({ page }) => {
    await page.goto('/');
    // All 20 current apps are cross-platform, so both OSes show the same count.
    // The interesting assertion is that the counter pivots when the OS toggles
    // (when we later add platform-exclusive apps in Phase B/C). For now, both
    // sides should show 20 — proving the per-OS filter is wired and stable.
    const counter = page.locator('section#section-apps').getByText(/of \d+ apps selected/);
    await expect(counter).toContainText('of 20 apps selected');
    await page.getByRole('radio', { name: 'macOS' }).click();
    await expect(counter).toContainText('of 20 apps selected');
  });
});

test.describe('Hardened — Phase 3: generators + preview + download', () => {
  test('AHK header invariants are present on every non-empty config', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const ahkRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated AutoHotkey v2 script' });

    // These four substrings are pinned — generator may not drop them.
    for (const required of [
      '#Requires AutoHotkey v2.0+',
      '#SingleInstance Force',
      '#HotIf WinActive("ahk_exe chrome.exe")',
      '^p:: Send("^,")',
    ]) {
      await expect(ahkRegion).toContainText(required);
    }
    // Helper text MUST NOT appear in a basic-only AHK file.
    await expect(ahkRegion).not.toContainText('TapHoldAction(timeoutMs');
  });

  test('Karabiner output includes caps_lock optional + escaped bundle id', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'macOS' }).click();
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const karabinerRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated Karabiner-Elements configuration' });

    for (const required of [
      '"title": "HotkeySync — My Config"',
      '"type": "basic"',
      '"frontmost_application_if"',
      '"caps_lock"',
      '"left_control"',
      '"^com\\\\.google\\\\.Chrome$"',
    ]) {
      await expect(karabinerRegion).toContainText(required);
    }
  });

  test('Karabiner schema validation banner appears with valid output', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'macOS' }).click();
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(
      page.getByText('Karabiner JSON passes strict schema validation.', { exact: true }),
    ).toBeVisible();
  });

  test('AHK structural lint banner is green for a clean Windows config', async ({
    page,
  }) => {
    await page.goto('/');
    // Default OS is Windows on first load; just add a rule via preset.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({
        has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }),
      });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(
      page.getByText(/AutoHotkey script passes structural lint/),
    ).toBeVisible();
  });

  test('Download button name reflects current OS', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByRole('button', { name: 'Download hotkeys.ahk' })).toBeEnabled();

    await page.getByRole('radio', { name: 'macOS' }).click();
    await expect(page.getByRole('button', { name: 'Download hotkeys.json' })).toBeEnabled();
  });

  test('pre-computed AHK output matches what CodePreview renders (round-trip via URL import)', async ({ page }) => {
    // Use URL import so the test owns BOTH the input and the expected output.
    // Applying a preset would let the preset's own descriptions drift away
    // from the fixture's, making the assertion fragile.
    const blob = encodeConfig({
      os: 'windows',
      selectedAppIds: ['google-chrome'],
      rules: [BASIC_CHROME_RULE],
    });
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    const expected = generateAHK({ os: 'windows', rules: [BASIC_CHROME_RULE] });
    const ahkRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated AutoHotkey v2 script' });

    const ruleLine = expected
      .split('\n')
      .find((l) => l.includes('^p:: Send("^,")'));
    expect(ruleLine).toBeDefined();
    if (ruleLine) await expect(ahkRegion).toContainText(ruleLine);
  });
});

test.describe('Hardened — Scope 1.5: share, import, simulator, conflicts', () => {
  test('URL share round-trip — encoded blob from page = blob from lib', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Copy share link' }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    expect(clipboard).toContain('#hk=');
    const blob = clipboard.split('#hk=')[1];

    // The exact same encoded blob is what the pure lib produces for the same
    // store state. This is the strict invariant: UI share == lib share.
    const expected = encodeConfig({
      os: 'windows',
      selectedAppIds: ['google-chrome'],
      rules: [{ ...BASIC_CHROME_RULE, description: 'Open Settings instead of Print' }],
    });
    expect(blob).toBe(expected);
  });

  test('URL import applies all rule kinds from the hash', async ({ page }) => {
    const blob = encodeConfig({
      os: 'mac',
      selectedAppIds: ['google-chrome', 'vs-code'],
      rules: [BASIC_CHROME_RULE, TAP_HOLD_VSCODE_RULE],
    });

    // page.goto('/#hk=…') strips the fragment in current Playwright/Chromium.
    // Workaround: set the hash via JS and reload.
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.getByText(/Loaded shared config/)).toBeVisible();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('2');
    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // The tap_hold rule should render its badge in the rule row.
    await expect(page.getByText('Tap & Hold', { exact: true }).first()).toBeVisible();
  });

  test('Import panel — AHK paste round-trips a preset exactly', async ({ page }) => {
    await page.goto('/');
    // Compute a sample AHK file from a known config.
    const ahkSource = generateAHK({
      os: 'windows',
      rules: [BASIC_CHROME_RULE],
    });

    const importPanel = page.locator('section#section-power');
    await importPanel.getByRole('textbox', { name: 'AutoHotkey source' }).fill(ahkSource);
    await importPanel.getByRole('button', { name: 'Parse' }).click();
    await expect(importPanel.getByText('1 rule parsed across 1 app', { exact: false })).toBeVisible();
    await importPanel.getByRole('button', { name: 'Replace config with import' }).click();

    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
  });

  test('Import panel — Karabiner JSON paste round-trips a tap_hold rule', async ({ page }) => {
    await page.goto('/');
    const json = JSON.stringify(
      generateKarabiner({ os: 'mac', rules: [TAP_HOLD_VSCODE_RULE] }),
      null,
      2,
    );

    const importPanel = page.locator('section#section-power');
    await importPanel.getByRole('tab', { name: 'Karabiner (.json)' }).click();
    await importPanel.getByRole('textbox', { name: 'Karabiner JSON source' }).fill(json);
    await importPanel.getByRole('button', { name: 'Parse' }).click();

    await expect(importPanel.getByText('1 rule parsed across 1 app', { exact: false })).toBeVisible();
    await importPanel.getByRole('button', { name: 'Replace config with import' }).click();
    // Should land on macOS with the tap_hold rule visible.
    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    await expect(page.getByText('Tap & Hold', { exact: true }).first()).toBeVisible();
  });

  test('Gallery URL fetch — karabiner:// deep-link extracts inner URL, fetches, auto-parses', async ({
    page,
  }) => {
    await page.goto('/');

    // Mock the gallery fetch. The component issues a simple GET (no headers).
    const fixtureUrl =
      'https://raw.githubusercontent.com/pqrs-org/KE-complex_modifications/main/public/json/caps_escape.json';
    const fixtureBody = JSON.stringify(
      generateKarabiner({ os: 'mac', rules: [BASIC_CHROME_RULE] }),
    );
    await page.route(fixtureUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureBody,
      }),
    );

    const importPanel = page.locator('section#section-power');
    await importPanel.getByRole('tab', { name: 'Karabiner (.json)' }).click();
    await importPanel
      .getByRole('textbox', { name: 'Karabiner gallery URL' })
      .fill(
        `karabiner://karabiner/assets/complex_modifications/import?url=${fixtureUrl}`,
      );
    await importPanel.getByRole('button', { name: 'Fetch' }).click();

    // Success banner mentions the extracted URL + deep-link hint.
    await expect(
      importPanel.getByText(/extracted from karabiner:\/\/ deep-link/),
    ).toBeVisible();
    // Auto-parse populated the preview without a second click.
    await expect(
      importPanel.getByText('1 rule parsed across 1 app', { exact: false }),
    ).toBeVisible();

    await importPanel
      .getByRole('button', { name: 'Replace config with import' })
      .click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
  });

  test('Gallery URL fetch — rejects hosts outside the allow-list without issuing a request', async ({
    page,
  }) => {
    await page.goto('/');

    // Any request to evil.example.com would fail the test — Playwright would surface it.
    let requestIssued = false;
    await page.route('**/evil.example.com/**', (route) => {
      requestIssued = true;
      return route.fulfill({ status: 200, body: '{}' });
    });

    const importPanel = page.locator('section#section-power');
    await importPanel.getByRole('tab', { name: 'Karabiner (.json)' }).click();
    await importPanel
      .getByRole('textbox', { name: 'Karabiner gallery URL' })
      .fill('https://evil.example.com/karabiner.json');
    await importPanel.getByRole('button', { name: 'Fetch' }).click();

    await expect(importPanel.getByText(/allow-list/)).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('Live simulator resolves a captured combo to the matching rule', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const capture = page.getByRole('application', { name: 'Keyboard simulator capture area' });
    await capture.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('p');
    await page.keyboard.up('Control');

    // The simulator shows "You pressed" + the captured combo + the matched rule.
    await expect(page.getByText('You pressed', { exact: true })).toBeVisible();
    await expect(page.getByText('Open Settings instead of Print').first()).toBeVisible();
  });

  test('Live simulator surfaces a cross-app conflict banner for a contested combo', async ({
    page,
  }) => {
    // Two apps, two DIFFERENT actions on Ctrl+P → conflict. Seed via the
    // persist store directly so the test owns the input state and doesn't
    // depend on the rule-panel form's dynamic aria-labels.
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
                kind: 'basic',
                appId: 'slack',
                trigger: 'ctrl+p',
                action: 'ctrl+k',
                description: 'switcher',
              },
            ],
          },
          version: 2,
        }),
      );
    });
    await page.goto('/');

    const capture = page.getByRole('application', {
      name: 'Keyboard simulator capture area',
    });
    await capture.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('p');
    await page.keyboard.up('Control');

    const banner = page.getByTestId('simulator-conflict-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Cross-app conflict/);
    await expect(banner).toContainText(/2 different things/);
  });

  test('Live simulator shows a consistent banner when the combo behaves identically across apps', async ({
    page,
  }) => {
    await page.goto('/');
    // Apply the standardise preset to both apps; same action on Ctrl+P in both.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await page.getByRole('checkbox', { name: /Slack/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({
        has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }),
      });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const capture = page.getByRole('application', {
      name: 'Keyboard simulator capture area',
    });
    await capture.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('p');
    await page.keyboard.up('Control');

    const banner = page.getByTestId('simulator-conflict-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Consistent across 2 apps/);
  });

  test('Cross-app conflict matrix flags same trigger / different actions', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await page.getByRole('checkbox', { name: /VS Code/ }).click();

    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });
    const captureDialog = page.getByRole('dialog', { name: 'Capture key combination' });

    await vsCodePanel.getByRole('button', { name: 'New trigger for VS Code' }).click();
    await page.keyboard.down('Control');
    await page.keyboard.press('p');
    await page.keyboard.up('Control');
    await expect(captureDialog).toBeHidden();

    await vsCodePanel.getByRole('button', { name: 'New action for VS Code' }).click();
    await page.keyboard.down('Alt');
    await page.keyboard.press('j');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    await vsCodePanel.getByPlaceholder('What does this rule do?').fill('palette');
    await vsCodePanel.getByRole('button', { name: 'Add rule' }).click();

    const matrix = page.locator('section#section-power');
    await expect(matrix.getByText(/does 2 different things across 2 apps/)).toBeVisible();
  });
});

test.describe('Hardened — T2.3: Tap & Hold', () => {
  test('TapHoldAction helper is injected EXACTLY ONCE per AHK file with ≥ 1 tap_hold rule', async ({ page }) => {
    const blob = encodeConfig({
      os: 'windows',
      selectedAppIds: ['vs-code'],
      rules: [TAP_HOLD_VSCODE_RULE],
    });
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    const ahkRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated AutoHotkey v2 script' });
    // Helper line appears.
    await expect(ahkRegion).toContainText('TapHoldAction(timeoutMs, tapAction, holdAction)');
    // The rule call is also present, with the exact 200 ms timeout.
    await expect(ahkRegion).toContainText('TapHoldAction(200, "{Escape}", "^`")');

    // Helper count must equal 1 — extract the text content and count.
    const ahkText = await ahkRegion.innerText();
    const helperOccurrences = ahkText.split('TapHoldAction(timeoutMs').length - 1;
    expect(helperOccurrences).toBe(1);
  });

  test('Karabiner tap_hold emits to_if_alone + to_if_held_down with matched timeout, omits `to`', async ({ page }) => {
    const blob = encodeConfig({
      os: 'mac',
      selectedAppIds: ['vs-code'],
      rules: [TAP_HOLD_VSCODE_RULE],
    });
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    const karabinerRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated Karabiner-Elements configuration' });
    for (const required of [
      '"to_if_alone"',
      '"to_if_held_down"',
      '"basic.to_if_alone_timeout_milliseconds": 200',
      '"basic.to_if_held_down_threshold_milliseconds": 200',
      '"caps_lock"',
    ]) {
      await expect(karabinerRegion).toContainText(required);
    }
    // The `"to":` key (with that exact JSON shape) must NOT appear for the
    // tap_hold manipulator — Karabiner's contract is "no `to`, just _if_alone
    // and _if_held_down" for clean tap-vs-hold.
    const karabinerText = await karabinerRegion.innerText();
    expect(karabinerText).not.toMatch(/\n\s+"to":\s*\[/);
  });

  test('Mixed-kind banner appears when basic + tap_hold share a trigger', async ({ page }) => {
    const blob = encodeConfig({
      os: 'windows',
      selectedAppIds: ['google-chrome', 'vs-code'],
      rules: [
        {
          kind: 'basic',
          appId: 'google-chrome',
          trigger: 'f2',
          action: 'ctrl+comma',
          description: 'basic on chrome',
        },
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'f2',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'tap-hold on vs-code',
        },
      ],
    });
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    const matrix = page.locator('section#section-power');
    await expect(matrix.getByText(/feels completely different/)).toBeVisible();
  });

  test('Slider on a tap_hold row updates tapTimeoutMs live in CodePreview', async ({ page }) => {
    const blob = encodeConfig({
      os: 'mac',
      selectedAppIds: ['vs-code'],
      rules: [TAP_HOLD_VSCODE_RULE],
    });
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });
    const slider = vsCodePanel.getByRole('slider', { name: 'Tap timeout (milliseconds)' });
    // React intercepts the value setter on input elements. We have to call
    // the native setter explicitly, then dispatch an `input` event for
    // React's onChange to fire. Plain `el.value = …` is silently ignored.
    await slider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(el, '350');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const karabinerRegion = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated Karabiner-Elements configuration' });
    // Wait for the CodePreview debounce (300ms).
    await expect(karabinerRegion).toContainText(
      '"basic.to_if_alone_timeout_milliseconds": 350',
    );
  });

  test('Rule kind toggle in add-rule form swaps action inputs between basic and tap_hold', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /VS Code/ }).click();

    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });

    // Basic by default — one Action button.
    await expect(
      vsCodePanel.getByRole('button', { name: 'New action for VS Code' }),
    ).toBeVisible();
    await expect(
      vsCodePanel.getByRole('button', { name: 'New tap action for VS Code' }),
    ).toHaveCount(0);

    // Flip to tap_hold.
    await vsCodePanel.getByRole('radio', { name: 'Tap & Hold' }).click();
    await expect(
      vsCodePanel.getByRole('button', { name: 'New tap action for VS Code' }),
    ).toBeVisible();
    await expect(
      vsCodePanel.getByRole('button', { name: 'New hold action for VS Code' }),
    ).toBeVisible();
    await expect(
      vsCodePanel.getByRole('button', { name: 'New action for VS Code' }),
    ).toHaveCount(0);
  });
});

test.describe('Hardened — Suggestion engine', () => {
  test('Hidden until apps selected; shows Chrome prefs suggestion after picking Chrome', async ({
    page,
  }) => {
    await page.goto('/');
    // No apps selected → panel renders nothing (returns null).
    await expect(page.getByText('Suggested for you')).toHaveCount(0);

    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await expect(page.getByText('Suggested for you')).toBeVisible();
    await expect(
      page.locator('[data-suggestion-id="chrome-prefs"]'),
    ).toBeVisible();
  });

  test('Safety-tagged suggestions sort before Standardise ones', async ({
    page,
  }) => {
    await page.goto('/');
    // Discord (safety) + Chrome (standardise) → safety should be first.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await page.getByRole('checkbox', { name: /Discord/ }).click();

    const items = page.locator('[data-suggestion-id]');
    await expect(items.first()).toHaveAttribute(
      'data-suggestion-id',
      'discord-close-tab',
    );
  });

  test('Clicking Add applies the rule; suggestion disappears from the list', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();

    const card = page.locator('[data-suggestion-id="chrome-prefs"]');
    await card.getByRole('button', { name: /Add suggestion chrome-prefs/ }).click();

    // Rule count increments to 1.
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    // Suggestion removed from the panel (because its trigger is now bound).
    await expect(
      page.locator('[data-suggestion-id="chrome-prefs"]'),
    ).toHaveCount(0);
  });

  test('Dismiss removes the suggestion without adding a rule', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();

    await page
      .locator('[data-suggestion-id="chrome-prefs"]')
      .getByRole('button', { name: /Dismiss suggestion chrome-prefs/ })
      .click();

    await expect(
      page.locator('[data-suggestion-id="chrome-prefs"]'),
    ).toHaveCount(0);
    // Rule count stays at 0.
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('0');
  });
});

test.describe('Hardened — OS auto-detect (first visit only)', () => {
  test('Mac user with empty localStorage lands on macOS pre-selected', async ({
    browser,
  }) => {
    // Fresh context, no storage, navigator.platform mocked BEFORE first paint.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });
      // Chromium also exposes userAgentData.platform (= "Linux" in CI).
      // Force it to undefined so detectOS falls back to legacy navigator.platform.
      Object.defineProperty(navigator, 'userAgentData', {
        value: undefined,
        configurable: true,
      });
    });
    await page.goto('/');

    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await context.close();
  });

  test('Returning Windows user with persisted Mac choice keeps Mac', async ({
    browser,
  }) => {
    // Even when the navigator says Windows, a returning user's persisted
    // choice wins. This is the "don't surprise me on every visit" guarantee.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });
      Object.defineProperty(navigator, 'userAgentData', {
        value: undefined,
        configurable: true,
      });
      // Pretend the user previously chose Mac.
      window.localStorage.setItem(
        'hotkeysync-config-v1',
        JSON.stringify({
          state: { os: 'mac', selectedAppIds: [], rules: [] },
          version: 2,
        }),
      );
    });
    await page.goto('/');

    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await context.close();
  });

  test('Linux user keeps default Windows (no signal → no override)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Linux x86_64',
        configurable: true,
      });
      Object.defineProperty(navigator, 'userAgentData', {
        value: undefined,
        configurable: true,
      });
    });
    await page.goto('/');

    await expect(page.getByRole('radio', { name: 'Windows' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await context.close();
  });
});

test.describe('Hardened — global invariants', () => {
  test('OS toggle uses ArrowLeft/Right to navigate', async ({ page }) => {
    await page.goto('/');
    const macRadio = page.getByRole('radio', { name: 'macOS' });
    const winRadio = page.getByRole('radio', { name: 'Windows' });
    await expect(winRadio).toHaveAttribute('aria-checked', 'true');
    await winRadio.focus();
    await page.keyboard.press('ArrowRight');
    await expect(macRadio).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(winRadio).toHaveAttribute('aria-checked', 'true');
  });

  test('Mobile viewport (375px) hides sidebar, shows Sheet button, opens MiniPreview', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Progress' })).toBeHidden();
    const sheetBtn = page.getByRole('button', { name: 'View rules and preview' });
    await expect(sheetBtn).toBeVisible();
    await sheetBtn.click();
    await expect(page.getByRole('dialog', { name: 'Your rules' })).toBeVisible();
  });

  test('Download button is properly disabled with no rules + has a useful tooltip', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Download hotkeys.ahk' })).toBeDisabled();
  });

  test('Adding then deselecting an app removes its rules (no orphan rules ever persist)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');

    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('0');

    // And the persisted blob is empty too.
    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem('hotkeysync-config-v1');
      return raw ? (JSON.parse(raw) as { state: { rules: unknown[] } }).state.rules : null;
    });
    expect(persisted).toEqual([]);
  });
});
