import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildServiceUrlTemplate } from '../templates/service-url';

const SERVICE_URL_MAP = {
  local: 'http://localhost:3000',
  development: 'https://dev.example.com',
  production: 'https://api.example.com',
};

const CUSTOM_ENV_KEYS = [
  'MODULE_API_URL',
  'NEXT_PUBLIC_MODULE_API_URL',
  'VITE_MODULE_API_URL',
];
const ENV_KEYS = ['API_ENV', 'NEXT_PUBLIC_API_ENV', 'VITE_API_ENV'];

const ALL_RELEVANT_ENV_KEYS = [
  'API_ENV',
  'NEXT_PUBLIC_API_ENV',
  'VITE_API_ENV',
  'VITE_NEXT_PUBLIC_API_ENV',
  'VITE_VITE_API_ENV',
  'MODULE_API_URL',
  'NEXT_PUBLIC_MODULE_API_URL',
  'VITE_MODULE_API_URL',
  'VITE_NEXT_PUBLIC_MODULE_API_URL',
  'VITE_VITE_MODULE_API_URL',
];

function createRuntime(generatedCode: string) {
  let js = generatedCode;

  js = js.replace(/^export\s+type\s+.+;?\s*$/gm, '');
  js = js.replace(/\/\*\*[\s\S]*?\*\//g, '');
  js = js.replace(/\/\/ @ts-ignore.*/g, '');
  js = js.replace(/import\.meta/g, '(void 0)');
  js = js.replace(/^export\s+/gm, '');
  js = js.replace(/\bas const\b/g, '');
  js = js.replace(/\bas Record<string,\s*string>/g, '');
  js = js.replace(/:\s*\{[^}]+\}/g, '');
  js = js.replace(/:\s*string\s*\|\s*undefined/g, '');
  js = js.replace(/:\s*string\[\]/g, '');
  js = js.replace(/:\s*ApiEnvironment/g, '');
  js = js.replace(/:\s*any/g, '');
  js = js.replace(/:\s*string(?=[,\)])/g, '');
  js = js.replace(/(\w+)\?(\s*[),])/g, '$1$2');

  const hasMap = generatedCode.includes('const SERVICE_URL_MAP');
  const returnProps = hasMap
    ? '{ getServiceUrl, getEnvVar, findEnvVar, SERVICE_URL_MAP }'
    : '{ getServiceUrl, getEnvVar, findEnvVar }';

  const fn = new Function(`
    "use strict";
    ${js}
    return ${returnProps};
  `);

  return fn();
}

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ALL_RELEVANT_ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

