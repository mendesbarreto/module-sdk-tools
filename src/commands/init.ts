import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../config';

export type InitOptions = {
  projectRoot: string;
  configPath?: string;
  force?: boolean;
};

export async function initConfig({
  projectRoot,
  configPath,
  force,
}: InitOptions): Promise<void> {
  const resolvedPath = configPath
    ? resolve(projectRoot, configPath)
    : resolve(projectRoot, 'sdk-tools.config.ts');

  if (existsSync(resolvedPath) && !force) {
    throw new Error(
      `Config already exists at ${resolvedPath}. Use --force to overwrite.`,
    );
  }

  const outputDir = dirname(resolvedPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(resolvedPath, buildConfigTemplate());
  console.log(`Created ${resolvedPath}`);
}

function buildConfigTemplate(): string {
  const jsSdkPackageName =
    DEFAULT_CONFIG.jsSdkPackageName ?? 'module-personal-profile-js-sdk';
  const reactSdkPackageName =
    DEFAULT_CONFIG.reactSdkPackageName ?? 'module-personal-profile-react-sdk';
  const sdkDependencies = [reactSdkPackageName];

  return `import type { SdkToolsConfig } from 'module-sdk-tools';

const config: SdkToolsConfig = {
  serviceUrlMap: {
    local: 'http://localhost:3126',
    development: 'https://dev-api.example.com',
    staging: 'https://staging-api.example.com',
    production: 'https://api.example.com',
  },
  jsSdkPackageName: ${JSON.stringify(jsSdkPackageName)},
  reactSdkPackageName: ${JSON.stringify(reactSdkPackageName)},
  sdkDependencies: ${JSON.stringify(sdkDependencies)},
  sdkDependencyPattern: '.*-sdk$',
};

export default config;
`;
}
