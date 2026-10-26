import { test } from '@playwright/test';
import { waitForContent, assertNoReactErrors } from './helpers.js';

test.describe('OSC plugin pages load without errors', () => {
  const routes = [
    {
      name: 'Overview',
      path: '/sandboxes',
      content: /overview|operator|kata|sandbox/i,
    },
    {
      name: 'Setup',
      path: '/sandboxes/setup',
      content: /setup|kataconfig|getting started/i,
    },
    {
      name: 'Workloads',
      path: '/sandboxes/workloads',
      content: /workloads|sandbox|name|namespace|kind/i,
    },
    {
      name: 'Runtime classes',
      path: '/sandboxes/runtime-classes',
      content: /runtime class|kata|handler/i,
    },
  ];

  for (const route of routes) {
    test(`${route.name} (${route.path}) renders`, async ({
      page,
      baseURL,
    }) => {
      await page.goto(`${baseURL}${route.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForContent(page, route.content);
      await assertNoReactErrors(page);
    });
  }
});
