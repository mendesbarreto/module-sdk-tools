export function normalizeGitUrlForInstall(rawUrl: string): string {
  const url = rawUrl.trim();

  if (url.startsWith('ssh://')) {
    return url;
  }

  if (url.startsWith('git@github.com:')) {
    return `ssh://git@github.com/${url.replace('git@github.com:', '')}`;
  }

  if (url.startsWith('https://github.com/')) {
    return url.replace('https://github.com/', 'ssh://git@github.com/');
  }

  return url;
}

export function stripGitTag(spec: string): { baseUrl: string; tag?: string } {
  const [baseUrl, tag] = spec.split('#');
  return { baseUrl, tag };
}
