/**
 * Backbone invariants for the app catalogue. These guard against silent data
 * drift as we expand from ~20 to ~100 apps. Every change to `apps.json` must
 * keep these green or CI fails.
 *
 * Why a unit test instead of a runtime check: apps.json is a static asset
 * imported at build time. Catching a malformed entry at unit-test time (zero
 * runtime cost) is preferable to validating it on every page load.
 */
import { describe, it, expect } from 'vitest';
import appsData from '@/data/apps.json';
import { appsCatalogueSchema } from '@/lib/schemas';
import type { App } from '@/types';

const APPS = appsData as App[];

describe('apps.json — catalogue invariants', () => {
  it('parses cleanly against the strict app schema', () => {
    const parsed = appsCatalogueSchema.safeParse(APPS);
    if (!parsed.success) {
      // Surface the failing entries so the test message is actionable.
      console.log(JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.success).toBe(true);
  });

  it('every id is unique', () => {
    const ids = APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every Windows-platformed app has a non-empty exeName', () => {
    for (const app of APPS) {
      const platforms = app.platforms ?? ['windows', 'mac'];
      if (platforms.includes('windows')) {
        expect(
          app.exeName,
          `App "${app.id}" missing exeName despite platforms including windows`,
        ).toBeTruthy();
      }
    }
  });

  it('every macOS-platformed app has a non-empty bundleId', () => {
    for (const app of APPS) {
      const platforms = app.platforms ?? ['windows', 'mac'];
      if (platforms.includes('mac')) {
        expect(
          app.bundleId,
          `App "${app.id}" missing bundleId despite platforms including mac`,
        ).toBeTruthy();
      }
    }
  });

  it('every exeName matches the *.exe convention (case as on disk)', () => {
    for (const app of APPS) {
      if (!app.exeName) continue;
      expect(
        app.exeName.toLowerCase().endsWith('.exe'),
        `App "${app.id}" exeName "${app.exeName}" does not end with .exe`,
      ).toBe(true);
    }
  });

  it('every bundleId looks like reverse-DNS (at least one dot, no whitespace)', () => {
    for (const app of APPS) {
      if (!app.bundleId) continue;
      expect(
        /^[A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z0-9.\-]+$/.test(app.bundleId),
        `App "${app.id}" bundleId "${app.bundleId}" does not look like reverse-DNS`,
      ).toBe(true);
      expect(/\s/.test(app.bundleId)).toBe(false);
    }
  });

  it('aliases (if present) are distinct from the name and from each other', () => {
    for (const app of APPS) {
      if (!app.aliases) continue;
      const nameLower = app.name.toLowerCase();
      const aliasLowers = app.aliases.map((a) => a.toLowerCase());
      // No alias should be a duplicate of the name itself (pointless).
      expect(
        aliasLowers.includes(nameLower),
        `App "${app.id}" has an alias that duplicates its name`,
      ).toBe(false);
      // Aliases within an app must be unique.
      expect(new Set(aliasLowers).size).toBe(aliasLowers.length);
    }
  });

  it('every app belongs to exactly one of the known categories', () => {
    const known = new Set([
      'Browsers',
      'Editors',
      'Terminals',
      'Notes',
      'Mail',
      'Communication',
      'Design',
      'Office',
      'Media',
      'DevTools',
    ]);
    for (const app of APPS) {
      expect(known.has(app.category), `Unknown category for "${app.id}"`).toBe(
        true,
      );
    }
  });

  it('JetBrains bundleIds share the com.jetbrains.* prefix (inconsistent casing is allowed)', () => {
    // WebStorm + CLion preserve CamelCase in their bundle ids; IDEA, PyCharm,
    // GoLand etc. go lowercase. This invariant catches typos like
    // "com.jetBrains.intellij" but does NOT enforce a uniform case rule.
    const jetbrains = APPS.filter((a) => a.bundleId?.startsWith('com.jetbrains.'));
    for (const app of jetbrains) {
      expect(app.bundleId).toMatch(/^com\.jetbrains\.[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it('platform-exclusive apps have the matching identifier ONLY', () => {
    for (const app of APPS) {
      const platforms = app.platforms ?? ['windows', 'mac'];
      if (platforms.length === 1 && platforms[0] === 'mac') {
        expect(
          app.exeName,
          `Mac-only app "${app.id}" should NOT have an exeName`,
        ).toBeUndefined();
      }
      if (platforms.length === 1 && platforms[0] === 'windows') {
        expect(
          app.bundleId,
          `Windows-only app "${app.id}" should NOT have a bundleId`,
        ).toBeUndefined();
      }
    }
  });

  it('lockedShortcuts flag is only set on apps verified by two independent sources', () => {
    // Source policy (project_twitter_pinterest_validation.md): an app gets
    // lockedShortcuts=true only if (a) its official docs confirm no in-app
    // shortcut editor AND (b) Reddit/HN/forum threads show user complaints
    // about it. Cross-source matrix lives in the linked memory file.
    const expectedLocked = new Set([
      'slack',    // Reddit + HN dogpile; Slack KB confirms zero customization
      'notion',   // r/Notion + Notion product docs
      'figma',    // soft signal; Figma docs confirm no editor
      'spotify',  // weak signal; Spotify community confirms
      'outlook',  // MS TechCommunity (post-New-Outlook regression)
    ]);
    for (const app of APPS) {
      const isLocked = app.lockedShortcuts === true;
      const expected = expectedLocked.has(app.id);
      expect(
        isLocked,
        `lockedShortcuts mismatch for "${app.id}": expected ${expected}, got ${isLocked}`,
      ).toBe(expected);
    }
  });
});
