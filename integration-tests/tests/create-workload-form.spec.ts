import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Manual matrix A-54: Create OSC workload form renders (no submit required).
 */
test.describe('Create OSC workload form', () => {
  test('A-54 create form renders core fields', async ({ page, baseURL }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads/~new');
    await waitForContent(page, /create|workload|runtime class|name/i);

    const body = await page.locator('#content-scrollable, body').first().innerText();
    expect(body).toMatch(/name|runtime|image|namespace/i);

    const createBtn = page.getByRole('button', { name: /^Create$/i }).first();
    const hasCreate = await createBtn.isVisible({ timeout: 15_000 }).catch(() => false);
    if (hasCreate) {
      await expect(createBtn).toBeVisible();
    } else {
      // Some builds use Submit / Create workload
      const alt = page.locator('button').filter({ hasText: /create/i }).first();
      await expect(alt).toBeVisible({ timeout: 10_000 });
    }
    await assertNoReactErrors(page);
  });
});
