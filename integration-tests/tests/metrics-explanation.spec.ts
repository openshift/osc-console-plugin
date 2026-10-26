import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Gap 6 — Metrics-unavailable explanation for kata/peer-pod workloads.
 *
 * When viewing a peer-pod workload's detail page the metrics section should
 * display an explanatory PatternFly Alert rather than silently showing empty
 * graphs. For non-peer-pod kata workloads, a "No data available" message
 * should appear if metrics are empty.
 */
test.describe('Gap 6: Metrics unavailable explanation', () => {
  test('Workload detail page renders metrics section without errors', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    await waitForContent(page, /workloads|name|namespace|kind/i);

    const firstRow = page.locator('table tbody tr a').first();
    if (
      await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)
    ) {
      await firstRow.click();
      await waitForContent(page, /details|metrics|events|status/i);

      const body = await page.locator('body').innerText();
      const hasMetricsSection = /metrics|cpu|memory|network/i.test(body);
      expect(hasMetricsSection).toBe(true);

      if (/peer.?pod/i.test(body)) {
        expect(body).toMatch(
          /metrics.*not available|run inside.*cloud vm|limited.*visibility/i,
        );
      }
    }

    await assertNoReactErrors(page);
  });

  test('Metrics section shows explanatory alert instead of empty graphs for peer pods', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    await waitForContent(page, /workloads|name|namespace/i);

    const body = await page.locator('body').innerText();
    if (/peer.?pod/i.test(body)) {
      const peerPodRow = page
        .locator('table tbody tr', { hasText: /peer.?pod|kata-remote/i })
        .first();
      if (
        await peerPodRow.isVisible({ timeout: 5_000 }).catch(() => false)
      ) {
        const link = peerPodRow.locator('a').first();
        await link.click();
        await waitForContent(page, /details|metrics/i);

        const alert = page.locator('.pf-v6-c-alert', {
          hasText: /metrics|not available/i,
        });
        await expect(alert).toBeVisible({ timeout: 15_000 });
      }
    }

    await assertNoReactErrors(page);
  });
});
