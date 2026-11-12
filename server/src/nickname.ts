import blocklist from './nickname-blocklist.json';

/**
 * Nickname rules. A nickname is shown to nearby users who accept the notification about you, so it is
 * checked in two places: when it is typed (a bad one is never saved or sent) and when one arrives from
 * another phone (a modified app could send anything). No list catches everything; this catches the
 * common words and the common tricks (leetspeak, spaced or repeated letters, diacritics).
 */

export const NICKNAME_MAX = 20;

export type NicknameCheck = 'ok' | 'empty' | 'length' | 'chars' | 'blocked';

/** Latin letters with marks, folded to plain ASCII. Anything else (Cyrillic, emoji, symbols) is not allowed. */
const FOLD_GROUPS: [string, string][] = [
  ['a', 'àáâãäåāăą'],
  ['c', 'çćč'],
  ['d', 'ďđ'],
  ['e', 'èéêëēėęě'],
  ['i', 'ìíîïīį'],
  ['l', 'łľĺ'],
  ['n', 'ñńň'],
  ['o', 'òóôõöøōő'],
  ['r', 'řŕ'],
  ['s', 'śšş'],
  ['t', 'ťţ'],
  ['u', 'ùúûüūůűų'],
  ['y', 'ýÿ'],
  ['z', 'žźż'],
];
const FOLD: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe' };
for (const [plain, marked] of FOLD_GROUPS) for (const ch of marked) FOLD[ch] = plain;

/** Digits people use in place of letters. `1` can be `i` or `l`, so both readings are checked. */
const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't' };

function fold(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) out += FOLD[ch] ?? ch;
  return out;
}

/** Shortens runs of 3+ identical letters: to 2 (keeps "gg" in "nigger") or to 1 (turns "pizzzda" into "pizda"). */
function squeeze(text: string, keep: 1 | 2): string {
  return text.replace(/([a-z0-9])\1{2,}/g, (_, ch: string) => ch.repeat(keep));
}

function readings(folded: string): string[] {
  const base = [...folded].map((ch) => LEET[ch] ?? ch).join('');
  const readOneAs = (letter: string) => base.replace(/1/g, letter);
  const out: string[] = [];
  for (const spelled of [readOneAs('i'), readOneAs('l')]) {
    out.push(spelled, squeeze(spelled, 2), squeeze(spelled, 1));
  }
  return out;
}

const STRONG: string[] = blocklist.strong;
const WEAK = new Set<string>(blocklist.weak);

/** True if the (already folded) nickname contains a blocked word or hides one. */
function containsBlockedWord(folded: string): boolean {
  if (/1488|14\/88/.test(folded)) return true; // numeric hate code
  for (const text of readings(folded)) {
    // Letters only, so "n i g g e r", "n.i.g.g.e.r" and "ni2gger" are all seen as "nigger".
    const letters = text.replace(/[^a-z]/g, '');
    if (STRONG.some((word) => letters.includes(word))) return true;
    if (WEAK.has(letters)) return true;
    const tokens = text.split(/[^a-z]+/).filter(Boolean);
    if (tokens.some((token) => WEAK.has(token))) return true;
  }
  return false;
}

export function checkNickname(raw: string): NicknameCheck {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text === '') return 'empty';
  if (text.length > NICKNAME_MAX) return 'length';
  const folded = fold(text);
  if (/[^a-z0-9 ._-]/.test(folded)) return 'chars';
  return containsBlockedWord(folded) ? 'blocked' : 'ok';
}

/** Empty means "no nickname", which is fine (the user shows up as anonymous). */
export function isNicknameAllowed(raw: string): boolean {
  const result = checkNickname(raw);
  return result === 'ok' || result === 'empty';
}

/** A nickname that may be shown or sent; anything else becomes empty (= anonymous). */
export function safeNickname(raw: string | undefined): string {
  if (!raw) return '';
  return isNicknameAllowed(raw) ? raw.trim().replace(/\s+/g, ' ') : '';
}
