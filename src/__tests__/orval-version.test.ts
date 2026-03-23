import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_REACT_SDK_ORVAL_VERSION,
  parseOrvalVersionFromPackageJsonContent,
} from '../utils/orval-version';

describe('parseOrvalVersionFromPackageJsonContent', () => {
  test('returns devDependencies.orval when present', () => {
    const version = parseOrvalVersionFromPackageJsonContent(
      JSON.stringify({
        devDependencies: {
          orval: '^8.5.3',
        },
      }),
    );

    expect(version).toBe('^8.5.3');
  });

  test('falls back to dependencies.orval when devDependencies is missing', () => {
    const version = parseOrvalVersionFromPackageJsonContent(
      JSON.stringify({
        dependencies: {
          orval: '~8.5.1',
        },
      }),
    );

    expect(version).toBe('~8.5.1');
  });

  test('prefers devDependencies.orval over dependencies.orval', () => {
    const version = parseOrvalVersionFromPackageJsonContent(
      JSON.stringify({
        dependencies: {
          orval: '^8.5.1',
        },
        devDependencies: {
          orval: '^8.5.3',
        },
      }),
    );

    expect(version).toBe('^8.5.3');
  });

  test('returns undefined when orval is empty', () => {
    const version = parseOrvalVersionFromPackageJsonContent(
      JSON.stringify({
        devDependencies: {
          orval: '   ',
        },
      }),
    );

    expect(version).toBeUndefined();
  });

  test('default version stays available for command fallback', () => {
    expect(DEFAULT_REACT_SDK_ORVAL_VERSION).toBe('^8.5.0');
  });
});
