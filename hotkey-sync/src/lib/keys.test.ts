import { describe, it, expect } from 'vitest';
import {
  parseKeyCombo,
  serializeKeyCombo,
  comboToAHK,
  comboToKarabinerFrom,
} from '@/lib/keys';

describe('parseKeyCombo', () => {
  it('parses a single modifier and key', () => {
    expect(parseKeyCombo('ctrl+p')).toEqual({ modifiers: ['ctrl'], key: 'p' });
  });

  it('sorts modifiers alphabetically', () => {
    expect(parseKeyCombo('ctrl+shift+p')).toEqual({
      modifiers: ['ctrl', 'shift'],
      key: 'p',
    });
  });

  it('is order-insensitive across modifiers', () => {
    expect(parseKeyCombo('shift+ctrl+p')).toEqual(parseKeyCombo('ctrl+shift+p'));
  });

  it('parses a bare key with no modifiers', () => {
    expect(parseKeyCombo('escape')).toEqual({ modifiers: [], key: 'escape' });
  });

  it('parses a modifier with a function key', () => {
    expect(parseKeyCombo('alt+f4')).toEqual({ modifiers: ['alt'], key: 'f4' });
  });

  it('throws on an unknown key segment', () => {
    expect(() => parseKeyCombo('ctrl+xyz')).toThrow(/xyz/);
  });

  it('throws on an empty string', () => {
    expect(() => parseKeyCombo('')).toThrow(/empty/i);
  });

  it('is case-insensitive', () => {
    expect(parseKeyCombo('CTRL+P')).toEqual({ modifiers: ['ctrl'], key: 'p' });
  });

  it('accepts modifiers and key in any order', () => {
    expect(parseKeyCombo('p+ctrl')).toEqual({ modifiers: ['ctrl'], key: 'p' });
  });
});

describe('serializeKeyCombo', () => {
  it('joins sorted modifiers with the key', () => {
    expect(serializeKeyCombo({ modifiers: ['ctrl', 'shift'], key: 'p' })).toBe(
      'ctrl+shift+p',
    );
  });

  it('serialises a bare key without a separator', () => {
    expect(serializeKeyCombo({ modifiers: [], key: 'escape' })).toBe('escape');
  });

  it('always emits modifiers in alphabetical order', () => {
    expect(serializeKeyCombo({ modifiers: ['shift', 'alt', 'ctrl'], key: 'p' })).toBe(
      'alt+ctrl+shift+p',
    );
  });
});

describe('comboToAHK', () => {
  it('encodes ctrl+shift+p as ^+p', () => {
    expect(comboToAHK({ modifiers: ['ctrl', 'shift'], key: 'p' })).toBe('^+p');
  });

  it('encodes ctrl+comma as ^,', () => {
    expect(comboToAHK({ modifiers: ['ctrl'], key: 'comma' })).toBe('^,');
  });

  it('encodes a bare named key as its AHK name', () => {
    expect(comboToAHK({ modifiers: [], key: 'escape' })).toBe('Escape');
  });
});

describe('comboToKarabinerFrom', () => {
  it('maps ctrl to a mandatory control modifier', () => {
    expect(comboToKarabinerFrom({ modifiers: ['ctrl'], key: 'p' })).toEqual({
      key_code: 'p',
      modifiers: { mandatory: ['control'] },
    });
  });

  it('omits the modifiers field when there are none', () => {
    expect(comboToKarabinerFrom({ modifiers: [], key: 'comma' })).toEqual({
      key_code: 'comma',
    });
  });

  it('maps multiple modifiers in input order', () => {
    expect(comboToKarabinerFrom({ modifiers: ['ctrl', 'shift'], key: 'p' })).toEqual({
      key_code: 'p',
      modifiers: { mandatory: ['control', 'shift'] },
    });
  });
});
