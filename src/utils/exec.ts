import { execSync } from 'node:child_process';

export function runCommand(
  command: string,
  options: { cwd: string; dryRun?: boolean } = { cwd: process.cwd() },
): void {
  if (options.dryRun) {
    console.log(`[dry-run] ${command}`);
    return;
  }

  execSync(command, { cwd: options.cwd, stdio: 'inherit' });
}

export function captureCommand(
  command: string,
  options: { cwd: string } = { cwd: process.cwd() },
): string {
  return execSync(command, { cwd: options.cwd, stdio: 'pipe' }).toString();
}
