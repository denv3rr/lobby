import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];

test("boots lobby in WebGL mode and supports a basic theme switch", async ({ page }) => {
  const assetResponses = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\/assets\/(?:images|textures|models)\//.test(url)) {
      assetResponses.push({
        status: response.status(),
        url
      });
    }
  });

  await page.goto("/?debugui=1&sceneui=1");

  const fallbackVisible = await page.evaluate(() => {
    const panel = document.querySelector("#fallback-panel");
    return Boolean(panel && !panel.classList.contains("hidden"));
  });
  expect(fallbackVisible).toBeFalsy();

  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();

  const themeSelect = page.locator("#theme-select");
  await expect(themeSelect).toBeVisible();
  await expect
    .poll(async () => themeSelect.locator("option").count(), { timeout: 25_000 })
    .toBeGreaterThan(1);

  await expect
    .poll(
      () =>
        page.evaluate(async (hookNames) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (!api || typeof api !== "object" || typeof api.getStats !== "function") {
              continue;
            }
            try {
              const stats = await api.getStats();
              if (stats && typeof stats === "object") {
                return true;
              }
            } catch {
              // keep searching
            }
          }
          return false;
        }, DEBUG_HOOK_NAMES),
      { timeout: 25_000 }
    )
    .toBeTruthy();

  const objectivesPanel = page.locator("#objectives-panel");
  await expect(objectivesPanel).toBeVisible();
  await expect
    .poll(async () => page.locator("#objectives-list .objectives-item").count(), {
      timeout: 25_000
    })
    .toBeGreaterThan(0);

  const availableThemeIds = await themeSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  const currentTheme = await themeSelect.inputValue();
  const nextTheme = availableThemeIds.find((themeId) => themeId !== currentTheme) || currentTheme;

  await themeSelect.selectOption(nextTheme);
  await expect(themeSelect).toHaveValue(nextTheme);

  const soundButton = page.locator("#enable-sound-btn");
  if (await soundButton.isVisible()) {
    await soundButton.click({ force: true });
  }
  await expect(page.locator("#sound-gate")).toHaveClass(/hidden/);

  await page.waitForTimeout(500);

  const serverErrors = assetResponses.filter((entry) => entry.status >= 500);
  expect(serverErrors).toHaveLength(0);
});
