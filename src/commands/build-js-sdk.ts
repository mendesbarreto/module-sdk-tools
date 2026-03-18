import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, validateConfig } from '../config';
import { buildServiceUrlTemplate } from '../templates/service-url';
import { runCommand } from '../utils/exec';

export type BuildJsSdkOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
  skipInstall?: boolean;
};

export async function buildJsSdk({
  projectRoot,
  configPath,
  dryRun,
  skipInstall,
}: BuildJsSdkOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const jsOutputDir =
    config.jsSdkOutputDir ??
    (config.sdkOutputDir ? `${config.sdkOutputDir}/js` : 'sdk/packages/js');
  const sdkOutputDir = resolve(projectRoot, jsOutputDir);
  const openapiSpecPath = resolve(
    projectRoot,
    config.openapiSpecPath ?? 'openapi-spec/openapi.json',
  );
  const packageName =
    config.jsSdkPackageName ?? 'module-personal-profile-js-sdk';

  if (dryRun) {
    console.log(`[dry-run] build-js-sdk -> ${sdkOutputDir}`);
    return;
  }

  if (!existsSync(openapiSpecPath)) {
    throw new Error(
      `OpenAPI spec not found at ${openapiSpecPath}. Run export-openapi first.`,
    );
  }

  const packageJson = {
    name: packageName,
    version: '1.0.0',
    license: 'UNLICENSED',
    sideEffects: false,
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
        default: './dist/index.js',
      },
      './schema': {
        types: './dist/schema.d.ts',
        import: './dist/schema.js',
        require: './dist/schema.js',
        default: './dist/schema.js',
      },
      './package.json': './package.json',
    },
    main: './dist/index.js',
    types: './dist/index.d.ts',
    files: ['dist', 'openapi.json'],
    scripts: {
      generate: 'openapi-typescript ./openapi.json -o ./src/schema.d.ts',
      build: 'tsc',
      prepublishOnly: 'bun run generate && bun run build',
    },
    devDependencies: {
      'openapi-typescript': '^7.13.0',
      typescript: '^5.0.0',
      '@types/node': '^20.0.0',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      moduleResolution: 'node',
      declaration: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  const indexTs = `${buildServiceUrlTemplate({
    serviceUrlMap: config.serviceUrlMap,
    customEnvVarKeys: config.customEnvVarKeys ?? [],
    envKeys: config.envKeys ?? [],
  })}\n\n// Re-export all types from schema\nexport * from './schema';\n`;

  const readme = `# ${packageName}

TypeScript SDK generated from OpenAPI schema.

## Installation

\`\`\`bash
npm install ssh://git@github.com:<org>/${packageName}.git#<version>
\`\`\`

## Usage

\`\`\`ts
import { getServiceUrl } from '${packageName}';
\`\`\`
`;

  const gitignore = `node_modules/
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
  writeFileSync(resolve(sdkOutputDir, 'src/index.ts'), indexTs);
  cpSync(openapiSpecPath, resolve(sdkOutputDir, 'openapi.json'));
  writeFileSync(resolve(sdkOutputDir, 'README.md'), readme);
  writeFileSync(resolve(sdkOutputDir, '.gitignore'), gitignore);

  if (!skipInstall) {
    runCommand(config.installCommand ?? 'bun install', { cwd: sdkOutputDir });
  }

  runCommand('bun run generate', { cwd: sdkOutputDir });
  runCommand('bun run build', { cwd: sdkOutputDir });
}
