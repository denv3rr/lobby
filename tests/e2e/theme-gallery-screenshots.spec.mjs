import { expect, test } from "playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const PREFERRED_THEMES = ["lodge", "lobby", "winter", "neon"];
const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];

async function readWinterParticleCount(page) {
  return page.evaluate(async (hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api !== "object" || typeof api.getStats !== "function") {
        continue;
      }
      const stats = await api.getStats();
      const count = Number(stats?.themeParticles?.count || 0);
      return Number.isFinite(count) ? count : 0;
    }
    return 0;
  }, DEBUG_HOOK_NAMES);
}

test("captures themed screenshots and verifies texture/model requests stay healthy", async ({
  page
}) => {
  const captureDir = path.join(process.cwd(), "test-results", "design-captures");
  await mkdir(captureDir, { recursive: true });

  const assetResponses = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\/assets\/(?:images|textures|models)\//.test(url)) {
      assetResponses.push({
        url,
        status: response.status()
      });
    }
  });

  await page.goto("/?debugui=1&sceneui=1");

  const fallbackVisible = await page.evaluate(() => {
    const panel = document.querySelector("#fallback-panel");
    return Boolean(panel && !panel.classList.contains("hidden"));
  });
  test.skip(fallbackVisible, "WebGL fallback page is active, 3D screenshots are unavailable.");

  const themeSelect = page.locator("#theme-select");
  await expect(themeSelect).toBeVisible();
  await expect
    .poll(async () => themeSelect.locator("option").count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  const availableThemeIds = await themeSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  const selectedThemeIds = PREFERRED_THEMES.filter((id) => availableThemeIds.includes(id));
  if (!selectedThemeIds.length && availableThemeIds.length) {
    selectedThemeIds.push(availableThemeIds[0]);
  }

  const soundButton = page.locator("#enable-sound-btn");
  if (await soundButton.isVisible()) {
    await soundButton.click({ force: true });
  }

  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();

  for (const themeId of selectedThemeIds) {
    await themeSelect.selectOption(themeId);
    await expect(themeSelect).toHaveValue(themeId);
    await page.waitForTimeout(750);
    await canvas.screenshot({
      path: path.join(captureDir, `theme-${themeId}.png`)
    });

    if (themeId === "winter") {
      await expect
        .poll(() => readWinterParticleCount(page), { timeout: 10_000 })
        .toBeGreaterThan(0);
    }
  }

  await expect
    .poll(
      () =>
        assetResponses.some(
          (entry) => entry.url.includes("/assets/images/seperet_3d_model_2.gif") && entry.status < 400
        ),
      { timeout: 12_000 }
    )
    .toBeTruthy();

  const trackedAssets = assetResponses.filter((entry) =>
    /\/assets\/(?:images|textures|models)\//.test(entry.url)
  );
  expect(trackedAssets.length).toBeGreaterThan(0);

  const serverErrors = trackedAssets.filter((entry) => entry.status >= 500);
  expect(serverErrors).toHaveLength(0);
});
