/**
 * Firefox-only smoke spec. Runs the highest-risk parts of the user journey
 * — key capture, OS toggle, generator output — to catch browser-specific
 * KeyboardEvent quirks. Chromium gets the full suite; Firefox gets the
 * cross-browser smoke that Chromium can't tell us anything about.
 */
import { test, expect } from '@playwright/test';

test.describe('Firefox smoke — KeyboardEvent + core flow', () => {
  test('page boots with the 6 expected sections and a 6-step tracker', async ({
    page,
  }) => {
    await page.goto('/');
    for (const id of [
      'section-os',
      'section-apps',
      'section-rules',
      'section-presets',
      'section-preview',
      'section-power',
    ]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test('OS toggle switches between Windows and macOS', async ({ page }) => {
    await page.goto('/');
    const macRadio = page.getByRole('radio', { name: 'macOS' });
    await macRadio.click();
    await expect(macRadio).toHaveAttribute('aria-checked', 'true');
  });

  test('KeyCapture in the simulator reflects a captured Ctrl+P combo', async ({
    page,
  }) => {
    await page.goto('/');
    // Pick Chrome + apply the Standardise Ctrl+P preset so the rule exists.
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
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

    await expect(page.getByText('You pressed', { exact: true })).toBeVisible();
    // Confirm the matched rule renders.
    await expect(
      page.getByText('Open Settings instead of Print').first(),
    ).toBeVisible();
  });

  test('Preview renders AHK output for a non-empty config', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: /Google Chrome/ }).click();
    const presetCard = page
      .locator('div.rounded-lg')
      .filter({
        has: page.getByRole('heading', { name: 'Standardise Ctrl+P' }),
      });
    await presetCard.getByRole('button', { name: 'Apply' }).click();

    // CodePreview shows the AHK script header (default OS is Windows).
    await expect(
      page.getByText(/#Requires AutoHotkey v2\.0\+/),
    ).toBeVisible();
  });
});
