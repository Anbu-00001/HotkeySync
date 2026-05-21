import { test, expect, type Page } from '@playwright/test';

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
});
