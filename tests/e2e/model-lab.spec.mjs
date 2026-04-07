import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];
const LOBBY_PATH = (process.env.PLAYWRIGHT_BASE_PATH || "/").replace(/\/?$/, "/");

async function getDebugStats(page) {
  return page.evaluate((hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.getStats !== "function") {
        continue;
      }
      return api.getStats();
    }
    return null;
  }, DEBUG_HOOK_NAMES);
}

async function getModelLabState(page) {
  return page.evaluate((hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.getDevModelShowroomState !== "function") {
        continue;
      }
      return api.getDevModelShowroomState();
    }
    return null;
  }, DEBUG_HOOK_NAMES);
}

test("modellab boots an isolated preview scene without lobby portals or panels", async ({
  page
}) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1&modellab=1`);

  await expect
    .poll(async () => {
      const state = await getModelLabState(page);
      return Boolean(state?.modelShowroomIsolated && state?.modelShowroomActive);
    }, { timeout: 60_000 })
    .toBe(true);

  await expect(page.locator("#dev-model-showroom-note")).toContainText(
    "Isolated model lab loaded",
    { timeout: 20_000 }
  );

  const stats = await getDebugStats(page);
  expect(stats).toBeTruthy();
  expect(stats.portalCount).toBe(0);
  expect(stats.scenePanels?.panelCount ?? 0).toBe(0);
  expect(Number(stats.props?.byTag?.["dev-model-showroom"] || 0)).toBeGreaterThan(0);
  expect(Number(stats.props?.byTag?.base || 0)).toBe(0);
});
