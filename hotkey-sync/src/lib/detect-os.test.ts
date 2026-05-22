import { describe, it, expect } from 'vitest';
import { detectOS } from '@/lib/detect-os';

describe('detectOS', () => {
  it('prefers userAgentData.platform over legacy navigator.platform', () => {
    expect(
      detectOS({ userAgentData: { platform: 'macOS' }, platform: 'Win32' }),
    ).toBe('mac');
  });

  it('detects Windows via userAgentData', () => {
    expect(detectOS({ userAgentData: { platform: 'Windows' } })).toBe('windows');
  });

  it('detects macOS via userAgentData', () => {
    expect(detectOS({ userAgentData: { platform: 'macOS' } })).toBe('mac');
  });

  it('falls back to legacy MacIntel', () => {
    expect(detectOS({ platform: 'MacIntel' })).toBe('mac');
  });

  it('falls back to legacy Win32', () => {
    expect(detectOS({ platform: 'Win32' })).toBe('windows');
  });

  it('falls back to legacy Win64', () => {
    expect(detectOS({ platform: 'Win64' })).toBe('windows');
  });

  it('returns null on Linux', () => {
    expect(detectOS({ platform: 'Linux x86_64' })).toBeNull();
  });

  it('returns null on Android', () => {
    expect(
      detectOS({ userAgentData: { platform: 'Android' }, platform: 'Linux armv8l' }),
    ).toBeNull();
  });

  it('returns null on iOS', () => {
    expect(detectOS({ userAgentData: { platform: 'iOS' }, platform: 'iPhone' })).toBeNull();
  });

  it('returns null on null / undefined navigator', () => {
    expect(detectOS(null)).toBeNull();
    expect(detectOS(undefined)).toBeNull();
  });

  it('returns null when both platform fields are empty', () => {
    expect(
      detectOS({ userAgentData: { platform: '' }, platform: '' }),
    ).toBeNull();
  });

  it('detects darwin (rare, e.g. headless tooling)', () => {
    expect(detectOS({ platform: 'darwin' })).toBe('mac');
  });
});