describe('buildServiceUrlTemplate', () => {
  describe('output (with serviceUrlMap)', () => {
    const code = buildServiceUrlTemplate({
      serviceUrlMap: SERVICE_URL_MAP,
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });

    test('includes SERVICE_URL_MAP constant with all entries', () => {
      expect(code).toContain('const SERVICE_URL_MAP = {');
      expect(code).toContain("local: 'http://localhost:3000'");
      expect(code).toContain("development: 'https://dev.example.com'");
      expect(code).toContain("production: 'https://api.example.com'");
    });

    test('includes ApiEnvironment type with map keys union', () => {
      expect(code).toContain(
        "export type ApiEnvironment = keyof typeof SERVICE_URL_MAP | 'custom'",
      );
    });

    test('includes env keys as array literal', () => {
      expect(code).toContain(
        "['API_ENV', 'NEXT_PUBLIC_API_ENV', 'VITE_API_ENV']",
      );
    });

    test('includes custom env keys as array literal', () => {
      expect(code).toContain(
        "['MODULE_API_URL', 'NEXT_PUBLIC_MODULE_API_URL', 'VITE_MODULE_API_URL']",
      );
    });

    test('includes getEnvVar helper function', () => {
      expect(code).toContain('function getEnvVar(');
      expect(code).toContain('VITE_');
    });

    test('includes findEnvVar helper function', () => {
      expect(code).toContain('function findEnvVar(');
    });

    test('includes getServiceUrl function', () => {
      expect(code).toContain('export function getServiceUrl(');
    });

    test('getServiceUrl checks env param before API_ENV', () => {
      expect(code).toMatch(/if\s*\(\s*env\s*&&\s*env\s*!==\s*'custom'\s*\)/);
    });

    test('getServiceUrl checks API_ENV env var before custom URL', () => {
      const apiEnvCheck = code.indexOf('const apiEnv = findEnvVar(');
      const customUrlCheck = code.indexOf('const customUrl = findEnvVar(');
      expect(apiEnvCheck).toBeLessThan(customUrlCheck);
    });
  });

  describe('output (without serviceUrlMap)', () => {
    const code = buildServiceUrlTemplate({
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });

    test('does not include SERVICE_URL_MAP constant', () => {
      expect(code).not.toContain('const SERVICE_URL_MAP');
    });

    test('ApiEnvironment type is only custom', () => {
      expect(code).toContain("export type ApiEnvironment = 'custom'");
    });

    test('getServiceUrl throws when no custom URL', () => {
      expect(code).toContain(
        "throw new Error('No serviceUrlMap provided and no custom URL env var set.')",
      );
    });

    test('does not check API_ENV env var', () => {
      expect(code).not.toContain('const apiEnv = findEnvVar(');
    });
  });

  describe('output (empty serviceUrlMap)', () => {
    const code = buildServiceUrlTemplate({
      serviceUrlMap: {},
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });

    test('behaves same as no map', () => {
      expect(code).not.toContain('const SERVICE_URL_MAP');
      expect(code).toContain("export type ApiEnvironment = 'custom'");
    });
  });
});

describe('getEnvVar runtime', () => {
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    const code = buildServiceUrlTemplate({
      serviceUrlMap: SERVICE_URL_MAP,
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });
    runtime = createRuntime(code);
  });

  test('returns value from process.env', () => {
    process.env.API_ENV = 'production';
    expect(runtime.getEnvVar('API_ENV')).toBe('production');
  });

  test('checks VITE_ prefixed key when original is not set', () => {
    process.env.VITE_API_ENV = 'development';
    expect(runtime.getEnvVar('API_ENV')).toBe('development');
  });

  test('returns undefined when neither key nor VITE_ prefixed key is set', () => {
    expect(runtime.getEnvVar('API_ENV')).toBeUndefined();
  });

  test('prefers original key over VITE_ prefixed key', () => {
    process.env.API_ENV = 'production';
    process.env.VITE_API_ENV = 'development';
    expect(runtime.getEnvVar('API_ENV')).toBe('production');
  });

  test('does not double-prefix keys that already start with VITE_', () => {
    process.env.VITE_API_ENV = 'production';
    expect(runtime.getEnvVar('VITE_API_ENV')).toBe('production');
  });
});

describe('findEnvVar runtime', () => {
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    const code = buildServiceUrlTemplate({
      serviceUrlMap: SERVICE_URL_MAP,
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });
    runtime = createRuntime(code);
  });

  test('returns first matching env var', () => {
    process.env.API_ENV = 'production';
    process.env.NEXT_PUBLIC_API_ENV = 'development';
    expect(runtime.findEnvVar(['API_ENV', 'NEXT_PUBLIC_API_ENV'])).toBe(
      'production',
    );
  });

  test('falls through to next key when first is not set', () => {
    process.env.NEXT_PUBLIC_API_ENV = 'development';
    expect(runtime.findEnvVar(['API_ENV', 'NEXT_PUBLIC_API_ENV'])).toBe(
      'development',
    );
  });

  test('returns undefined when no keys are set', () => {
    expect(
      runtime.findEnvVar(['API_ENV', 'NEXT_PUBLIC_API_ENV', 'VITE_API_ENV']),
    ).toBeUndefined();
  });
});

