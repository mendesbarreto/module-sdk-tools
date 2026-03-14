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
      results.push({ name, previous: dep.spec, reason: 'failed to read tags' });
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

    results.push({ name, previous: dep.spec, next: nextSpec });
  }

  if (!dryRun) {
    packageJson.dependencies = dependencies;
    packageJson.devDependencies = devDependencies;
    writeJsonFile(packageJsonPath, packageJson);

    if (!skipInstall) {
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
