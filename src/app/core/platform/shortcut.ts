/**
 * OS-aware keyboard shortcut labels. macOS uses the Command (⌘) key; Windows and
 * Linux use Ctrl. The command-palette keydown listener accepts both modifiers, so
 * only the *displayed* label needs to differ by platform.
 */
interface UAData {
  platform?: string;
}

const platform =
  (navigator as Navigator & { userAgentData?: UAData }).userAgentData?.platform ??
  navigator.platform ??
  navigator.userAgent;

/** True on macOS / iPadOS, where the modifier key is Command (⌘). */
export const IS_MAC = /mac|iphone|ipad|ipod/i.test(platform);

/** The modifier symbol for this platform: `⌘` on macOS, `Ctrl` elsewhere. */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

/** A full shortcut label, e.g. `⌘K` on macOS or `Ctrl K` on Windows/Linux. */
export const modLabel = (key: string): string => (IS_MAC ? `${MOD_KEY}${key}` : `${MOD_KEY} ${key}`);
