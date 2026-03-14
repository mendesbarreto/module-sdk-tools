import { loadConfig } from '../config';
import { runCommand } from '../utils/exec';

export type ExportOpenapiOptions = {
  projectRoot: string;
  configPath?: string;
  dryRun?: boolean;
};

export async function exportOpenapi({
  projectRoot,
  configPath,
  dryRun,
}: ExportOpenapiOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });
  const command =
    config.openapiExportScript ?? 'bun run src/scripts/export-openapi.ts';

  runCommand(command, { cwd: projectRoot, dryRun });
}
