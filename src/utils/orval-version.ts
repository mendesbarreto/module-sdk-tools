import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PackageJsonShape = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export const DEFAULT_REACT_SDK_ORVAL_VERSION = '^8.5.0';

export function parseOrvalVersionFromPackageJsonContent(
  content: string,
): string | undefined {
  const packageJson = JSON.parse(content) as PackageJsonShape;
  const version =
    packageJson.devDependencies?.orval ?? packageJson.dependencies?.orval;

  if (typeof version !== 'string') {
    return undefined;
  }

  const normalizedVersion = version.trim();
  return normalizedVersion.length > 0 ? normalizedVersion : undefined;
}

export function resolveOrvalVersionForReactSdk(projectRoot: string): string {
  const packageJsonPath = resolve(projectRoot, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return DEFAULT_REACT_SDK_ORVAL_VERSION;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    return (
      parseOrvalVersionFromPackageJsonContent(content) ??
      DEFAULT_REACT_SDK_ORVAL_VERSION
    );
  } catch {
    return DEFAULT_REACT_SDK_ORVAL_VERSION;
  }
}
