import { test, expect } from '@playwright/test';
import {
  waitForConsoleReady,
  expandNavSection,
  collectJsErrors,
  filterCriticalErrors,
} from './helpers.js';

test.describe('OSC nav section visibility', () => {
  test('Sandboxes section is present in admin nav', async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/sandboxes`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForConsoleReady(page);

    const nav = page.locator('nav');
    const navText = await nav.innerText();
    expect(navText).toContain('Sandboxes');
  });

  const navItems = [
    { name: 'Overview', href: '/sandboxes' },
    { name: 'Setup', href: '/sandboxes/setup' },
    { name: 'Workloads', href: '/sandboxes/workloads' },
    { name: 'Runtime classes', href: '/sandboxes/runtime-classes' },
  ];

  for (const item of navItems) {
    test(`nav item "${item.name}" is visible after expanding section`, async ({
      page,
      baseURL,
    }) => {
      await page.goto(`${baseURL}/sandboxes`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await waitForConsoleReady(page);

      await expandNavSection(page, 'Sandboxes');

      const link = page.locator(`nav a[href="${item.href}"]`).first();
      await expect(link).toBeVisible({ timeout: 15_000 });
    });
  }

  test('no JS console errors on Overview page', async ({ page, baseURL }) => {
    const jsErrors = collectJsErrors(page);
    await page.goto(`${baseURL}/sandboxes`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForConsoleReady(page);

    const critical = filterCriticalErrors(jsErrors);
    expect(
      critical,
      `unexpected JS errors: ${critical.join('; ')}`,
    ).toHaveLength(0);
  });
});
