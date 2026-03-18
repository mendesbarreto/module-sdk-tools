import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig, parseDependencyPattern, validateConfig } from '../config';
import { captureCommand, runCommand } from '../utils/exec';
import { readJsonFile, writeJsonFile } from '../utils/fs';
import { stripGitTag } from '../utils/git';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type UpdateSdksOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
  skipInstall?: boolean;
  only?: string;
  failOnMissing?: boolean;
};

type UpdateResult = {
  name: string;
  previous?: string;
  next?: string;
  baseUrl?: string;
  reason?: string;
};

export async function updateSdks({
  projectRoot,
  configPath,
  dryRun,
  skipInstall,
  only,
  failOnMissing,
}: UpdateSdksOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });
  const errors = validateConfig(config, { requireSdkTargets: true });
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const packageJsonPath = resolve(projectRoot, 'package.json');
  const packageJson = readJsonFile<PackageJson>(packageJsonPath);
  const dependencies = packageJson.dependencies ?? {};
  const devDependencies = packageJson.devDependencies ?? {};

  const allDeps = new Map<
    string,
    { group: 'dependencies' | 'devDependencies'; spec: string }
  >();
  for (const [name, spec] of Object.entries(dependencies)) {
    allDeps.set(name, { group: 'dependencies', spec });
  }
  for (const [name, spec] of Object.entries(devDependencies)) {
    allDeps.set(name, { group: 'devDependencies', spec });
  }

  const candidates = new Set<string>();
  const missingExplicit: string[] = [];

  if (config.sdkDependencies) {
    for (const name of config.sdkDependencies) {
      if (allDeps.has(name)) {
        candidates.add(name);
      } else {
        missingExplicit.push(name);
      }
    }
  }

  if (config.sdkDependencyPattern) {
    const pattern = parseDependencyPattern(config.sdkDependencyPattern);
    for (const name of allDeps.keys()) {
      if (pattern.test(name)) {
        candidates.add(name);
      }
    }
  }

  if (only) {
    if (allDeps.has(only)) {
      candidates.clear();
      candidates.add(only);
    } else {
      missingExplicit.push(only);
    }
  }

  if (missingExplicit.length > 0 && failOnMissing) {
    throw new Error(`Missing dependencies: ${missingExplicit.join(', ')}`);
  }

  const results: UpdateResult[] = [];

  for (const name of candidates) {
    const dep = allDeps.get(name);
    if (!dep) continue;

    const { baseUrl } = stripGitTag(dep.spec);
    if (!isGitUrl(baseUrl)) {
      results.push({
        name,
        previous: dep.spec,
        reason: 'not a git url',
      });
      continue;
    }

    let tagsOutput = '';
    try {
      const remoteUrl = normalizeRemoteUrl(baseUrl);
      tagsOutput = captureCommand(`git ls-remote --tags ${remoteUrl}`, {
        cwd: projectRoot,
      });
    } catch (error) {
      results.push({
        name,
        previous: dep.spec,
        reason: `failed to read tags ${error}`,
      });
      continue;
    }

    const latestTag = pickLatestTag(tagsOutput);
    if (!latestTag) {
      results.push({ name, previous: dep.spec, reason: 'no tags found' });
      continue;
    }

    const nextSpec = `${baseUrl}#${latestTag}`;
    if (dep.group === 'dependencies') {
      dependencies[name] = nextSpec;
    } else {
      devDependencies[name] = nextSpec;
    }

    results.push({ name, previous: dep.spec, next: nextSpec, baseUrl });
  }

  if (!dryRun) {
    packageJson.dependencies = dependencies;
    packageJson.devDependencies = devDependencies;
    writeJsonFile(packageJsonPath, packageJson);

    if (!skipInstall) {
      const updatedNames = results
        .filter(
          (
            item,
          ): item is Required<Pick<UpdateResult, 'name' | 'baseUrl'>> &
            UpdateResult =>
            Boolean(item.next && item.next !== item.previous && item.baseUrl),
        )
        .map((item) => ({ name: item.name, baseUrl: item.baseUrl }));

      const installCommand = config.installCommand ?? 'bun install';
      if (updatedNames.length > 0 && usesBunInstall(installCommand)) {
        clearBunCacheForDependencies(updatedNames, projectRoot);
      }

      runCommand(config.installCommand ?? 'bun install', { cwd: projectRoot });
    }
  }

  printResults(results, dryRun);
}

function isGitUrl(value: string): boolean {
  return (
    value.startsWith('ssh://') ||
    value.startsWith('git@github.com:') ||
    value.startsWith('https://github.com/')
  );
}

function normalizeRemoteUrl(url: string): string {
  if (url.startsWith('ssh://git@github.com:')) {
    return url.replace('ssh://git@github.com:', 'ssh://git@github.com/');
  }
  return url;
}

