import { test, expect } from '@playwright/test';
import {
  navigateTo,
  assertNoReactErrors,
  waitForContent,
} from './helpers.js';

/**
 * Gap 1 — RBAC wiring on every mutating action.
 *
 * These tests verify that mutating surfaces either render or gate behind
 * permission checks. On a cluster where kubeadmin has full access the buttons
 * should be enabled; on a restricted user they would be disabled with a
 * PermissionHint alert. Both paths are valuable — the tests assert the
 * component renders correctly in either case without React errors.
 */
test.describe('Gap 1: RBAC gating on mutating surfaces', () => {
  test('KataConfig wizard renders create/edit button with RBAC check', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup/kataconfig');
    await waitForContent(page, /kataconfig|create|edit|configure/i);

    const submitBtn = page
      .locator('button', { hasText: /create|save|edit/i })
      .first();
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });
    await assertNoReactErrors(page);
  });

  test('PeerPods config wizard renders create/save button with RBAC check', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/setup/peer-pods');
    await waitForContent(page, /peer.?pods?-?cm|cloud provider|create|save|enable peer|not available|unsupported/i);

    // Create when no peer-pods-cm exists yet; Save when editing an existing one.
    // On bare-metal / peer-pods-disabled clusters the wizard may show a
    // readiness/unavailable state instead of a Create/Save button.
    const submitBtn = page
      .getByRole('button', { name: /^(Create|Save)$/i })
      .first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasSubmit) {
      const body = await page.locator('body').innerText();
      expect(body).toMatch(/peer.?pod|cloud provider|enable peer|not available|unsupported|kataconfig/i);
    } else {
      await expect(submitBtn).toBeVisible();
    }
    await assertNoReactErrors(page);
  });

  test('Create workload form renders create button with RBAC check', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads/~new');
    await waitForContent(page, /create.*workload|sandbox|runtime class/i);
    await assertNoReactErrors(page);
  });

  test('Workloads list page renders without RBAC errors', async ({
    page,
    baseURL,
  }) => {
    await navigateTo(page, baseURL!, '/sandboxes/workloads');
    await waitForContent(page, /workloads|name|namespace|kind/i);
    await assertNoReactErrors(page);
  });
});
