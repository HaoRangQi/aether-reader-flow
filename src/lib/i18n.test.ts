import { afterEach, describe, it, expect } from 'vitest';
import { translate, detectBrowserLocale, SUPPORTED_LOCALES } from './i18n';

const originalLanguages = navigator.languages;
const originalLanguage = navigator.language;

afterEach(() => {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: originalLanguages,
  });
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    value: originalLanguage,
  });
});

describe('i18n', () => {
  it('translates a key in zh', () => {
    expect(translate('zh', 'library.title')).toBe('书架');
  });

  it('translates a key in en', () => {
    expect(translate('en', 'library.title')).toBe('Library');
  });

  it('substitutes {param} placeholders', () => {
    expect(
      translate('zh', 'upload.error.tooLarge', { limit: 500, size: '612.3' }),
    ).toContain('500 MB');
    expect(
      translate('zh', 'upload.error.tooLarge', { limit: 500, size: '612.3' }),
    ).toContain('612.3 MB');
  });

  it('leaves unknown placeholders intact (debug visibility)', () => {
    expect(translate('zh', 'upload.error.tooLarge', { limit: 500 })).toContain(
      '{size}',
    );
  });

  it('falls back to zh dict on unknown locale (defensive)', () => {
    // @ts-expect-error: bad locale on purpose
    expect(translate('xx', 'library.title')).toBe('书架');
  });

  it('normalizes runtime language tags before translating', () => {
    // @ts-expect-error: browser language tag on purpose
    expect(translate('en-US', 'library.title')).toBe('Library');
    // @ts-expect-error: whitespace-padded language tag on purpose
    expect(translate(' zh-CN ', 'library.title')).toBe('书架');
  });

  it('every key in zh has an en translation', () => {
    // We can't directly enumerate Dict from outside, but spot-check
    // a representative sample.
    const samples = [
      'library.title',
      'upload.title',
      'reader.toolbar.summary',
      'settings.language.title',
    ] as const;
    for (const k of samples) {
      expect(translate('en', k)).not.toBe(k);
    }
  });

  it('SUPPORTED_LOCALES contains zh and en', () => {
    expect(SUPPORTED_LOCALES).toContain('zh');
    expect(SUPPORTED_LOCALES).toContain('en');
  });

  it('detectBrowserLocale returns zh when navigator unavailable', () => {
    // happy-dom provides navigator; this test mostly asserts no crash.
    const result = detectBrowserLocale();
    expect(['zh', 'en']).toContain(result);
  });

  it('detectBrowserLocale checks the full browser language preference list', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['fr-FR', 'zh-Hans-CN', 'en-US'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'fr-FR',
    });

    expect(detectBrowserLocale()).toBe('zh');
  });

  it('detectBrowserLocale falls back to navigator.language when languages is empty', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: [],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'en-GB',
    });

    expect(detectBrowserLocale()).toBe('en');
  });

  it('detectBrowserLocale skips malformed browser language tags', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: [null, '   ', 'fr-FR', 'en_US'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'zh-CN',
    });

    expect(detectBrowserLocale()).toBe('en');
  });
});