describe('getServiceUrl runtime (with serviceUrlMap)', () => {
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    const code = buildServiceUrlTemplate({
      serviceUrlMap: SERVICE_URL_MAP,
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });
    runtime = createRuntime(code);
  });

  test('priority 1: env param "production" returns production URL', () => {
    const result = runtime.getServiceUrl('production');
    expect(result).toEqual({
      apiUrl: 'https://api.example.com',
      env: 'production',
    });
  });

  test('priority 1: env param "development" returns development URL', () => {
    const result = runtime.getServiceUrl('development');
    expect(result).toEqual({
      apiUrl: 'https://dev.example.com',
      env: 'development',
    });
  });

  test('priority 1: env param "local" returns local URL', () => {
    const result = runtime.getServiceUrl('local');
    expect(result).toEqual({
      apiUrl: 'http://localhost:3000',
      env: 'local',
    });
  });

  test('priority 1: env param "custom" falls through to env var lookup', () => {
    process.env.MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl('custom');
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('priority 1: env param overrides API_ENV env var', () => {
    process.env.API_ENV = 'development';
    const result = runtime.getServiceUrl('production');
    expect(result).toEqual({
      apiUrl: 'https://api.example.com',
      env: 'production',
    });
  });

  test('priority 2: API_ENV=production returns production URL', () => {
    process.env.API_ENV = 'production';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://api.example.com',
      env: 'production',
    });
  });

  test('priority 2: API_ENV=development returns development URL', () => {
    process.env.API_ENV = 'development';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://dev.example.com',
      env: 'development',
    });
  });

  test('priority 2: API_ENV=local returns local URL', () => {
    process.env.API_ENV = 'local';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'http://localhost:3000',
      env: 'local',
    });
  });

  test('priority 2: NEXT_PUBLIC_API_ENV is checked via findEnvVar', () => {
    process.env.NEXT_PUBLIC_API_ENV = 'production';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://api.example.com',
      env: 'production',
    });
  });

  test('priority 2: API_ENV=custom falls through to custom URL lookup', () => {
    process.env.API_ENV = 'custom';
    process.env.MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('priority 2: API_ENV=custom with no custom URL falls back to local', () => {
    process.env.API_ENV = 'custom';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'http://localhost:3000',
      env: 'local',
    });
  });

  test('priority 3: custom URL from MODULE_API_URL env var', () => {
    process.env.MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('priority 3: custom URL from NEXT_PUBLIC_MODULE_API_URL', () => {
    process.env.NEXT_PUBLIC_MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('priority 3: custom URL from VITE_MODULE_API_URL', () => {
    process.env.VITE_MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('priority 4: no env, no custom URL defaults to local', () => {
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'http://localhost:3000',
      env: 'local',
    });
  });

  test('VITE_ prefix: VITE_NEXT_PUBLIC_API_ENV picked up via prefix resolution', () => {
    process.env.VITE_NEXT_PUBLIC_API_ENV = 'development';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://dev.example.com',
      env: 'development',
    });
  });

  test('VITE_ prefix: VITE_MODULE_API_URL picked up via prefix resolution', () => {
    process.env.VITE_MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });
});

describe('getServiceUrl runtime (without serviceUrlMap)', () => {
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    const code = buildServiceUrlTemplate({
      customEnvVarKeys: CUSTOM_ENV_KEYS,
      envKeys: ENV_KEYS,
    });
    runtime = createRuntime(code);
  });

  test('returns custom URL when MODULE_API_URL is set', () => {
    process.env.MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('returns custom URL when VITE_MODULE_API_URL is set', () => {
    process.env.VITE_MODULE_API_URL = 'https://custom.example.com';
    const result = runtime.getServiceUrl();
    expect(result).toEqual({
      apiUrl: 'https://custom.example.com',
      env: 'custom',
    });
  });

  test('throws when no custom URL is set', () => {
    expect(() => runtime.getServiceUrl()).toThrow(
      'No serviceUrlMap provided and no custom URL env var set.',
    );
  });
});
