import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Gap 7 — Workload list and create form alignment.
 *
 * The workload list shows both Pods and Deployments (the "Kind" column)
 * so the list matches what the create form can produce. With zero workloads
 * the list shows an empty state instead of a table — Kind appears once rows exist.
 */
test.describe('Gap 7: Workload list and create form alignment', () => {
  test('Workloads list has a Kind column or empty state', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    // Wait until the list settles: empty state or the Kind column (rows present).
    // Matching only the page title can finish before either appears.
    await waitForContent(
      page,
      /no sandboxed workloads|\bKind\b/i,
    );

    const emptyOrKind = page
      .getByText(/No sandboxed workloads/i)
      .or(page.locator('th').filter({ hasText: /^Kind$/i }));
    await expect(emptyOrKind.first()).toBeVisible({ timeout: 30_000 });

    await assertNoReactErrors(page);
  });

  test('Workloads list shows Pod and/or Deployment rows', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    // Settle past SkeletonTable (which has tbody rows but no Kind header).
    await waitForContent(page, /no sandboxed workloads|\bKind\b/i);

    const empty = page.getByText(/No sandboxed workloads/i);
    if (await empty.isVisible().catch(() => false)) {
      await assertNoReactErrors(page);
      return;
    }

    const rows = page.locator('table[aria-label*="Sandboxed" i] tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    const tableText = await page
      .locator('table[aria-label*="Sandboxed" i]')
      .innerText();
    expect(
      /\bPod\b|\bDeployment\b/i.test(tableText),
      'workload rows should show Pod or Deployment in the Kind column',
    ).toBe(true);

    await assertNoReactErrors(page);
  });

  test('Create workload form offers both Pod and Deployment options', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads/~new');
    // Wait for the kind radios / workload-type fieldset, not just chrome.
    await waitForContent(page, /workload type|\bPod\b|\bDeployment\b/i);

    const body = await page.locator('body').innerText();
    expect(body).toMatch(/\bPod\b/);
    expect(body).toMatch(/\bDeployment\b/);

    await assertNoReactErrors(page);
  });

  test('Deployment detail page is accessible from workload list', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    await waitForContent(page, /no sandboxed workloads|\bKind\b/i);

    const deploymentRow = page
      .locator('table[aria-label*="Sandboxed" i] tbody tr', {
        hasText: /Deployment/i,
      })
      .first();

    if (
      await deploymentRow.isVisible({ timeout: 5_000 }).catch(() => false)
    ) {
      const link = deploymentRow.locator('a').first();
      const href = await link.getAttribute('href');
      expect(href).toContain('/sandboxes/workloads/Deployment/');

      await link.click();
      await waitForContent(page, /details|replicas|status/i);
      await assertNoReactErrors(page);
    }
  });
});
