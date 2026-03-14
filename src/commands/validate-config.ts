import { loadConfig, validateConfig } from '../config';

export type ValidateConfigOptions = {
  projectRoot: string;
  configPath?: string;
  requireSdkTargets?: boolean;
};

export async function validateConfigCommand({
  projectRoot,
  configPath,
  requireSdkTargets,
}: ValidateConfigOptions): Promise<void> {
  const { config } = await loadConfig({ projectRoot, configPath });
  const errors = validateConfig(config, { requireSdkTargets });
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  console.log('Config valid');
}
