import { resolve } from 'node:path';
import { captureCommand } from '../utils/exec';
import { readJsonFile } from '../utils/fs';
import { normalizeGitUrlForInstall } from '../utils/git';

type PackageJson = {
  name?: string;
  version?: string;
};

export type ReportOptions = {
  projectRoot: string;
};

export function report({ projectRoot }: ReportOptions): void {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);
  const name = packageJson.name ?? 'unknown';
  const version = packageJson.version ?? 'unknown';

  let remoteUrl = '';
  try {
    remoteUrl = captureCommand('git config --get remote.origin.url', {
      cwd: projectRoot,
    }).trim();
  } catch {}

  console.log(`package: ${name}`);
  console.log(`version: ${version}`);

  if (remoteUrl) {
    const normalized = normalizeGitUrlForInstall(remoteUrl);
    console.log(`install: ${normalized}#${version}`);
  }
}
