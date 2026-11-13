import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

/**
 * App extensions cannot import code from the app target, so the shared Swift files are copied into
 * each extension that needs them. This keeps the copies from drifting apart.
 */
const SHARED = ['FocusLogic.swift', 'FocusShared.swift'];
const EXTENSIONS_USING_SHARED = ['device-activity-monitor', 'shield-config'];

describe('shared Swift sources', () => {
  for (const ext of EXTENSIONS_USING_SHARED) {
    for (const file of SHARED) {
      it(`targets/${ext}/${file} matches modules/focus/ios/${file}`, () => {
        expect(read(`targets/${ext}/${file}`)).toBe(read(`modules/focus/ios/${file}`));
      });
    }
  }
});