function pickLatestTag(output: string): string | undefined {
  const tags = new Set<string>();
  for (const line of output.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const ref = parts[1];
    if (!ref.startsWith('refs/tags/')) continue;
    if (ref.endsWith('^{}')) continue;
    tags.add(ref.replace('refs/tags/', ''));
  }

  if (tags.size === 0) return undefined;

  const tagged = Array.from(tags).map((tag) => ({
    tag,
    ts: parseTagTimestamp(tag),
  }));
  const withTs = tagged.filter((item) => item.ts !== undefined) as {
    tag: string;
    ts: number;
  }[];

  if (withTs.length > 0) {
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs[0].tag;
  }

  return Array.from(tags).sort().pop();
}

function parseTagTimestamp(tag: string): number | undefined {
  const match = tag.match(/(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const [yy, mm, dd, hh, mi, ss] = match.slice(1);
  const iso = `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? undefined : ts;
}

function usesBunInstall(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized.includes('bun') && normalized.includes('install');
}

function clearBunCacheForDependencies(
  dependencies: { name: string; baseUrl: string }[],
  projectRoot: string,
): void {
  const cacheDir = resolveBunCacheDir(projectRoot);
  if (!cacheDir || !existsSync(cacheDir)) {
    return;
  }

  const packageNames = new Set(
    dependencies.map((dependency) => dependency.name),
  );
  const normalizedBaseUrls = new Set(
    dependencies
      .map((dependency) => normalizeGitUrlForCompare(dependency.baseUrl))
      .filter((value) => value.length > 0),
  );

  for (const entry of readdirSync(cacheDir)) {
    const entryPath = resolve(cacheDir, entry);

    if (
      entry.startsWith('@G@') &&
      matchesGitPackageCacheEntry(entryPath, packageNames)
    ) {
      rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (
      entry.endsWith('.git') &&
      matchesGitRepoCacheEntry(entryPath, normalizedBaseUrls)
    ) {
      rmSync(entryPath, { recursive: true, force: true });
    }
  }
}

function resolveBunCacheDir(projectRoot: string): string {
  const envCache = process.env.BUN_INSTALL_CACHE_DIR;
  if (envCache && envCache.trim().length > 0) {
    return envCache;
  }

  try {
    const output = captureCommand('bun pm cache', { cwd: projectRoot }).trim();
    if (output.length > 0) {
      return output;
    }
  } catch {
    return resolve(homedir(), '.bun', 'install', 'cache');
  }

  return resolve(homedir(), '.bun', 'install', 'cache');
}

function matchesGitPackageCacheEntry(
  entryPath: string,
  packageNames: Set<string>,
): boolean {
  const packageJsonPath = resolve(entryPath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      name?: string;
    };
    return Boolean(packageJson.name && packageNames.has(packageJson.name));
  } catch {
    return false;
  }
}

function matchesGitRepoCacheEntry(
  entryPath: string,
  normalizedBaseUrls: Set<string>,
): boolean {
  const configPath = resolve(entryPath, 'config');
  if (!existsSync(configPath)) {
    return false;
  }

  try {
    const config = readFileSync(configPath, 'utf-8');
    const remoteUrl = extractOriginRemoteUrl(config);
    if (!remoteUrl) {
      return false;
    }

    const normalizedRemote = normalizeGitUrlForCompare(remoteUrl);
    return normalizedBaseUrls.has(normalizedRemote);
  } catch {
    return false;
  }
}

function extractOriginRemoteUrl(config: string): string | undefined {
  const lines = config.split('\n');
  let inOriginBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      inOriginBlock = line === '[remote "origin"]';
      continue;
    }

    if (!inOriginBlock) {
      continue;
    }

    const match = line.match(/^url\s*=\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

function normalizeGitUrlForCompare(url: string): string {
  let normalized = normalizeRemoteUrl(url.trim());

  if (normalized.startsWith('git@github.com:')) {
    normalized = normalized.replace('git@github.com:', 'ssh://git@github.com/');
  }

  if (normalized.endsWith('.git')) {
    normalized = normalized.slice(0, -4);
  }

  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function printResults(results: UpdateResult[], dryRun?: boolean): void {
  const updated = results.filter((r) => r.next && r.next !== r.previous);
  const skipped = results.filter((r) => !r.next || r.next === r.previous);

  if (dryRun) {
    console.log('[dry-run] update-sdks');
  }

  for (const result of updated) {
    console.log(`updated ${result.name}: ${result.previous} -> ${result.next}`);
  }

  for (const result of skipped) {
    const reason = result.reason ? ` (${result.reason})` : '';
    console.log(`skipped ${result.name}: ${result.previous}${reason}`);
  }
}
