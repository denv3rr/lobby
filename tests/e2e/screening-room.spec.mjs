import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];
const LOBBY_PATH = (process.env.PLAYWRIGHT_BASE_PATH || "/").replace(/\/?$/, "/");

async function waitForDebugApi(page) {
  await expect
    .poll(
      () =>
        page.evaluate((hookNames) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (api && typeof api.playScreeningItem === "function") {
              return true;
            }
          }
          return false;
        }, DEBUG_HOOK_NAMES),
      { timeout: 30_000 }
    )
    .toBeTruthy();
}

async function playFirstScreeningItem(page) {
  return page.evaluate(async (hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.playScreeningItem !== "function") {
        continue;
      }
      return Boolean(await api.playScreeningItem("videos"));
    }
    return false;
  }, DEBUG_HOOK_NAMES);
}

async function readScreeningState(page) {
  return page.evaluate((hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.getScreeningState !== "function") {
        continue;
      }
      return api.getScreeningState();
    }
    return null;
  }, DEBUG_HOOK_NAMES);
}

async function teleportDebug(page, position, yaw = null, pitch = null) {
  return page.evaluate(
    ([hookNames, nextPosition, nextYaw, nextPitch]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.teleport !== "function") {
          continue;
        }
        return Boolean(api.teleport(nextPosition, nextYaw, nextPitch));
      }
      return false;
    },
    [DEBUG_HOOK_NAMES, position, yaw, pitch]
  );
}

async function focusRoomWall(page, roomId, wall = "front", distance = 4.2) {
  return page.evaluate(
    ([hookNames, nextRoomId, nextWall, nextDistance]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.focusCatalogRoomWall !== "function") {
          continue;
        }
        return Boolean(api.focusCatalogRoomWall(nextRoomId, nextWall, nextDistance));
      }
      return false;
    },
    [DEBUG_HOOK_NAMES, roomId, wall, distance]
  );
}

test("screening room can load a selected video onto the in-scene wall", async ({ page }) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);

  const fallbackVisible = await page.evaluate(() => {
    const panel = document.querySelector("#fallback-panel");
    return Boolean(panel && !panel.classList.contains("hidden"));
  });
  test.skip(fallbackVisible, "WebGL fallback page is active, 3D interaction is unavailable.");

  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();

  const qualitySelect = page.locator("#quality-select");
  if (await qualitySelect.isVisible()) {
    await qualitySelect.selectOption("low");
    await expect(qualitySelect).toHaveValue("low");
  }

  await waitForDebugApi(page);
  await expect.poll(() => focusRoomWall(page, "videos", "back", 4.2), { timeout: 25_000 }).toBeTruthy();

  const archiveButtons = page.locator(".screening-playlist:not(.hidden) .screening-playlist-item");
  await expect
    .poll(async () => archiveButtons.count(), { timeout: 25_000 })
    .toBeGreaterThan(0);

  const archiveItemId = await archiveButtons.first().getAttribute("data-item-id");
  expect(archiveItemId).toBeTruthy();
  await archiveButtons.first().click();
  await expect
    .poll(async () => {
      const state = await readScreeningState(page);
      return state?.itemId || "";
    }, { timeout: 25_000 })
    .toBe(String(archiveItemId));

  await expect.poll(() => focusRoomWall(page, "videos", "front", 4.2), { timeout: 25_000 }).toBeTruthy();
  await expect.poll(() => playFirstScreeningItem(page), { timeout: 25_000 }).toBeTruthy();

  await expect
    .poll(async () => {
      const state = await readScreeningState(page);
      return state?.embedUrl || "";
    }, { timeout: 25_000 })
    .toContain("youtube-nocookie.com/embed/");

  const iframe = page.locator(".screening-wall-player:not(.hidden) iframe");
  await expect(iframe).toHaveAttribute("src", /youtube-nocookie\.com\/embed\//);
});
