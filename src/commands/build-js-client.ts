import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { runCommand } from '../utils/exec';

type BuildJsClientOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
};

type OpenApiSpec = {
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
      }
    >
  >;
};

function listMissingOperationIds(spec: OpenApiSpec) {
  const missing: string[] = [];
  const paths = spec.paths ?? {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const normalized = method.toLowerCase();
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(normalized)) {
        continue;
      }
      if (!operation?.operationId) {
        missing.push(`${normalized.toUpperCase()} ${path}`);
      }
    }
  }

  return missing;
}

export async function buildJsClient({
  projectRoot,
  configPath,
  dryRun,
}: BuildJsClientOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });

  const openapiSpecPath = resolve(
    projectRoot,
    config.openapiSpecPath ?? 'openapi-spec/openapi.json',
  );
  const outputDir = resolve(
    projectRoot,
    config.openapiClientOutputDir ?? 'sdk/packages/api',
  );

  if (!openapiSpecPath) {
    throw new Error('OpenAPI spec path is required.');
  }

  const spec = JSON.parse(
    readFileSync(openapiSpecPath, 'utf-8'),
  ) as OpenApiSpec;

  if (config.failOnMissingOperationId) {
    const missing = listMissingOperationIds(spec);
    if (missing.length > 0) {
      throw new Error(
        `Missing operationId for:\n${missing.map((item) => `- ${item}`).join('\n')}`,
      );
    }
  }

  const script =
    config.openapiClientScript ??
    `bunx openapi-typescript-codegen --input ${openapiSpecPath} --output ${outputDir} --client ${config.openapiClientHttpClient ?? 'axios'}`;

  runCommand(script, { cwd: projectRoot, dryRun });
}
