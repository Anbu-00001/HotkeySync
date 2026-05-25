import {
  AHK_KEY_MAP,
  AHK_MODIFIER_MAP,
  comboToAHK,
  parseKeyCombo,
  type KeyCombo,
  type Modifier,
  type TriggerKey,
} from '@/lib/keys';
import type { Action, Config, HotkeyRule, LayerHotkeyRule } from '@/types';
import { GLOBAL_APP_ID } from '@/types';
import { isModifierAction, canonicaliseModifiers } from '@/lib/actions';
import { getAppById, groupRulesByAppId } from '@/lib/generators/shared';

/**
 * Wave 2.7 — AHK global flag name for a layer. PascalCase from layerName
 * (`vim-arrows` → `g_LayerVimArrows`). Mirrors Karabiner's
 * `hotkeysync_layer_<name>` convention in spirit.
 */
function layerVarNameAhk(layerName: string): string {
  const pascal = layerName
    .split('-')
    .filter((s) => s.length > 0)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
  return `g_Layer${pascal}`;
}

/**
 * Wave 2.9 — deterministic ToolTip slot for a layer (1..20). Per AHK v2 docs
 * ToolTip supports up to 20 simultaneous slots. Two layers with the same
 * hash will share a slot — acceptable since users rarely have >20 layers.
 * NOT `TrayTip`: Win10+ routes that through the toast queue (calls don't
 * replace, they queue) which is unfit for sub-second armed indicators.
 */
