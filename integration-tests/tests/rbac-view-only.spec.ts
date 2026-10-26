import { test, expect } from '@playwright/test';
import { assertNoReactErrors, waitForContent, waitForConsoleReady } from './helpers.js';
import { viewerCreds } from './cluster.js';

/**
 * Manual matrix A-59: view-only user cannot save KataConfig.
 *
 * Independent of CoCo/Trustee. Requires a cluster user with view (or less)
 * on KataConfig resources:
 *   BRIDGE_VIEWER_USER / BRIDGE_VIEWER_PASSWORD
 * (e.g. htpasswd plugin-viewer bound to ClusterRole/view).
 */
test.describe('OSC view-only RBAC', () => {
  // Do not reuse kubeadmin storageState from the project.
  test.use({ storageState: { cookies: [], origins: [] } });

  const creds = viewerCreds();

  test.beforeEach(async ({ page, baseURL }) => {
    test.skip(!creds, 'Set BRIDGE_VIEWER_USER and BRIDGE_VIEWER_PASSWORD to run view-only checks');

    await page.goto(`${baseURL}/auth/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    const provider = page.locator('a').filter({ hasText: /htpasswd|plugin-viewer/i }).first();
    if (await provider.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await provider.click();
    }
    await page.fill('input[name="username"], #inputUsername', creds!.user);
    await page.fill('input[name="password"], #inputPassword', creds!.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(
      (u) =>
        u.origin.includes('console-openshift-console') &&
        !u.pathname.includes('/login') &&
        !u.pathname.includes('/auth/error'),
      { timeout: 180_000 },
    );
    await page.goto(baseURL!, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForConsoleReady(page);
  });

  test('A-59 KataConfig Save is disabled or gated for viewer', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/sandboxes/setup/kataconfig`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await waitForContent(page, /kataconfig|create|edit|permission|forbidden|access/i);

    const submit = page.getByRole('button', { name: /^(Create|Save)$/i }).first();
    const visible = await submit.isVisible({ timeout: 20_000 }).catch(() => false);
    if (visible) {
      await expect(submit).toBeDisabled();
    } else {
      const body = await page.locator('body').innerText();
      expect(body).toMatch(/permission|not authorized|forbidden|cannot|access denied/i);
    }
    await assertNoReactErrors(page);
  });
});
