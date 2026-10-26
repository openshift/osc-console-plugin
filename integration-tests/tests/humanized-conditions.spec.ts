import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Gap 4 — Humanized KataConfig condition messages.
 *
 * The overview page should display KataConfig conditions with user-friendly
 * messages rather than raw API reason strings. For example,
 * "BlockedByExistingKataPods" becomes a message telling the user to drain
 * existing kata workloads before uninstalling.
 */
test.describe('Gap 4: Humanized KataConfig conditions', () => {
  test('Overview shows KataConfig status with readable condition text', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /overview|kata|status/i);

    const body = await page.locator('body').innerText();

    const hasConditions = /installed|installing|uninstalling|blocked|nodes failing/i.test(
      body,
    );
    const hasRawReasons = /BlockedByExistingKataPods|NodesFailing/i.test(body);

    if (hasConditions) {
      expect(
        hasRawReasons,
        'raw API reason strings should not appear; humanized messages should be shown instead',
      ).toBe(false);
    }

    await assertNoReactErrors(page);
  });

  test('Overview renders condition messages without React errors', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes');
    await waitForContent(page, /overview|kata|status/i);
    await assertNoReactErrors(page);
  });
});
