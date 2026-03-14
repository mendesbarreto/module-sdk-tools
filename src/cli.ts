#!/usr/bin/env bun
import { buildJsSdk } from './commands/build-js-sdk';
import { buildReactSdk } from './commands/build-react-sdk';
import { exportOpenapi } from './commands/export-openapi';
import { report } from './commands/report';
import { updateSdks } from './commands/update-sdks';
import { validateConfigCommand } from './commands/validate-config';

type CliOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
  skipInstall?: boolean;
  skipPack?: boolean;
  only?: string;
  failOnMissing?: boolean;
};

const [command, ...rest] = process.argv.slice(2);
const options = parseOptions(rest);

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(command ? 0 : 1);
}

try {
  switch (command) {
    case 'export-openapi':
      await exportOpenapi(options);
      break;
    case 'build-js-sdk':
      await buildJsSdk(options);
      break;
    case 'build-react-sdk':
      await buildReactSdk(options);
      break;
    case 'validate-config':
      await validateConfigCommand({
        projectRoot: options.projectRoot,
        configPath: options.configPath,
        requireSdkTargets: false,
      });
      break;
    case 'report':
      report({ projectRoot: options.projectRoot });
      break;
    case 'update-sdks':
      await updateSdks(options);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} catch (error) {
  console.error((error as Error).message ?? error);
  process.exit(1);
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    projectRoot: process.cwd(),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--projectRoot':
      case '-p':
        options.projectRoot = args[i + 1] ? args[i + 1] : options.projectRoot;
        i += 1;
        break;
      case '--config':
        options.configPath = args[i + 1];
        i += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-install':
        options.skipInstall = true;
        break;
      case '--skip-pack':
        options.skipPack = true;
        break;
      case '--only':
        options.only = args[i + 1];
        i += 1;
        break;
      case '--fail-on-missing':
        options.failOnMissing = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: sdk-tools <command> [options]

Commands:
  export-openapi
  build-js-sdk
  build-react-sdk
  validate-config
  report
  update-sdks

Options:
  --projectRoot, -p <path>
  --config <path>
  --dry-run
  --skip-install
  --skip-pack
  --only <name>
  --fail-on-missing
`);
}