function layerToolTipSlot(layerName: string): number {
  let h = 0;
  for (let i = 0; i < layerName.length; i++) {
    h = (h * 31 + layerName.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 20) + 1;
}

/**
 * Wave 2.9 — armed-state text for the ToolTip indicator. Empty string from
 * the user means "auto-label"; custom string is taken verbatim. Escapes any
 * embedded `"` so the emitted Send literal stays valid AHK.
 */
function layerNotificationTextAhk(layer: LayerHotkeyRule): string {
  const raw =
    layer.notification === ''
      ? `${layer.layerName} layer armed`
      : (layer.notification ?? '');
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * AHK virtual key names for the four canonical modifiers, used when the
 * destination is modifier-only. Always emit the *Left* variant — matches
 * what Karabiner uses by default (left_control, left_command, etc.).
 */
const AHK_MODIFIER_VK: Record<Modifier, string> = {
  ctrl: 'LControl',
  shift: 'LShift',
  alt: 'LAlt',
  meta: 'LWin',
};

function modifierActionToAhkSendStr(modifiers: readonly Modifier[]): string {
  const mods = canonicaliseModifiers(modifiers);
  return mods.map((m) => `{${AHK_MODIFIER_VK[m]} down}`).join('');
}

function modifierActionToAhkUpStr(modifiers: readonly Modifier[]): string {
  const mods = canonicaliseModifiers(modifiers);
  return mods.map((m) => `{${AHK_MODIFIER_VK[m]} up}`).join('');
}

/**
 * Build the AHK `#HotIf` expression for a global rule's exception list.
 * Returns `null` when there are no usable exceptions — caller should emit the
 * rule with NO `#HotIf` directive (which makes it global by default in AHK).
 * Apps without an exeName (Mac-only entries) are filtered out.
 */
function buildGlobalHotIfExpr(
  exceptApps: readonly string[] | undefined,
): string | null {
  if (!exceptApps || exceptApps.length === 0) return null;
  const exes: string[] = [];
  for (const id of exceptApps) {
    const app = getAppById(id);
    if (app?.exeName) exes.push(app.exeName);
  }
  if (exes.length === 0) return null;
  // Wrap the disjunction in `!(…)` so the rule fires everywhere EXCEPT these.
  const inner = exes.map((e) => `WinActive("ahk_exe ${e}")`).join(' || ');
  return `#HotIf !(${inner})`;
}

const AHK_SEND_KEY_MAP: Partial<Record<TriggerKey, string>> = {
  tab: '{Tab}',
  escape: '{Escape}',
  return_or_enter: '{Enter}',
  delete_or_backspace: '{Backspace}',
  delete_forward: '{Delete}',
  up_arrow: '{Up}',
  down_arrow: '{Down}',
  left_arrow: '{Left}',
  right_arrow: '{Right}',
  home: '{Home}',
  end: '{End}',
  page_up: '{PgUp}',
  page_down: '{PgDn}',
  space: '{Space}',
  f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}',
  f5: '{F5}', f6: '{F6}', f7: '{F7}', f8: '{F8}',
  f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
};

function comboToAHKSend(combo: KeyCombo): string {
  const prefix = combo.modifiers.map((m) => AHK_MODIFIER_MAP[m]).join('');
  const braced = AHK_SEND_KEY_MAP[combo.key];
  const keyPart = braced ?? AHK_KEY_MAP[combo.key];
  return `${prefix}${keyPart}`;
}

function isoDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Polling-based tap-vs-hold helper injected once per file when any tap_hold
 * rule exists. AHK has no native to_if_alone — this emulates it.
 *
 * Caveat baked into the comment for the eventual user: this can mis-fire on
 * fast typing rolls. The Karabiner side uses a native primitive and doesn't
 * have this caveat. The UI surfaces this disclosure too.
 *
 * Generated as a string constant so the Vitest tests can assert verbatim.
 */
export const AHK_TAP_HOLD_HELPER = [
  '; HotkeySync tap-hold helper. Polls trigger key every 10ms during the timeout',
  '; window. Note: AHK has no native tap-vs-hold; fast typing rolls may mis-fire.',
  '; For high-frequency keys, prefer a basic remap.',
  'TapHoldAction(timeoutMs, tapAction, holdAction) {',
  '  pureKey := RegExReplace(A_ThisHotkey, "^[\\^!+#<>*~$]+", "")',
  '  endTime := A_TickCount + timeoutMs',
  '  while (A_TickCount < endTime) {',
  '    if !GetKeyState(pureKey, "P") {',
  '      SendInput(tapAction)',
  '      return',
  '    }',
  '    Sleep(10)',
  '  }',
  '  SendInput(holdAction)',
  '  KeyWait(pureKey)',
  '}',
  '',
].join('\n');

/**
 * Wave 2.7 — Render the layer prologue: one global flag per layer plus a
 * single shared watchdog timer that clears any stuck flag every 1000ms.
 *
 * The watchdog is the load-bearing safety net for the "stuck layer" pain
 * point (focus stolen mid-hold, key missed during sleep / Lock-screen /
 * RDP-disconnect). Cheap to run; only fires the clear branch when both flag
 * is true AND the trigger physically isn't down.
 */
function emitLayerPrologue(layers: LayerHotkeyRule[]): string[] {
  const lines: string[] = [
    '; Wave 2.7 / 2.8 — Hyper Layer flags. Hold layers: true while trigger held.',
    '; One-shot layers: true after tap; cleared by next child key, cancel key,',
    '; or optional SetTimer when the layer carries oneshotTimeoutMs.',
    '; Wave 2.9 — lock-on-tap layers gain `_locked` and `_tapcount` companions.',
  ];
  for (const layer of layers) {
    lines.push(`global ${layerVarNameAhk(layer.layerName)} := false`);
    if (layer.oneshotLockOnTaps === 2) {
      lines.push(`global ${layerVarNameAhk(layer.layerName)}_locked := false`);
      lines.push(`global ${layerVarNameAhk(layer.layerName)}_tapcount := 0`);
    }
  }
  lines.push('');
  // Watchdog only watches HOLD layers — for one-shot the flag is intentionally
  // not tied to physical key-down state, so the watchdog clearing it would
  // disarm the layer the moment the user lifts the trigger.
  const holdLayers = layers.filter((l) => l.mode === 'hold');
  if (holdLayers.length > 0) {
    lines.push('; Watchdog (hold layers only): clear any stuck flag if its trigger is no');
    lines.push('; longer physically down. Catches OS-stole-focus / sleep / RDP edge cases.');
    lines.push('SetTimer(HotkeySync_LayerWatchdog, 1000)');
    lines.push('HotkeySync_LayerWatchdog() {');
    for (const layer of holdLayers) {
      const flag = layerVarNameAhk(layer.layerName);
      let triggerKey: string;
      try {
        const combo = parseKeyCombo(layer.trigger);
        triggerKey = AHK_KEY_MAP[combo.key];
      } catch {
        continue;
      }
      lines.push(`  global ${flag}`);
      lines.push(`  if (${flag} && !GetKeyState("${triggerKey}", "P"))`);
      lines.push(`    ${flag} := false`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines;
}

/**
 * Emit a layer's activator: paired down/up handlers that toggle the flag.
 * The `*` prefix swallows modifiers (mirrors Karabiner's optional caps_lock).
 * Optional tap action is wired through TapHoldAction when present — that
 * also injects the helper, so we don't need to emit anything extra.
 */
function emitAhkLayerActivator(
  rule: LayerHotkeyRule,
  blocks: string[],
): void {
  let triggerStr: string;
  try {
    triggerStr = comboToAHK(parseKeyCombo(rule.trigger));
  } catch {
    blocks.push(
      `; Skipped malformed layer rule (trigger="${rule.trigger}")`,
    );
    return;
  }
  const flag = layerVarNameAhk(rule.layerName);

  if (rule.mode === 'oneshot' && rule.oneshotLockOnTaps === 2) {
    // Wave 2.9 — lock-on-double-tap. The activator hotkey calls a helper
    // function that runs the full state-machine (locked-check, tap counter,
    // SetTimer reset). Function-call shape (vs inline `{ ... }` block) keeps
    // each line self-contained for the line-based AHK lint walker.
    const pascal = pascalFromKebab(rule.layerName);
    const slot = layerToolTipSlot(rule.layerName);
    const tapWindow = rule.oneshotTimeoutMs ?? 500;
    blocks.push(
      `*${triggerStr}:: HotkeySync_OneShotTap_${pascal}()  ; ${rule.description} (one-shot lockable on)`,
    );
    blocks.push(`HotkeySync_OneShotTap_${pascal}() {`);
    blocks.push(`  global ${flag}, ${flag}_locked, ${flag}_tapcount`);
    blocks.push(`  if (${flag}_locked) {`);
    blocks.push(`    ${flag}_locked := false`);
    blocks.push(`    ${flag} := false`);
    blocks.push(`    ${flag}_tapcount := 0`);
    if (rule.notification !== undefined) {
      blocks.push(`    ToolTip(, , , ${slot})`);
    }
    blocks.push('    return');
    blocks.push('  }');
    blocks.push(`  ${flag}_tapcount += 1`);
    blocks.push(`  ${flag} := true`);
    blocks.push(`  if (${flag}_tapcount >= 2) {`);
    blocks.push(`    ${flag}_locked := true`);
    if (rule.notification !== undefined) {
      blocks.push(
        `    ToolTip("${layerNotificationTextAhk(rule)}", 1600, 60, ${slot})`,
      );
    }
    blocks.push('    return');
    blocks.push('  }');
    blocks.push(
      `  SetTimer(HotkeySync_TapReset_${pascal}, -${tapWindow})`,
    );
    if (rule.notification !== undefined) {
      blocks.push(
        `  ToolTip("${layerNotificationTextAhk(rule)}", 1600, 60, ${slot})`,
      );
    }
    blocks.push('}');
    blocks.push(`HotkeySync_TapReset_${pascal}() {`);
    blocks.push(`  global ${flag}_tapcount`);
    blocks.push(`  ${flag}_tapcount := 0`);
    blocks.push('}');
    // Child helper: fires the action, then clears flag + tapcount only when
    // the layer is NOT locked. Mirrors the Karabiner unlocked-child variant.
    blocks.push(`HotkeySync_OneShotChild_${pascal}(combo) {`);
    blocks.push(`  global ${flag}, ${flag}_locked, ${flag}_tapcount`);
    blocks.push('  Send(combo)');
    blocks.push(`  if (!${flag}_locked) {`);
    blocks.push(`    ${flag} := false`);
    blocks.push(`    ${flag}_tapcount := 0`);
    if (rule.notification !== undefined) {
      blocks.push(`    ToolTip(, , , ${slot})`);
    }
    blocks.push('  }');
    blocks.push('}');
    // Cancel-key helper: clears flag + tapcount only when NOT locked.
    blocks.push(`HotkeySync_OneShotCancel_${pascal}() {`);
    blocks.push(`  global ${flag}, ${flag}_locked, ${flag}_tapcount`);
    blocks.push(`  if (!${flag}_locked) {`);
    blocks.push(`    ${flag} := false`);
    blocks.push(`    ${flag}_tapcount := 0`);
    if (rule.notification !== undefined) {
      blocks.push(`    ToolTip(, , , ${slot})`);
    }
    blocks.push('  }');
    blocks.push('}');
    return;
  }

  if (rule.mode === 'oneshot') {
    // Wave 2.8 — tap arms the layer; flag persists past trigger release.
    // Child rules clear the flag at the end of their handlers. Optional
    // SetTimer auto-disarms after `oneshotTimeoutMs` (negative ms = one-shot).
    // No `up` handler: clearing on release would defeat the whole point.
    const timeout = rule.oneshotTimeoutMs;
    const slot = layerToolTipSlot(rule.layerName);
    // Wave 2.9 — armed-state ToolTip. `notification` opts in; pinned to
    // top-right via fixed coords so it doesn't follow the cursor. ToolTip
    // is the right primitive here (NOT TrayTip — see layerToolTipSlot doc).
    const showTip =
      rule.notification !== undefined
        ? ` ; ToolTip("${layerNotificationTextAhk(rule)}", 1600, 60, ${slot})`
        : '';
    if (timeout !== undefined) {
      blocks.push(
        `*${triggerStr}:: { global ${flag} := true ; SetTimer(() => HotkeySync_OneShotExpire_${pascalFromKebab(rule.layerName)}(), -${timeout})${showTip} }  ; ${rule.description} (one-shot on)`,
      );
      blocks.push(`HotkeySync_OneShotExpire_${pascalFromKebab(rule.layerName)}() {`);
      blocks.push(`  global ${flag}`);
      blocks.push(`  ${flag} := false`);
      if (rule.notification !== undefined) {
        blocks.push(`  ToolTip(, , , ${slot})`);
      }
      blocks.push('}');
    } else {
      blocks.push(
        `*${triggerStr}:: { global ${flag} := true${showTip} }  ; ${rule.description} (one-shot on)`,
      );
    }
    return;
  }

  // mode === 'hold' — Wave 2.7 paired handlers.
  blocks.push(
    `*${triggerStr}:: { global ${flag} := true }  ; ${rule.description} (layer on)`,
  );
  blocks.push(
    `*${triggerStr} up:: { global ${flag} := false }  ; layer off`,
  );
}

/**
 * Wave 2.8 — kebab "vim-arrows" → PascalCase "VimArrows" for a
 * function-name suffix. Mirrors layerVarNameAhk's PascalCase conversion.
 */
function pascalFromKebab(kebab: string): string {
  return kebab
    .split('-')
    .filter((s) => s.length > 0)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

export function generateAHK(config: Config): string {
  const grouped = groupRulesByAppId(config.rules);
  const uniqueAppCount = grouped.size;
  const header = [
    '; Generated by HotkeySync — https://hotkeysync.app',
    '; OS: Windows | AutoHotkey v2',
    `; Rules: ${config.rules.length} across ${uniqueAppCount} apps`,
    `; Generated: ${isoDateOnly()}`,
    ';',
    '#Requires AutoHotkey v2.0+',
    '#SingleInstance Force',
    '',
  ];

  if (config.rules.length === 0) {
    return [...header, '; No rules configured. Add rules in HotkeySync and regenerate.', ''].join('\n');
  }

  // Wave 2.7 — collect layer definitions; children referencing an unknown
  // layer are silently treated as plain basic rules (schema rejects orphans
  // upstream, but the generator is defensive).
  const layers: LayerHotkeyRule[] = config.rules.filter(
    (r): r is LayerHotkeyRule => r.kind === 'layer',
  );
  const layerNames = new Set(layers.map((l) => l.layerName));
  // Extract layer-child basic rules from the per-app groups; they'll be
  // emitted in their own `#HotIf flag && WinActive(...)` blocks at the end.
  const layerChildrenByLayer = new Map<string, HotkeyRule[]>();
  if (layerNames.size > 0) {
    for (const [appId, appRules] of grouped) {
      const filtered: HotkeyRule[] = [];
      for (const rule of appRules) {
        if (
          rule.kind === 'basic' &&
          rule.layerName &&
          layerNames.has(rule.layerName)
        ) {
          const bucket = layerChildrenByLayer.get(rule.layerName) ?? [];
          bucket.push(rule);
          layerChildrenByLayer.set(rule.layerName, bucket);
        } else {
          filtered.push(rule);
        }
      }
      grouped.set(appId, filtered);
    }
  }

  // Inject the tap-hold helper only when needed. Keeps output identical to
  // pre-T2.3 for users who only use basic rules.
  const hasTapHold = config.rules.some((r) => r.kind === 'tap_hold');
  const prologue: string[] = [];
  if (layers.length > 0) prologue.push(...emitLayerPrologue(layers));
  if (hasTapHold) prologue.push(AHK_TAP_HOLD_HELPER);

  const blocks: string[] = [];
  for (const [appId, appRules] of grouped) {
    if (appRules.length === 0) continue;
    const isGlobal = appId === GLOBAL_APP_ID;
    const app = isGlobal ? null : getAppById(appId);
    if (!isGlobal && !app) {
      // Defensive: store prevents unknown appIds; surface a comment if one slips through.
      blocks.push(`; Note: skipped rule for unknown app '${appId}'`);
      blocks.push('');
      continue;
    }
    if (isGlobal) {
      blocks.push('; ═══ Global (applies in every app) ═══');
      // Each global rule can carry its own exceptApps — emit per-rule
      // `#HotIf !(...)` wrappers when needed, no wrapper at all when global
      // and unrestricted (AHK treats no-#HotIf as global).
      for (const rule of appRules) {
        const hotIfExpr = buildGlobalHotIfExpr(rule.exceptApps);
        if (hotIfExpr) blocks.push(hotIfExpr);
        emitAhkRuleLine(rule, blocks);
        if (hotIfExpr) {
          blocks.push('#HotIf');
        }
      }
      blocks.push('');
      continue;
    }
    blocks.push(`; ═══ ${app!.name} ═══`);
    blocks.push(`#HotIf WinActive("ahk_exe ${app!.exeName}")`);
    for (const rule of appRules) emitAhkRuleLine(rule, blocks);
    blocks.push('#HotIf');
    blocks.push('');
  }

  // Wave 2.7 / 2.8 — emit one block per layer collecting all its children.
  // Children grouped by appId so we can apply the right WinActive condition
  // alongside the layer flag check. For one-shot layers we ALSO append the
  // flag-clear to each child handler (so the layer disarms after one fire)
  // and emit cancel-key rules inside the same #HotIf block.
  const layerByName = new Map<string, LayerHotkeyRule>();
  for (const l of layers) layerByName.set(l.layerName, l);
  for (const [layerName, children] of layerChildrenByLayer) {
    if (children.length === 0) continue;
    const flag = layerVarNameAhk(layerName);
    const parent = layerByName.get(layerName);
    const isOneShot = parent?.mode === 'oneshot';
    blocks.push(`; ═══ Layer "${layerName}" children${isOneShot ? ' (one-shot)' : ''} ═══`);
    const byApp = groupRulesByAppId(children);
    for (const [appId, rules] of byApp) {
      const isGlobal = appId === GLOBAL_APP_ID;
      const app = isGlobal ? null : getAppById(appId);
      if (!isGlobal && !app) continue;
      if (isGlobal) {
        blocks.push(`#HotIf ${flag}`);
      } else {
        blocks.push(`#HotIf ${flag} && WinActive("ahk_exe ${app!.exeName}")`);
      }
      for (const rule of rules) {
        if (isOneShot && rule.kind === 'basic') {
          emitAhkOneShotChildLine(rule, flag, parent, blocks);
        } else {
          emitAhkRuleLine(rule, blocks);
        }
      }
      // Wave 2.8 — emit cancel-key rules INSIDE the same #HotIf block (one
      // per app group). The cancel rules clear the flag without firing the
      // underlying key — pressing Escape on an armed layer means "back out".
      // Wave 2.9 — cancel-key ALSO clears the ToolTip indicator when the
      // parent layer carries `notification`. When lockOnTaps is set, route
      // through a per-layer helper so the locked-state gate is honoured.
      if (isOneShot && parent) {
        const useHelper = parent.oneshotLockOnTaps === 2;
        const pascal = useHelper ? pascalFromKebab(parent.layerName) : '';
        const clearTipCancel =
          parent.notification !== undefined
            ? ` ; ToolTip(, , , ${layerToolTipSlot(parent.layerName)})`
            : '';
        for (const ck of parent.cancelKeys ?? ['escape']) {
          let ckStr: string;
          try {
            ckStr = comboToAHK(parseKeyCombo(ck));
          } catch {
            continue;
          }
          if (useHelper) {
            blocks.push(
              `${ckStr}:: HotkeySync_OneShotCancel_${pascal}()  ; cancel one-shot layer`,
            );
          } else {
            blocks.push(
              `${ckStr}:: { global ${flag} := false${clearTipCancel} }  ; cancel one-shot layer`,
            );
          }
        }
      }
      blocks.push('#HotIf');
    }
    blocks.push('');
  }

  return [...header, ...prologue, ...blocks].join('\n');
}

/**
 * Render a single rule line into the output buffer. Used by both the per-app
 * branch (already inside a `#HotIf WinActive(...)` block) and the global
 * branch (inside `#HotIf !(...)` or no `#HotIf` at all).
 */
function emitAhkRuleLine(rule: HotkeyRule, blocks: string[]): void {
  if (rule.kind === 'layer') {
    emitAhkLayerActivator(rule, blocks);
    return;
  }
  if (rule.kind === 'disable') {
    let triggerStr: string;
    try {
      triggerStr = comboToAHK(parseKeyCombo(rule.trigger));
    } catch {
      blocks.push(
        `; Skipped malformed disable rule (trigger="${rule.trigger}")`,
      );
      return;
    }
    blocks.push(`${triggerStr}:: return  ; ${rule.description} (disabled)`);
    return;
  }
  if (rule.kind === 'tap_hold') {
    emitAhkTapHoldLine(rule, blocks);
    return;
  }
  // basic
  emitAhkBasicLine(rule, blocks);
}

/**
 * Wave 2.8 — emit a one-shot layer child. Same shape as a basic rule but the
 * handler is wrapped in `{ ... ; global flag := false }` so the layer
 * disarms after this single child fires. ModifierAction destinations fall
 * back to the regular `emitAhkBasicLine` (the paired *Trigger up handler
 * doesn't compose with the one-shot disarm — defer to Wave 2.9).
 */
function emitAhkOneShotChildLine(
  rule: Extract<HotkeyRule, { kind: 'basic' }>,
  flag: string,
  parent: LayerHotkeyRule | undefined,
  blocks: string[],
): void {
  if (isModifierAction(rule.action)) {
    // Modifier-action children inside a one-shot layer are rare and the
    // paired down/up handler can't compose with the flag-clear cleanly.
    // Surface a comment + delegate to the regular emit path.
    blocks.push(
      `; Note: ModifierAction inside a one-shot layer is approximate (Wave 2.8).`,
    );
    emitAhkBasicLine(rule, blocks);
    return;
  }
  let triggerStr: string;
  let actionStr: string;
  try {
    triggerStr = comboToAHK(parseKeyCombo(rule.trigger));
    actionStr = comboToAHKSend(parseKeyCombo(rule.action));
  } catch {
    blocks.push(
      `; Skipped malformed one-shot child (trigger="${rule.trigger}", action="${rule.action}")`,
    );
    return;
  }
  // Wave 2.9 — when parent has lockOnTaps, route through a per-layer child
  // helper so the locked-check happens at runtime. The helper is emitted
  // once per layer alongside the activator function.
  if (parent && parent.oneshotLockOnTaps === 2) {
    const pascal = pascalFromKebab(parent.layerName);
    blocks.push(
      `${triggerStr}:: HotkeySync_OneShotChild_${pascal}("${actionStr}")  ; ${rule.description}`,
    );
    return;
  }
  // Wave 2.9 — clear the armed-state ToolTip alongside the flag clear when
  // the parent layer carries `notification`. Order: send action → clear flag
  // → clear tooltip. Putting the tooltip-clear after the flag-clear keeps
  // the indicator visible through the action send, which feels right.
  const clearTip =
    parent && parent.notification !== undefined
      ? ` ; ToolTip(, , , ${layerToolTipSlot(parent.layerName)})`
      : '';
  blocks.push(
    `${triggerStr}:: { Send("${actionStr}") ; global ${flag} := false${clearTip} }  ; ${rule.description}`,
  );
}

function emitAhkBasicLine(
  rule: Extract<HotkeyRule, { kind: 'basic' }>,
  blocks: string[],
): void {
  let triggerStr: string;
  try {
    triggerStr = comboToAHK(parseKeyCombo(rule.trigger));
  } catch {
    blocks.push(
      `; Skipped malformed rule (trigger="${rule.trigger}")`,
    );
    return;
  }

  if (isModifierAction(rule.action)) {
    // Wave 2.6 — paired down/up handlers for modifier-only basic rules.
    // `*Trigger::Send "{Blind}{LCtrl down}"` + `*Trigger up::Send "{Blind}{LCtrl up}"`.
    // The `*` prefix consumes the trigger regardless of held modifiers (mirrors
    // Karabiner's optional `caps_lock`). The `{Blind}` Send prefix preserves
    // any other modifiers the user is already holding (fixes the auto-repeat
    // chord pain point #4 in the research).
    const downStr = modifierActionToAhkSendStr(rule.action.modifiers);
    const upStr = modifierActionToAhkUpStr(rule.action.modifiers);
    const desc = rule.description;
    blocks.push(`*${triggerStr}:: Send("{Blind}${downStr}")  ; ${desc}`);
    blocks.push(`*${triggerStr} up:: Send("{Blind}${upStr}")`);
    return;
  }

  let actionStr: string;
  try {
    actionStr = comboToAHKSend(parseKeyCombo(rule.action));
  } catch {
    blocks.push(
      `; Skipped malformed rule (trigger="${rule.trigger}", action="${rule.action}")`,
    );
    return;
  }
  blocks.push(`${triggerStr}:: Send("${actionStr}")  ; ${rule.description}`);
}

function emitAhkTapHoldLine(
  rule: Extract<HotkeyRule, { kind: 'tap_hold' }>,
  blocks: string[],
): void {
  let triggerStr: string;
  let tapStr: string;
  let holdStr: string;
  try {
    triggerStr = comboToAHK(parseKeyCombo(rule.trigger));
    tapStr = comboToAHKSend(parseKeyCombo(rule.tapAction));
    holdStr = ahkHoldActionString(rule.holdAction);
  } catch {
    blocks.push(
      `; Skipped malformed tap_hold rule (trigger="${rule.trigger}", tap="${rule.tapAction}")`,
    );
    return;
  }
  blocks.push(
    `${triggerStr}:: TapHoldAction(${rule.tapTimeoutMs}, "${tapStr}", "${holdStr}")  ; ${rule.description}`,
  );
}

/**
 * Render the `holdAction` of a tap_hold rule into the string our
 * `TapHoldAction` helper accepts. KeyCombo strings → Send-style escapes;
 * ModifierAction → `{LCtrl down}` etc., so the helper can re-emit when held.
 *
 * The polling helper has the same caveats as before — fast typing rolls can
 * misfire. Lint surfaces this; see project_modifier_action_research.md.
 */
function ahkHoldActionString(action: Action): string {
  if (isModifierAction(action)) {
    return modifierActionToAhkSendStr(action.modifiers);
  }
  return comboToAHKSend(parseKeyCombo(action));
}
