import type { ServiceUrlMap } from '../config';

type TemplateOptions = {
  serviceUrlMap?: ServiceUrlMap;
  customEnvVarKeys: string[];
  envKeys: string[];
};

function buildArrayLiteral(values: string[]): string {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

function buildServiceUrlMapLiteral(serviceUrlMap: ServiceUrlMap): string {
  const entries = Object.entries(serviceUrlMap)
    .map(([key, value]) => `  ${key}: '${value}',`)
    .join('\n');

  return `const SERVICE_URL_MAP = {\n${entries}\n} as const;`;
}

export function buildServiceUrlTemplate({
  serviceUrlMap,
  customEnvVarKeys,
  envKeys,
}: TemplateOptions): string {
  const hasMap = Boolean(
    serviceUrlMap && Object.keys(serviceUrlMap).length > 0,
  );
  const customEnvArray = buildArrayLiteral(customEnvVarKeys);
  const envKeysArray = buildArrayLiteral(envKeys);
  const mapLiteral = hasMap
    ? buildServiceUrlMapLiteral(serviceUrlMap as ServiceUrlMap)
    : '';
  const apiEnvironmentType = hasMap
    ? "keyof typeof SERVICE_URL_MAP | 'custom'"
    : "'custom'";

  const getServiceUrlBlock = hasMap
    ? `/**
 * Get the service URL based on environment.
 *
 * Priority order:
 * 1. Explicit env param (non-custom) → return mapped URL immediately
 * 2. API_ENV env var (${envKeys.join(' / ')}) → if local/development/production, return mapped URL
 * 3. Custom URL from env vars (${customEnvVarKeys.join(' / ')})
 * 4. Fallback to 'local'
 */
export function getServiceUrl(env?: ApiEnvironment): { apiUrl: string; env: string } {
  if (env && env !== 'custom') {
    return {
      apiUrl: (SERVICE_URL_MAP as Record<string, string>)[env] ?? SERVICE_URL_MAP.local,
      env,
    };
  }

  const apiEnv = findEnvVar(${envKeysArray});

  if (apiEnv && apiEnv !== 'custom') {
    return {
      apiUrl: (SERVICE_URL_MAP as Record<string, string>)[apiEnv] ?? SERVICE_URL_MAP.local,
      env: apiEnv,
    };
  }

  const customUrl = findEnvVar(${customEnvArray});
  if (customUrl) {
    return { apiUrl: customUrl, env: 'custom' };
  }

  return {
    apiUrl: (SERVICE_URL_MAP as Record<string, string>)['local'] ?? SERVICE_URL_MAP.local,
    env: 'local',
  };
}`
    : `/**
 * Get the service URL based on environment.
 *
 * Priority order:
 * 1. Custom URL from env vars (${customEnvVarKeys.join(' / ')})
 */
export function getServiceUrl(_env?: ApiEnvironment): { apiUrl: string; env: string } {
  const customUrl = findEnvVar(${customEnvArray});
  if (customUrl) {
    return { apiUrl: customUrl, env: 'custom' };
  }

  throw new Error('No serviceUrlMap provided and no custom URL env var set.');
}`;

  const helpers = `/**
 * Safely read an environment variable across Node.js, Vite, and other runtimes.
 *
 * Uses indirect globalThis access so that bundlers cannot statically evaluate
 * the "process" reference and inline it -- which would crash in browsers.
 */
function getEnvVar(key: string): string | undefined {
  const resolvedKey = key.startsWith('VITE_') ? key : 'VITE_' + key;

  // 1. Vite / import.meta.env
  try {
    // @ts-ignore - import.meta.env exists in Vite
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      const val: string | undefined = import.meta.env[key] ?? import.meta.env[resolvedKey];
      if (val) return val;
    }
  } catch {}

  // 2. Node.js / SSR
  try {
    const g: any = globalThis;
    if (g.process && g.process.env) {
      return g.process.env[key] ?? g.process.env[resolvedKey];
    }
  } catch {}

  return undefined;
}

function findEnvVar(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = getEnvVar(key);
    if (value) return value;
  }
  return undefined;
}`;

  return `${mapLiteral ? `${mapLiteral}\n` : ''}
export type ApiEnvironment = ${apiEnvironmentType};

${helpers}

${getServiceUrlBlock}
`;
}
