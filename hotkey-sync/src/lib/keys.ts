export const MODIFIERS = ['ctrl', 'shift', 'alt', 'meta'] as const;
export type Modifier = (typeof MODIFIERS)[number];

export const TRIGGER_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'comma', 'period', 'slash', 'semicolon', 'quote',
  'open_bracket', 'close_bracket', 'backslash', 'grave_accent',
  'minus', 'equal', 'space', 'tab', 'escape',
  'return_or_enter', 'delete_or_backspace', 'delete_forward',
  'up_arrow', 'down_arrow', 'left_arrow', 'right_arrow',
  'home', 'end', 'page_up', 'page_down',
  // Caps Lock as a trigger key — unlocks the canonical Caps-Lock-as-Esc/Ctrl
  // dual-role rule (the highest-signal global rule in our research corpus).
  // Karabiner maps it directly; AHK supports `CapsLock::` natively.
  'caps_lock',
] as const;
export type TriggerKey = (typeof TRIGGER_KEYS)[number];

const MODIFIER_SET: ReadonlySet<string> = new Set<string>(MODIFIERS);
const TRIGGER_SET: ReadonlySet<string> = new Set<string>(TRIGGER_KEYS);

function isModifier(value: string): value is Modifier {
  return MODIFIER_SET.has(value);
}

function isTriggerKey(value: string): value is TriggerKey {
  return TRIGGER_SET.has(value);
}

export interface KeyCombo {
  modifiers: Modifier[];
  key: TriggerKey;
}

export function parseKeyCombo(raw: string): KeyCombo {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('Key combo string is empty');
  }
  const segments = raw
    .toLowerCase()
    .split('+')
    .map((s) => s.trim());

  if (segments.some((s) => s.length === 0)) {
    throw new Error(`Invalid key combo "${raw}": empty segment`);
  }

  const mods: Modifier[] = [];
  let key: TriggerKey | undefined;

  for (const segment of segments) {
    if (isModifier(segment)) {
      mods.push(segment);
      continue;
    }
    if (isTriggerKey(segment)) {
      if (key !== undefined) {
        throw new Error(
          `Invalid key combo "${raw}": multiple non-modifier keys ("${key}" and "${segment}")`,
        );
      }
      key = segment;
      continue;
    }
    throw new Error(`Invalid key combo "${raw}": unknown segment "${segment}"`);
  }

  if (key === undefined) {
    throw new Error(`Invalid key combo "${raw}": missing trigger key`);
  }

  const uniqueSorted = Array.from(new Set(mods)).sort((a, b) => a.localeCompare(b));

  return { modifiers: uniqueSorted, key };
}

export function serializeKeyCombo(combo: KeyCombo): string {
  const mods = [...combo.modifiers].sort((a, b) => a.localeCompare(b));
  return mods.length === 0 ? combo.key : `${mods.join('+')}+${combo.key}`;
}

export const AHK_MODIFIER_MAP: Record<Modifier, string> = {
  ctrl: '^',
  shift: '+',
  alt: '!',
  meta: '#',
};

export const AHK_KEY_MAP: Record<TriggerKey, string> = {
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'i',
  j: 'j', k: 'k', l: 'l', m: 'm', n: 'n', o: 'o', p: 'p', q: 'q', r: 'r',
  s: 's', t: 't', u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z',
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
  f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: "'",
  open_bracket: '[',
  close_bracket: ']',
  backslash: '\\',
  grave_accent: '`',
  minus: '-',
  equal: '=',
  space: 'Space',
  tab: 'Tab',
  escape: 'Escape',
  return_or_enter: 'Enter',
  delete_or_backspace: 'Backspace',
  delete_forward: 'Delete',
  up_arrow: 'Up',
  down_arrow: 'Down',
  left_arrow: 'Left',
  right_arrow: 'Right',
  home: 'Home',
  end: 'End',
  page_up: 'PgUp',
  page_down: 'PgDn',
  caps_lock: 'CapsLock',
};

export const KARABINER_MODIFIER_MAP: Record<Modifier, string> = {
  ctrl: 'control',
  shift: 'shift',
  alt: 'option',
  meta: 'command',
};

export const KARABINER_KEY_MAP: Record<TriggerKey, string> = {
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'i',
  j: 'j', k: 'k', l: 'l', m: 'm', n: 'n', o: 'o', p: 'p', q: 'q', r: 'r',
  s: 's', t: 't', u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z',
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  f1: 'f1', f2: 'f2', f3: 'f3', f4: 'f4', f5: 'f5', f6: 'f6',
  f7: 'f7', f8: 'f8', f9: 'f9', f10: 'f10', f11: 'f11', f12: 'f12',
  comma: 'comma',
  period: 'period',
  slash: 'slash',
  semicolon: 'semicolon',
  quote: 'quote',
  open_bracket: 'open_bracket',
  close_bracket: 'close_bracket',
  backslash: 'backslash',
  grave_accent: 'grave_accent',
  minus: 'hyphen',
  equal: 'equal_sign',
  space: 'spacebar',
  tab: 'tab',
  escape: 'escape',
  return_or_enter: 'return_or_enter',
  delete_or_backspace: 'delete_or_backspace',
  delete_forward: 'delete_forward',
  up_arrow: 'up_arrow',
  down_arrow: 'down_arrow',
  left_arrow: 'left_arrow',
  right_arrow: 'right_arrow',
  home: 'home',
  end: 'end',
  page_up: 'page_up',
  page_down: 'page_down',
  caps_lock: 'caps_lock',
};

export function comboToAHK(combo: KeyCombo): string {
  const prefix = combo.modifiers.map((m) => AHK_MODIFIER_MAP[m]).join('');
  return `${prefix}${AHK_KEY_MAP[combo.key]}`;
}

export interface KarabinerFromEvent {
  key_code: string;
  modifiers?: { mandatory: string[] };
}

export function comboToKarabinerFrom(combo: KeyCombo): KarabinerFromEvent {
  const from: KarabinerFromEvent = { key_code: KARABINER_KEY_MAP[combo.key] };
  if (combo.modifiers.length > 0) {
    from.modifiers = {
      mandatory: combo.modifiers.map((m) => KARABINER_MODIFIER_MAP[m]),
    };
  }
  return from;
}
