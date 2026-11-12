import { describe, expect, it } from 'vitest';

import { checkNickname, isNicknameAllowed, safeNickname } from './nickname';

describe('allowed nicknames', () => {
  it.each(['Honza', 'Petra K.', 'Žluťoučký kůň', 'jan_novak-7', 'Focus Fan', 'Pizza', 'Scunthorpe', 'Niger', 'Hancock', 'Classic', 'Assistant', 'Cocktail', 'Mississippi', 'Shiitake', 'Dickens', 'Hello World', 'Analytik', 'Michal88', 'Peacock', 'Cumberland', 'Essex', 'Dumbledore', 'Passion', 'Therapist', 'Grapes', 'Bassist', 'Raptor', 'Slovak', 'Gypsum', 'Analyst', 'Skanska', 'Moroni', 'Lesbos'])(
    'accepts %s',
    (name) => {
      expect(isNicknameAllowed(name)).toBe(true);
    },
  );
  it('treats an empty nickname as allowed (anonymous)', () => {
    expect(checkNickname('')).toBe('empty');
    expect(checkNickname('   ')).toBe('empty');
    expect(isNicknameAllowed('')).toBe(true);
  });
});

describe('blocked nicknames', () => {
  it.each(['negr', 'Negr', 'NEGR', 'pizda', 'Pizda123', 'kokot', 'Kurva', 'zmrd', 'nigger', 'Nigga', 'faggot', 'bitch', 'fuck', 'cunt', 'Hitler', 'nazi', 'debil'])(
    'blocks the plain word %s',
    (name) => {
      expect(checkNickname(name)).toBe('blocked');
    },
  );
  it.each([
    ['N3gr', 'leetspeak'],
    ['p1zda', 'leetspeak with 1 as i'],
    ['n1gger', 'leetspeak'],
    ['k0kot', 'leetspeak with 0'],
    ['n e g r', 'spaced letters'],
    ['p.i.z.d.a', 'dotted letters'],
    ['p_i_z_d_a', 'underscored letters'],
    ['pizzzzda', 'repeated letters'],
    ['niggggger', 'repeated letters'],
    ['ni2gger', 'digit inserted inside'],
    ['xxNEGRxx', 'embedded in a longer nickname'],
    ['Super_Kurva_99', 'embedded with separators'],
    ['PIZDĚNKA', 'diacritics'],
    ['pizdy', 'inflected form'],
    ['kurvit', 'inflected form'],
    ['hovno', 'insult'],
    ['pitomec', 'insult'],
    ['idiot', 'insult'],
    ['the nazi', 'whole-word match inside a phrase'],
    ['1488', 'numeric hate code'],
    ['n1gg3r', 'leetspeak with several digits'],
  ])('blocks %s (%s)', (name) => {
    expect(checkNickname(name)).toBe('blocked');
  });
});

describe('English words, groups and variants', () => {
  it.each([
    ['nigguh', 'racial slur variant'], ['niqqa', 'racial slur variant'], ['n1bba', 'racial slur variant'], ['N I G G A Z', 'spaced'],
    ['chinaman', 'ethnic slur'], ['ching chong', 'mocking'], ['redskin', 'ethnic slur'], ['kaffir', 'racial slur'], ['mudslime', 'religious slur'],
    ['kikes', 'plural of a short slur'], ['Spics', 'plural of a short slur'], ['gooks', 'plural of a short slur'], ['jap', 'short slur'],
    ['tranny', 'transphobic'], ['shemale', 'transphobic'], ['dykes', 'homophobic'], ['poofter', 'homophobic'], ['lezzie', 'homophobic'],
    ['spaz', 'ableist'], ['libtard', 'ableist'], ['retarded', 'ableist'], ['mong', 'ableist'],
    ['slut', 'sexist'], ['SLUTS', 'sexist plural'], ['skank', 'sexist'], ['whores', 'sexist'], ['thot', 'sexist'], ['feminazi', 'sexist'], ['rapist', 'rape reference'], ['raped', 'rape reference'],
    ['fuk', 'vulgar variant'], ['fck', 'vulgar variant'], ['phuck', 'vulgar variant'], ['fvck', 'vulgar variant'], ['f u c k', 'spaced'], ['fuuuuck', 'repeated letters'],
    ['shitface', 'vulgar'], ['dipshit', 'vulgar'], ['bullshit', 'vulgar'], ['sh1t', 'leetspeak'], ['arsehole', 'vulgar'], ['jackass', 'insult'], ['dumbass', 'insult'], ['cocksucker', 'vulgar'], ['dickhead', 'vulgar'], ['wanker', 'vulgar'], ['douchebag', 'insult'],
    ['b1tch', 'leetspeak'], ['biatch', 'variant'], ['c u n t', 'spaced'], ['cunts', 'plural'], ['twats', 'plural'],
    ['blowjob', 'sexual'], ['porn', 'sexual'], ['dildo', 'sexual'], ['penis', 'sexual'], ['milf', 'sexual'],
    ['siegheil', 'nazi'], ['Sieg Heil', 'nazi'], ['white power', 'hate'], ['swastika', 'hate'], ['klansman', 'hate'], ['Goebbels', 'nazi'], ['neonazi', 'nazi'], ['Nazis', 'nazi'],
    ['moron', 'insult'], ['loser', 'insult'], ['scumbag', 'insult'], ['stupid', 'insult'], ['dumb', 'insult'], ['imbecile', 'insult'],
  ])('blocks %s (%s)', (name) => {
    expect(checkNickname(name)).toBe('blocked');
  });
});

describe('characters and length', () => {
  it('rejects symbols, emoji and other scripts', () => {
    expect(checkNickname('Honza😀')).toBe('chars');
    expect(checkNickname('Иван')).toBe('chars');
    expect(checkNickname('a@b')).toBe('chars');
    expect(checkNickname('<script>')).toBe('chars');
  });
  it('rejects nicknames longer than 20 characters', () => {
    expect(checkNickname('a'.repeat(21))).toBe('length');
    expect(checkNickname('a'.repeat(20))).toBe('ok');
  });
});

describe('safeNickname (used for anything received from another phone)', () => {
  it('passes a good nickname through, tidied up', () => {
    expect(safeNickname('  Honza   K  ')).toBe('Honza K');
  });
  it('turns a bad, odd or missing nickname into an empty one', () => {
    expect(safeNickname('negr')).toBe('');
    expect(safeNickname('Иван')).toBe('');
    expect(safeNickname(undefined)).toBe('');
    expect(safeNickname('')).toBe('');
  });
});
