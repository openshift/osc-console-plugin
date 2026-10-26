import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';
import { oc, ocAvailable } from './cluster.js';

/**
 * Gap 5 — Per-node readiness drill-down.
 *
 * The overview page should display a node readiness section when a KataConfig
 * is configured. It breaks nodes into installed, installing, and failed
 * categories with clickable ResourceLinks to each node.
 */
test.describe('Gap 5: Per-node readiness drill-down', () => {
  test('Overview shows node readiness section when KataConfig exists', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /overview|kata/i);

    const body = await page.locator('body').innerText();

    // "no KataConfig exists yet" still matches /kataconfig/ — skip when absent.
    if (/kataconfig/i.test(body) && !/no kataconfig exists/i.test(body)) {
      const hasNodeInfo =
        /kata nodes ready|node details|failed to install|installing/i.test(body);
      expect(
        hasNodeInfo,
        'overview should show node readiness information when KataConfig is present',
      ).toBe(true);
    }

    await assertNoReactErrors(page);
  });

  test('Node readiness renders ResourceLinks for each node', async ({
    page,
    baseURL,
  }) => {
    test.skip(!ocAvailable(), 'oc CLI is not available');

    const result = JSON.parse(
      oc('get kataconfigs -o json')
    );

    const nodes = result.items?.[0]?.status?.kataNodes;

    const expectedNodes: string[] = [
      ...(nodes?.installed ?? []),
      ...(nodes?.installing ?? []),
      ...(nodes?.failedToInstall ?? []),
    ];

    test.skip(
      expectedNodes.length === 0,
      'KataConfig reports no qualifying nodes'
    );

    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /overview|kata/i);

    const nodeLinks = page.locator(
      'a[href*="/k8s/cluster/nodes/"]'
    );

    await expect(nodeLinks).toHaveCount(expectedNodes.length);

    for (const node of expectedNodes) {
      await expect(
        nodeLinks.filter({ hasText: node })
      ).toHaveCount(1);
    }

    await assertNoReactErrors(page);
  });
});
