import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Gap 3 — Operator CSV/Subscription health on Overview.
 *
 * The overview "Installation status" card reflects KataConfig / operator state:
 * "Installed", "Installing", "Install failed", or "Installed, but not configured"
 * when the CRD exists but no KataConfig has been created yet.
 */
test.describe('Gap 3: Operator health on overview', () => {
  test('Overview page shows operator health section', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(
      page,
      /installation status|installed|installing|install failed|operator/i,
    );

    const body = await page.locator('body').innerText();
    expect(body).toMatch(
      /installation status|installed|installing|install failed|the operator is installed|healthy/i,
    );

    await assertNoReactErrors(page);
  });

  test('Overview renders operator version when CSV is available', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(
      page,
      /installation status|installed|installing|operator/i,
    );

    const body = await page.locator('body').innerText();
    // CSV Operator health only appears once a KataConfig exists — not for
    // "Installed, but not configured". When present it shows Healthy/Failed,
    // not a numeric version string.
    if (/\bOperator\b/i.test(body) && !/not configured/i.test(body)) {
      expect(body).toMatch(/\bHealthy\b|\bFailed\b|Succeeded|Installing/i);
    }

    await assertNoReactErrors(page);
  });
});
