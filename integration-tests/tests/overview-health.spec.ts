import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Manual matrix A-8 (and A-41 when status= links exist).
 */
test.describe('OSC overview workload health', () => {
  test('A-8 workload health section renders', async ({ page, baseURL }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /sandboxes|overview|workload health|healthy|no sandboxed/i);

    const body = await page.locator('#content-scrollable, body').first().innerText();
    const hasHealthUi =
      /workload health|healthy|warning|error|no sandboxed workloads/i.test(body) ||
      (await page.locator('.osc-openshift-console-plugin__health-bar').count()) > 0;

    expect(hasHealthUi, 'overview should show health bar or empty-workloads state').toBe(true);
    await assertNoReactErrors(page);
  });

  test('A-41 health filter status= links (skip if absent)', async ({ page, baseURL }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /sandboxes|overview|workload/i);

    const filter = page.locator('a[href*="status="]').first();
    const visible = await filter.isVisible({ timeout: 8_000 }).catch(() => false);
    test.skip(!visible, 'No status= filter links in current UI');

    const href = await filter.getAttribute('href');
    expect(href).toMatch(/status=/);
    await filter.click();
    await page.waitForURL(/status=/, { timeout: 30_000 });
  });
});
