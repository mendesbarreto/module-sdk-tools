import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ServiceUrlMap = Record<string, string>;

export type SdkToolsConfig = {
  serviceUrlMap?: ServiceUrlMap;
  customEnvVarKeys?: string[];
  envKeys?: string[];
  openapiExportScript?: string;
  buildJsScript?: string;
  buildReactScript?: string;
  openapiSpecPath?: string;
  sdkOutputDir?: string;
  jsSdkOutputDir?: string;
  reactSdkOutputDir?: string;
  jsSdkPackageName?: string;
  reactSdkPackageName?: string;
  installCommand?: string;
  sdkDependencies?: string[];
  sdkDependencyPattern?: string;
  openapiClientOutputDir?: string;
  openapiClientPackageName?: string;
  openapiClientHttpClient?: 'axios' | 'fetch';
  openapiClientScript?: string;
  openapiClientUseOptions?: boolean;
  failOnMissingOperationId?: boolean;
};

export type LoadConfigOptions = {
  projectRoot: string;
  configPath?: string;
};

export type ValidationOptions = {
  requireSdkTargets?: boolean;
};

export const DEFAULT_CONFIG: SdkToolsConfig = {
  customEnvVarKeys: [
    'MODULE_API_URL',
    'NEXT_PUBLIC_MODULE_API_URL',
    'VITE_MODULE_API_URL',
  ],
  envKeys: ['API_ENV', 'NEXT_PUBLIC_API_ENV', 'VITE_API_ENV'],
  openapiExportScript: 'bun run src/scripts/export-openapi.ts',
  buildJsScript: 'bun run src/scripts/build-js-sdk.ts',
  buildReactScript: 'bun run src/scripts/build-react-sdk.ts',
  openapiSpecPath: 'openapi-spec/openapi.json',
  sdkOutputDir: 'sdk/packages',
  jsSdkOutputDir: 'sdk/packages/js',
  reactSdkOutputDir: 'sdk/packages/react',
  jsSdkPackageName: 'module-personal-profile-js-sdk',
  reactSdkPackageName: 'module-personal-profile-react-sdk',
  installCommand: 'bun install',
  openapiClientOutputDir: 'sdk/packages/api',
  openapiClientHttpClient: 'axios',
  failOnMissingOperationId: true,
};

export async function loadConfig({
  projectRoot,
  configPath,
}: LoadConfigOptions): Promise<{
  config: SdkToolsConfig;
  resolvedPath?: string;
}> {
  const resolvedPath = configPath
    ? resolve(projectRoot, configPath)
    : resolve(projectRoot, 'sdk-tools.config.ts');

  let fileConfig: SdkToolsConfig = {};
  if (existsSync(resolvedPath)) {
    const module = await import(pathToFileURL(resolvedPath).href);
    fileConfig = (module.default ?? module) as SdkToolsConfig;
  }

  return {
    config: { ...DEFAULT_CONFIG, ...fileConfig },
    resolvedPath: existsSync(resolvedPath) ? resolvedPath : undefined,
  };
}

export function validateConfig(
  config: SdkToolsConfig,
  options: ValidationOptions = {},
): string[] {
  const errors: string[] = [];
  const hasMap = Boolean(
    config.serviceUrlMap && Object.keys(config.serviceUrlMap).length > 0,
  );
  const hasEnvKeys =
    (config.customEnvVarKeys?.length ?? 0) > 0 &&
    (config.envKeys?.length ?? 0) > 0;

  if (!hasMap && !hasEnvKeys) {
    errors.push(
      'Provide either serviceUrlMap or both customEnvVarKeys and envKeys in sdk-tools.config.ts.',
    );
  }

  if (options.requireSdkTargets) {
    const hasDependencies = (config.sdkDependencies?.length ?? 0) > 0;
    const hasPattern = Boolean(config.sdkDependencyPattern);

    if (!hasDependencies && !hasPattern) {
      errors.push(
        'Provide sdkDependencies or sdkDependencyPattern to use update-sdks.',
      );
    }

    if (config.sdkDependencyPattern) {
      try {
        parseDependencyPattern(config.sdkDependencyPattern);
      } catch (error) {
        errors.push(
          `Invalid sdkDependencyPattern: ${(error as Error).message}`,
        );
      }
    }
  }

  return errors;
}

export function parseDependencyPattern(pattern: string): RegExp {
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const lastSlash = pattern.lastIndexOf('/');
    const body = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    return new RegExp(body, flags);
  }

  return new RegExp(pattern);
}
