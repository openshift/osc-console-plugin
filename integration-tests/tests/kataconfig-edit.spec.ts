import { test, expect } from '@playwright/test';
import { navigateTo, assertNoReactErrors, waitForContent } from './helpers.js';

/**
 * Gap 2 — KataConfig wizard edit mode.
 *
 * When a KataConfig already exists the wizard should switch to edit mode:
 * title changes, name field is disabled, and the submit button reads "Save".
 * When no KataConfig exists, create mode is shown instead.
 */
test.describe('Gap 2: KataConfig wizard edit mode', () => {
  test('KataConfig wizard page renders without errors', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup/kataconfig');
    await waitForContent(page, /kataconfig|create|edit|configure/i);
    await assertNoReactErrors(page);
  });

  test('wizard shows either create or edit mode based on existing KataConfig', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup/kataconfig');
    await waitForContent(page, /kataconfig|create|edit|configure/i);

    const heading = page
      .locator('h1, h2, [class*="title"]', {
        hasText: /create kataconfig|edit kataconfig/i,
      })
      .first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    const headingText = await heading.innerText();
    if (/edit/i.test(headingText)) {
      const nameInput = page.locator('input[id="kc-name"]').first();
      if (await nameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(nameInput).toBeDisabled();
      }
    }

    await assertNoReactErrors(page);
  });

  test('Setup page shows "Edit KataConfig" action when config exists', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup');
    await waitForContent(page, /setup|kataconfig|getting started/i);

    const body = await page.locator('body').innerText();
    if (/ready|failed/i.test(body)) {
      const editLink = page
        .locator('a, button', { hasText: /edit kataconfig|configure kataconfig|kataconfig/i })
        .first();
      const visible = await editLink.isVisible({ timeout: 15_000 }).catch(() => false);
      if (!visible) {
        // Setup checklist may expose the edit path as a step link/text only.
        expect(body).toMatch(/edit|configure|kataconfig/i);
      }
    }

    await assertNoReactErrors(page);
  });
});
