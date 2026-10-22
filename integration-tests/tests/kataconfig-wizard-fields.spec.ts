import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Manual matrix A-22–A-28 / A-58+: KataConfig wizard field presence.
 * Self-contained in OSC — does not call CoCo or Trustee routes.
 */
test.describe('KataConfig wizard field matrix', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup/kataconfig');
    await waitForContent(page, /kataconfig|create|edit|enable peer pods|deployment mode/i);
  });

  test('A-22 peer pods toggle is present', async ({ page }) => {
    const toggle = page.locator('#kc-peerpods');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await assertNoReactErrors(page);
  });

  test('A-22+ peer pods switch is clickable (restored)', async ({ page }) => {
    const toggle = page.locator('#kc-peerpods');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    const before = await toggle.isChecked();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ checked: !before });
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ checked: before });
  });

  test('A-23 deployment mode options are present', async ({ page }) => {
    await expect(page.locator('#kc-mode-auto')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#kc-mode-daemonset')).toBeVisible();
    await expect(page.locator('#kc-mode-machineconfig')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/DaemonSet/i);
    expect(body).toMatch(/MachineConfig/i);
  });

  test('A-24 node selection controls are present', async ({ page }) => {
    await expect(page.locator('#kc-nodes-all')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#kc-nodes-specific')).toBeVisible();
  });

  test('A-27 check node eligibility toggle is present', async ({ page }) => {
    await expect(page.locator('#kc-eligibility')).toBeVisible({ timeout: 15_000 });
  });

  test('A-28 log level select offers info and debug', async ({ page }) => {
    const sel = page.locator('#kc-loglevel');
    await expect(sel).toBeVisible({ timeout: 15_000 });
    const options = await sel.locator('option').allTextContents();
    const joined = options.join(' ').toLowerCase();
    expect(joined).toMatch(/info/);
    expect(joined).toMatch(/debug/);
  });

  test('A-58+ Save/Create is enabled for kubeadmin', async ({ page }) => {
    const submit = page.getByRole('button', { name: /^(Create|Save)$/i }).first();
    await expect(submit).toBeVisible({ timeout: 15_000 });
    await expect(submit).toBeEnabled();
  });
});
