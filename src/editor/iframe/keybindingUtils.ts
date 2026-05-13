import type { HotkeyConfig } from './types/index.ts';

/**
 * Maps KeyboardEvent.key strings (as used in HotkeyConfig) to Monaco KeyCode values.
 * Keys are lowercased to match the normalization in matchesHotkey().
 * Note: monaco is a global in the iframe context.
 */
function buildKeyMap(): Record<string, number> {
  const m = monaco.KeyCode;
  return {
    // Letters
    a: m.KeyA,
    b: m.KeyB,
    c: m.KeyC,
    d: m.KeyD,
    e: m.KeyE,
    f: m.KeyF,
    g: m.KeyG,
    h: m.KeyH,
    i: m.KeyI,
    j: m.KeyJ,
    k: m.KeyK,
    l: m.KeyL,
    m: m.KeyM,
    n: m.KeyN,
    o: m.KeyO,
    p: m.KeyP,
    q: m.KeyQ,
    r: m.KeyR,
    s: m.KeyS,
    t: m.KeyT,
    u: m.KeyU,
    v: m.KeyV,
    w: m.KeyW,
    x: m.KeyX,
    y: m.KeyY,
    z: m.KeyZ,
    // Digits
    '0': m.Digit0,
    '1': m.Digit1,
    '2': m.Digit2,
    '3': m.Digit3,
    '4': m.Digit4,
    '5': m.Digit5,
    '6': m.Digit6,
    '7': m.Digit7,
    '8': m.Digit8,
    '9': m.Digit9,
    // F keys
    f1: m.F1,
    f2: m.F2,
    f3: m.F3,
    f4: m.F4,
    f5: m.F5,
    f6: m.F6,
    f7: m.F7,
    f8: m.F8,
    f9: m.F9,
    f10: m.F10,
    f11: m.F11,
    f12: m.F12,
    // Punctuation (KeyboardEvent.key values)
    ',': m.Comma,
    '.': m.Period,
    '/': m.Slash,
    ';': m.Semicolon,
    "'": m.Quote,
    '[': m.BracketLeft,
    ']': m.BracketRight,
    '\\': m.Backslash,
    '`': m.Backquote,
    '-': m.Minus,
    '=': m.Equal,
    // Navigation
    arrowleft: m.LeftArrow,
    arrowright: m.RightArrow,
    arrowup: m.UpArrow,
    arrowdown: m.DownArrow,
    home: m.Home,
    end: m.End,
    pageup: m.PageUp,
    pagedown: m.PageDown,
    // Editing
    enter: m.Enter,
    escape: m.Escape,
    tab: m.Tab,
    backspace: m.Backspace,
    delete: m.Delete,
    insert: m.Insert,
    ' ': m.Space
  };
}

/**
 * Converts a HotkeyConfig to a Monaco keybinding bitmask.
 *
 * Limitation: keybindings in Monaco are static (set at action registration).
 * This value reflects the hotkey at startup only; in-session changes via
 * updateHotkeys() are handled dynamically by onKeyDown + matchesHotkey,
 * but the display in Monaco's command palette won't update until restart.
 *
 * @returns The bitmask, or null if the key is not in the conversion table.
 */
export function hotkeyToMonacoKeybinding(hk: HotkeyConfig | null): number | null {
  if (!hk) return null;
  const keyCode = buildKeyMap()[hk.key.toLowerCase()];
  if (keyCode === undefined) return null;

  let mod = 0;
  if (
    hk.modifiers.includes('Mod') ||
    hk.modifiers.includes('Ctrl') ||
    hk.modifiers.includes('Meta')
  ) {
    mod |= monaco.KeyMod.CtrlCmd;
  }
  if (hk.modifiers.includes('Shift')) mod |= monaco.KeyMod.Shift;
  if (hk.modifiers.includes('Alt')) mod |= monaco.KeyMod.Alt;

  return mod | keyCode;
}
