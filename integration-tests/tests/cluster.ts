import { execSync } from 'child_process';

/** True when `oc` can talk to a cluster (KUBECONFIG / login already set). */
export function ocAvailable(): boolean {
  try {
    execSync('oc whoami', { stdio: 'pipe', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

export function oc(args: string): string {
  return execSync(`oc ${args}`, {
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function viewerCreds(): { user: string; password: string } | null {
  const user = process.env.BRIDGE_VIEWER_USER?.trim();
  const password = process.env.BRIDGE_VIEWER_PASSWORD?.trim();
  if (!user || !password) return null;
  return { user, password };
}
