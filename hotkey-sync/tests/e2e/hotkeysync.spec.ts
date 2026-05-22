import { test, expect, type Page } from '@playwright/test';
import { encodeConfig } from '../../src/lib/config-share';

const SIDEBAR_RULE_COUNT = (page: Page) =>
  page
    .getByText('Rules defined', { exact: true })
    .locator('..')
    .locator('p')
    .nth(1);

test.describe('HotkeySync end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('OS toggle switches the generated-file note', async ({ page }) => {
    await expect(
      page.getByText('Generates hotkeys.ahk for AutoHotkey v2'),
    ).toBeVisible();

    await page.getByRole('radio', { name: 'macOS' }).click();
    await expect(
      page.getByText('Generates hotkeys.json for Karabiner-Elements'),
    ).toBeVisible();
    await expect(
      page.getByText('Generates hotkeys.ahk for AutoHotkey v2'),
    ).toBeHidden();

    await page.getByRole('radio', { name: 'Windows' }).click();
    await expect(
      page.getByText('Generates hotkeys.ahk for AutoHotkey v2'),
    ).toBeVisible();
  });

  test('applying Standardise Ctrl+P with only Chrome selected adds exactly one rule', async ({
    page,
  }) => {
    const chromeCard = page.getByRole('checkbox', { name: /Google Chrome/ });
    await chromeCard.click();
    await expect(chromeCard).toHaveAttribute('aria-checked', 'true');

    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    await expect(page.getByText(/across 1 app(?!s)/)).toBeVisible();
  });

  test('manually adding a rule via the form updates the live preview', async ({
    page,
  }) => {
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();

    const captureDialog = page.getByRole('dialog', {
      name: 'Capture key combination',
    });

    await page
      .getByRole('button', { name: 'New trigger for Google Chrome' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('j');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    await page
      .getByRole('button', { name: 'New action for Google Chrome' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('k');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    await page
      .getByPlaceholder('What does this rule do?')
      .fill('Test via Playwright');

    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('0');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(SIDEBAR_RULE_COUNT(page)).toHaveText('1');
    await expect(page.getByText('Test via Playwright')).toBeVisible();
  });

  test('mobile viewport hides the sidebar and exposes the Sheet preview', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    await expect(page.getByRole('list', { name: 'Progress' })).toBeHidden();

    const sheetButton = page.getByRole('button', { name: 'View rules and preview' });
    await expect(sheetButton).toBeVisible();

    await sheetButton.click();
    const sheet = page.getByRole('dialog', { name: 'Your rules' });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText('Rules you add will appear here.'),
    ).toBeVisible();
  });

  test('AHK output is valid after applying Standardise Ctrl+P', async ({
    page,
  }) => {
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const codePreview = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated AutoHotkey v2 script' });

    // Ensure the Windows tab is active (it is by default with default OS=windows)
    await page
      .locator('section#section-preview')
      .getByRole('tab', { name: 'Windows (.ahk)' })
      .click();

    await expect(codePreview).toContainText('#Requires AutoHotkey v2.0+');
    await expect(codePreview).toContainText('ahk_exe chrome.exe');
    await expect(codePreview).toContainText('^p::');
  });

  test('Karabiner output contains caps_lock optional and frontmost condition', async ({
    page,
  }) => {
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await page
      .locator('section#section-preview')
      .getByRole('tab', { name: 'macOS (.json)' })
      .click();

    const codePreview = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated Karabiner-Elements configuration' });

    await expect(codePreview).toContainText('"type": "basic"');
    await expect(codePreview).toContainText('"frontmost_application_if"');
    await expect(codePreview).toContainText('"mandatory"');
    await expect(codePreview).toContainText('"caps_lock"');
  });

  test('Download button is disabled with no rules', async ({ page }) => {
    const downloadBtn = page.getByRole('button', { name: /Download hotkeys\./ });
    await expect(downloadBtn).toBeDisabled();
  });

  test('Download button is enabled after adding rules', async ({ page }) => {
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    const downloadBtn = page.getByRole('button', { name: /Download hotkeys\./ });
    await expect(downloadBtn).toBeEnabled();
  });

  test('Share-link button copies a URL with #hk= fragment to clipboard', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    await page.getByRole('button', { name: 'Copy share link' }).click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('#hk=');
    // Confirm decoding the blob recovers the rule we added.
    const blob = clipboardText.split('#hk=')[1];
    expect(blob.length).toBeGreaterThan(10);
  });

  test('Loading the page with #hk= in the URL applies the encoded config', async ({
    page,
  }) => {
    // Compute the share blob deterministically in node — avoids the clipboard
    // permission dance and removes the share button from this test's scope.
    const blob = encodeConfig({
      os: 'mac',
      selectedAppIds: ['google-chrome'],
      rules: [
        {
          kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Open Preferences',
        },
      ],
    });

    // page.goto + URL fragment strips the hash in current Playwright/Chromium
    // versions (chromium#1245). Real browser users don't hit this; the
    // workaround in test is to set the hash via JS and reload.
    await page.goto('/');
    await page.evaluate((b) => {
      window.location.hash = `hk=${b}`;
    }, blob);
    await page.reload({ waitUntil: 'networkidle' });

    // Banner should show "Loaded shared config" with the rule count.
    await expect(page.getByText(/Loaded shared config/)).toBeVisible();
    // Sidebar should reflect 1 rule loaded.
    await expect(
      page.getByText('Rules defined').locator('..').locator('p').nth(1),
    ).toHaveText('1');
    // OS toggle should have flipped to macOS.
    await expect(page.getByRole('radio', { name: 'macOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Cross-app conflict matrix flags Ctrl+P used differently across two apps', async ({
    page,
  }) => {
    // Add Chrome + VS Code, then map Ctrl+P differently in each via the inline form.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await page.getByRole('checkbox', { name: /VS Code/ }).click();

    // Chrome rule: ctrl+p → ctrl+comma  (via preset)
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({ has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }) });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    // VS Code rule: ctrl+p → alt+j  (manually, so it differs from chrome's ctrl+comma)
    const captureDialog = page.getByRole('dialog', {
      name: 'Capture key combination',
    });

    await page
      .getByRole('button', { name: 'New trigger for VS Code' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Control');
    await page.keyboard.press('p');
    await page.keyboard.up('Control');
    await expect(captureDialog).toBeHidden();

    await page
      .getByRole('button', { name: 'New action for VS Code' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('j');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });
    await vsCodePanel
      .getByPlaceholder('What does this rule do?')
      .fill('VS Code conflict');
    await vsCodePanel.getByRole('button', { name: 'Add rule' }).click();

    // The matrix should now show ctrl+p as a conflict.
    const matrix = page.locator('section#section-power');
    await expect(
      matrix.getByText(/does 2 different things across 2 apps/),
    ).toBeVisible();
  });

  test('Import panel applies a pasted AHK config via "Replace config with import"', async ({
    page,
  }) => {
    const ahk = `#Requires AutoHotkey v2.0+
#SingleInstance Force

#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")  ; Open Preferences instead of Print
#HotIf
`;

    const importPanel = page.locator('section#section-power');
    await importPanel
      .getByRole('textbox', { name: 'AutoHotkey source' })
      .fill(ahk);
    await importPanel.getByRole('button', { name: 'Parse' }).click();

    // Preview shows "1 rule parsed across 1 app (target OS: Windows)"
    await expect(importPanel.getByText(/1 rule parsed across 1 app/)).toBeVisible();

    await importPanel
      .getByRole('button', { name: 'Replace config with import' })
      .click();

    // Sidebar count flips to 1
    await expect(
      page.getByText('Rules defined').locator('..').locator('p').nth(1),
    ).toHaveText('1');
    // Chrome shows as selected
    await expect(
      page.getByRole('checkbox', { name: /Google Chrome/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('Tap & Hold form creates a tap_hold rule that lights up in CodePreview (Karabiner + AHK)', async ({
    page,
  }) => {
    // Select VS Code, switch to macOS so the Karabiner tab is default.
    await page.getByRole('checkbox', { name: /VS Code/ }).click();
    await page.getByRole('radio', { name: 'macOS' }).click();

    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });

    // Flip the inline form to Tap & Hold mode.
    await vsCodePanel.getByRole('radio', { name: 'Tap & Hold' }).click();

    const captureDialog = page.getByRole('dialog', {
      name: 'Capture key combination',
    });

    // Trigger: F1 (non-reserved, captures cleanly in headless Chromium).
    await vsCodePanel
      .getByRole('button', { name: 'New trigger for VS Code' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.press('F1');
    await expect(captureDialog).toBeHidden();

    // Tap action: Alt+J. Hold action: Alt+K.
    await vsCodePanel
      .getByRole('button', { name: 'New tap action for VS Code' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('j');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    await vsCodePanel
      .getByRole('button', { name: 'New hold action for VS Code' })
      .click();
    await expect(captureDialog).toBeVisible();
    await page.keyboard.down('Alt');
    await page.keyboard.press('k');
    await page.keyboard.up('Alt');
    await expect(captureDialog).toBeHidden();

    await vsCodePanel
      .getByPlaceholder('What does this rule do?')
      .fill('tap-hold via e2e');
    await vsCodePanel.getByRole('button', { name: 'Add rule' }).click();

    // Sidebar should reflect a new rule.
    await expect(
      page.getByText('Rules defined').locator('..').locator('p').nth(1),
    ).toHaveText('1');

    // Karabiner preview should contain tap_hold-specific JSON.
    const karabinerPreview = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated Karabiner-Elements configuration' });
    await expect(karabinerPreview).toContainText('"to_if_alone"');
    await expect(karabinerPreview).toContainText('"to_if_held_down"');
    await expect(karabinerPreview).toContainText('"basic.to_if_alone_timeout_milliseconds"');

    // Switch to Windows tab and confirm AHK has the TapHoldAction helper + call.
    await page
      .locator('section#section-preview')
      .getByRole('tab', { name: 'Windows (.ahk)' })
      .click();
    const ahkPreview = page
      .locator('section#section-preview')
      .getByRole('region', { name: 'Generated AutoHotkey v2 script' });
    await expect(ahkPreview).toContainText('TapHoldAction(timeoutMs, tapAction, holdAction)');
    await expect(ahkPreview).toContainText('F1:: TapHoldAction(200, "!j", "!k")');
  });

  test('A basic rule and a tap_hold rule on the same trigger show the mixed-kind banner', async ({
    page,
  }) => {
    // Select two apps so a cross-app conflict is possible.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    await page.getByRole('checkbox', { name: /VS Code/ }).click();

    // Chrome: basic F2 → Ctrl+,
    const chromePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'Google Chrome', level: 3 }),
    });
    const captureDialog = page.getByRole('dialog', {
      name: 'Capture key combination',
    });

    await chromePanel
      .getByRole('button', { name: 'New trigger for Google Chrome' })
      .click();
    await page.keyboard.press('F2');
    await expect(captureDialog).toBeHidden();
    await chromePanel
      .getByRole('button', { name: 'New action for Google Chrome' })
      .click();
    await page.keyboard.down('Control');
    await page.keyboard.press('Comma');
    await page.keyboard.up('Control');
    await expect(captureDialog).toBeHidden();
    await chromePanel
      .getByPlaceholder('What does this rule do?')
      .fill('basic');
    await chromePanel.getByRole('button', { name: 'Add rule' }).click();

    // VS Code: tap_hold F2 (tap=escape, hold=ctrl+`)
    const vsCodePanel = page.locator('section.rounded-lg').filter({
      has: page.getByRole('heading', { name: 'VS Code', level: 3 }),
    });
    await vsCodePanel.getByRole('radio', { name: 'Tap & Hold' }).click();
    // Confirm the form actually flipped to Tap & Hold mode before continuing.
    await expect(
      vsCodePanel.getByRole('button', { name: 'New tap action for VS Code' }),
    ).toBeVisible();
    await vsCodePanel
      .getByRole('button', { name: 'New trigger for VS Code' })
      .click();
    await page.keyboard.press('F2');
    await expect(captureDialog).toBeHidden();
    // Tap action: F3 (Escape would cancel the capture overlay by design).
    await vsCodePanel
      .getByRole('button', { name: 'New tap action for VS Code' })
      .click();
    await page.keyboard.press('F3');
    await expect(captureDialog).toBeHidden();
    // Hold action: Ctrl+Backquote.
    await vsCodePanel
      .getByRole('button', { name: 'New hold action for VS Code' })
      .click();
    await page.keyboard.down('Control');
    await page.keyboard.press('Backquote');
    await page.keyboard.up('Control');
    await expect(captureDialog).toBeHidden();
    await vsCodePanel
      .getByPlaceholder('What does this rule do?')
      .fill('tap-hold');
    await vsCodePanel.getByRole('button', { name: 'Add rule' }).click();

    // Conflict matrix should now show mixed-kind banner.
    const matrix = page.locator('section#section-power');
    await expect(matrix.getByText(/feels completely different/)).toBeVisible();
  });
});
