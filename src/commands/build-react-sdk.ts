import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, validateConfig } from '../config';
import { buildServiceUrlTemplate } from '../templates/service-url';
import { runCommand } from '../utils/exec';

export type BuildReactSdkOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
  skipInstall?: boolean;
  skipPack?: boolean;
};

function generateVersion(): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `1.0.0-${ts}`;
}

export async function buildReactSdk({
  projectRoot,
  configPath,
  dryRun,
  skipInstall,
  skipPack,
}: BuildReactSdkOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const reactOutputDir =
    config.reactSdkOutputDir ??
    (config.sdkOutputDir
      ? `${config.sdkOutputDir}/react`
      : 'sdk/packages/react');
  const sdkOutputDir = resolve(projectRoot, reactOutputDir);
  const openapiSpecPath = resolve(
    projectRoot,
    config.openapiSpecPath ?? 'openapi-spec/openapi.json',
  );
  const packageName =
    config.reactSdkPackageName ?? 'module-personal-profile-react-sdk';

  if (dryRun) {
    console.log(`[dry-run] build-react-sdk -> ${sdkOutputDir}`);
    return;
  }

  if (!existsSync(openapiSpecPath)) {
    throw new Error(
      `OpenAPI spec not found at ${openapiSpecPath}. Run export-openapi first.`,
    );
  }

  const version = generateVersion();
  const packageJson = {
    name: packageName,
    version,
    type: 'module',
    license: 'UNLICENSED',
    sideEffects: false,
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.cjs',
        default: './dist/index.js',
      },
      './package.json': './package.json',
    },
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    files: ['dist', 'openapi.json'],
    peerDependencies: {
      '@tanstack/react-query': '^5.x',
      axios: '^1.0.0',
      react: '>=18',
      'react-dom': '>=18',
    },
    devDependencies: {
      typescript: '^5.0.0',
      tsup: '^8.0.0',
      orval: '^8.5.0',
      axios: '^1.0.0',
      '@types/node': '^20.0.0',
      '@types/react': '^18.0.0',
    },
    scripts: {
      generate: 'orval --config orval.config.ts',
      build: 'tsup',
      prepublishOnly: 'bun run generate && bun run build',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      lib: ['ES2020', 'DOM'],
      moduleResolution: 'bundler',
      declaration: true,
      emitDeclarationOnly: true,
      outDir: './dist',
      rootDir: './src',
      strict: false,
      noImplicitAny: false,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      jsx: 'react-jsx',
      isolatedModules: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  const orvalConfig = `import { defineConfig } from 'orval';

export default defineConfig({
  '${packageName}': {
    input: './openapi.json',
    output: {
      target: './src/client.ts',
      client: 'react-query',
      mode: 'split',
      schemas: './src/types',
      override: {
        mutator: {
          path: './src/custom-axios.ts',
          name: 'customAxios',
        },
        query: {
          useQuery: true,
          options: {
            staleTime: 10000,
          },
        },
      },
    },
  },
});
`;

  const tsupConfig = `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@tanstack/react-query',
    '@tanstack/query-core',
    'axios',
  ],
  treeshake: true,
});
`;

  const customAxiosTs = `import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getServiceUrl } from './index';

export const AXIOS_INSTANCE = axios.create();

export const customAxios = async <T>(url: string, config?: RequestInit): Promise<T> => {
  const { apiUrl } = getServiceUrl();
  const source = axios.CancelToken.source();
  const response: AxiosResponse<T> = await AXIOS_INSTANCE({
    url,
    baseURL: apiUrl,
    method: (config?.method as AxiosRequestConfig['method']) ?? 'GET',
    headers: config?.headers as AxiosRequestConfig['headers'],
    data: (config as any)?.body,
    signal: config?.signal,
    cancelToken: source.token,
  });
  return response.data;
};

export default customAxios;

export type ErrorType<Error> = Error;
export type BodyType<BodyData> = BodyData;
`;

  const indexTs = `${buildServiceUrlTemplate({
    serviceUrlMap: config.serviceUrlMap,
    customEnvVarKeys: config.customEnvVarKeys ?? [],
    envKeys: config.envKeys ?? [],
  })}

// Re-export React Query hooks
export * from './client';

// Re-export types
export * from './types';

// Re-export Axios instance for advanced usage
export { AXIOS_INSTANCE } from './custom-axios';
`;

  const readme = `# ${packageName}

React SDK generated from OpenAPI schema with React Query hooks.

## Installation

\`\`\`bash
npm install ssh://git@github.com:<org>/${packageName}.git#<version>
\`\`\`
`;

  const gitignore = `node_modules/
dist/
*.tgz
*.log
.DS_Store
`;

  if (existsSync(sdkOutputDir)) {
    rmSync(sdkOutputDir, { recursive: true, force: true });
  }
  mkdirSync(sdkOutputDir, { recursive: true });
  mkdirSync(resolve(sdkOutputDir, 'src'), { recursive: true });

  writeFileSync(
    resolve(sdkOutputDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );
  writeFileSync(
    resolve(sdkOutputDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2),
  );
  writeFileSync(resolve(sdkOutputDir, 'orval.config.ts'), orvalConfig);
  writeFileSync(resolve(sdkOutputDir, 'tsup.config.ts'), tsupConfig);
  cpSync(openapiSpecPath, resolve(sdkOutputDir, 'openapi.json'));
  writeFileSync(resolve(sdkOutputDir, 'README.md'), readme);
  writeFileSync(resolve(sdkOutputDir, '.gitignore'), gitignore);

  if (!skipInstall) {
    runCommand(config.installCommand ?? 'bun install', { cwd: sdkOutputDir });
  }

  writeFileSync(resolve(sdkOutputDir, 'src/custom-axios.ts'), customAxiosTs);
  runCommand('bun run generate', { cwd: sdkOutputDir });
  writeFileSync(resolve(sdkOutputDir, 'src/index.ts'), indexTs);
  runCommand('bun run build', { cwd: sdkOutputDir });

  const nodeModulesPath = resolve(sdkOutputDir, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    rmSync(nodeModulesPath, { recursive: true, force: true });
  }

  if (!skipPack) {
    runCommand('bun pm pack', { cwd: sdkOutputDir });
  }
}
