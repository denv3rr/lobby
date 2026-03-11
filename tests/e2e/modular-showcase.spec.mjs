import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];
const LOBBY_PATH = (process.env.PLAYWRIGHT_BASE_PATH || "/").replace(/\/?$/, "/");
const SOUTH_PADRE_BROWSER_PANEL_ID = "east_media_frame_north";
const SOUTH_PADRE_PREVIEW_PANEL_ID = "east_media_frame";
const SOUTH_PADRE_PORTAL_ID = "south_padre_workshop";
const SOUTH_PADRE_RIFLE_PROP_ID = "east_media_project_rifle";
const SOUTH_PADRE_RING_PROP_ID = "east_media_project_ring";
const SOUTH_PADRE_COLUMN_PROP_ID = "east_media_project_column";
const REMOVED_REAR_PROP_IDS = [
  "rear_hall_runner",
  "rear_hall_directory",
  "rear_hall_light_left",
  "rear_hall_light_right",
  "rear_hall_light_north"
];
const REMOVED_REAR_PANEL_IDS = ["west_gallery_showcase_wall_screen", "north_chamber_banner"];

async function waitForDebugApi(page, methodName) {
  await expect
    .poll(
      () =>
        page.evaluate(([hookNames, requestedMethodName]) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (api && typeof api[requestedMethodName] === "function") {
              return true;
            }
          }
          return false;
        }, [DEBUG_HOOK_NAMES, methodName]),
      { timeout: 30_000 }
    )
    .toBeTruthy();
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

async function activatePortalDebug(page, portalId) {
  return page.evaluate(
    ([hookNames, requestedPortalId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.activatePortal !== "function") {
          continue;
        }
        return Boolean(api.activatePortal(requestedPortalId));
      }
      return false;
    },
    [DEBUG_HOOK_NAMES, portalId]
  );
}

async function getCatalogRoomSnapshot(page, roomId) {
  return page.evaluate(
    ([hookNames, requestedRoomId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.getCatalogRoomSnapshot !== "function") {
          continue;
        }
        return api.getCatalogRoomSnapshot(requestedRoomId);
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, roomId]
  );
}

async function getPropState(page, propId) {
  return page.evaluate(
    ([hookNames, requestedPropId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.getPropState !== "function") {
          continue;
        }
        return api.getPropState(requestedPropId);
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, propId]
  );
}

async function getScenePanelSnapshot(page, panelId) {
  return page.evaluate(
    ([hookNames, requestedPanelId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.getScenePanels !== "function") {
          continue;
        }
        const panels = api.getScenePanels();
        return Array.isArray(panels)
          ? panels.find((entry) => entry?.id === requestedPanelId) || null
          : null;
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, panelId]
  );
}

async function debugProjectScenePanel(page, panelId) {
  return page.evaluate(
    ([hookNames, requestedPanelId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.debugProjectScenePanel !== "function") {
          continue;
        }
        return api.debugProjectScenePanel(requestedPanelId);
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, panelId]
  );
}

async function activateCenterArtifactDebug(page) {
  return page.evaluate((hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.activateCenterArtifact !== "function") {
        continue;
      }
      return Boolean(api.activateCenterArtifact());
    }
    return false;
  }, DEBUG_HOOK_NAMES);
}

async function probeColliders(page, position, radius = 0.38) {
  return page.evaluate(
    ([hookNames, nextPosition, nextRadius]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.probeColliders !== "function") {
          continue;
        }
        return api.probeColliders(nextPosition, nextRadius);
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, position, radius]
  );
}

async function aimCameraAtPanel(page, panelId, position, pitch = 0) {
  const yawCandidates = [0, 45, 90, 135, 180, 225, 270, 315];
  let best = null;

  for (const yaw of yawCandidates) {
    await teleportDebug(page, position, yaw, pitch);
    const snapshot = await debugProjectScenePanel(page, panelId);
    const lookDot = Number.isFinite(snapshot?.lookDot) ? snapshot.lookDot : -2;
    if (!best || lookDot > best.lookDot) {
      best = { yaw, lookDot, snapshot };
    }
  }

  if (best) {
    await teleportDebug(page, position, best.yaw, pitch);
  }
  return best;
}

function quaternionDeltaRadians(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length < 4 || right.length < 4) {
    return 0;
  }
  const dot = Math.abs(
    left[0] * right[0] +
      left[1] * right[1] +
      left[2] * right[2] +
      left[3] * right[3]
  );
  const clampedDot = Math.min(1, Math.max(-1, dot));
  return 2 * Math.acos(clampedDot);
}

async function createOverflowVideosPayload() {
  const sourcePath = new URL("../../public/config.defaults/videos-feed.json", import.meta.url);
  const raw = await readFile(sourcePath, "utf8");
  const payload = JSON.parse(raw);
  const baseItems = Array.isArray(payload.items) ? payload.items : [];
  const clonedItems = baseItems.map((item, index) => ({
    ...item,
    id: `${item.id || `video-${index + 1}`}-overflow-${index + 1}`,
    title: `${item.title || `Video ${index + 1}`} Overflow ${index + 1}`
  }));
  payload.items = [...baseItems, ...clonedItems.slice(0, 4)];
  if (payload.meta && typeof payload.meta === "object") {
    payload.meta = {
      ...payload.meta,
      count: payload.items.length
    };
  }
  return payload;
}

test("south padre room is a static lobby annex with linked gallery screens and a new-tab portal", async ({
  page
}) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getScenePanelIds");

  await expect
    .poll(
      () =>
        page.evaluate(([hookNames, panelIds]) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (!api || typeof api.getScenePanelIds !== "function") {
              continue;
            }
            const availablePanelIds = api.getScenePanelIds();
            return panelIds.every((panelId) => availablePanelIds.includes(panelId));
          }
          return false;
        }, [DEBUG_HOOK_NAMES, [SOUTH_PADRE_BROWSER_PANEL_ID, SOUTH_PADRE_PREVIEW_PANEL_ID]]),
      { timeout: 25_000 }
    )
    .toBe(true);

  await expect.poll(() => teleportDebug(page, [-19.3, 1.7, -5.1], 0, 0), {
    timeout: 25_000
  }).toBe(true);

  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.type ?? null,
      { timeout: 25_000 }
    )
    .toBe("gallery-thumbnails");
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.type ?? null,
      { timeout: 25_000 }
    )
    .toBe("gallery-preview");
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.imageCount ?? null,
      { timeout: 25_000 }
    )
    .toBe(21);
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.imageCount ?? null,
      { timeout: 25_000 }
    )
    .toBe(21);

  const originalUrl = page.url();
  await page.evaluate(() => {
    const opened = [];
    window.open = (url = "", target = "", features = "") => {
      opened.push({ url, target, features });
      return {
        closed: false,
        focus() {},
        location: { href: url }
      };
    };
    window.__openedWindows = opened;
  });

  await expect.poll(() => activatePortalDebug(page, SOUTH_PADRE_PORTAL_ID), {
    timeout: 25_000
  }).toBe(true);
  await expect
    .poll(async () => await page.evaluate(() => window.__openedWindows?.length || 0), {
      timeout: 25_000
    })
    .toBe(1);

  const openCall = await page.evaluate(() => window.__openedWindows?.[0] || null);
  expect(openCall).toBeTruthy();
  expect(openCall.url).toContain("workshop?search=south+padre+island");
  expect(openCall.target).toBe("_blank");
  await expect(page).toHaveURL(originalUrl);
});

test("south padre rifle stays centered, rotates in place, and links to center-artifact emissive pulse", async ({
  page
}) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getPropState");
  await waitForDebugApi(page, "activateCenterArtifact");

  await expect.poll(() => teleportDebug(page, [-19.3, 1.7, -5.1], 0, 0), {
    timeout: 25_000
  }).toBe(true);

  let aimYaw = 0;
  for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
    await teleportDebug(page, [-19.3, 1.7, -5.1], yaw, 0);
    const state = await getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID);
    if (state?.visible !== false && state?.cullVisible !== false) {
      aimYaw = yaw;
      break;
    }
  }
  await expect.poll(() => teleportDebug(page, [-19.3, 1.7, -5.1], aimYaw, 0), {
    timeout: 25_000
  }).toBe(true);

  await expect.poll(async () => Boolean(await getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID)), {
    timeout: 25_000
  }).toBe(true);
  await expect
    .poll(async () => (await getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID))?.visible ?? false, {
      timeout: 25_000
    })
    .toBe(true);

  const [columnState, ringState, rifleBefore] = await Promise.all([
    getPropState(page, SOUTH_PADRE_COLUMN_PROP_ID),
    getPropState(page, SOUTH_PADRE_RING_PROP_ID),
    getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID)
  ]);

  expect(columnState).toBeTruthy();
  expect(ringState).toBeTruthy();
  expect(rifleBefore).toBeTruthy();

  const rifleCenterOffset = Math.hypot(
    rifleBefore.worldPosition[0] - columnState.worldPosition[0],
    rifleBefore.worldPosition[2] - columnState.worldPosition[2]
  );
  expect(rifleCenterOffset).toBeLessThan(0.08);
  expect(ringState.worldPosition[1]).toBeGreaterThan(rifleBefore.worldPosition[1] + 0.55);

  const [rifleWidth, rifleHeight, rifleDepth] = rifleBefore.worldBoundsSize || [0, 0, 0];
  expect(Math.max(rifleWidth, rifleDepth)).toBeGreaterThan(0.08);
  expect(rifleHeight).toBeLessThan(Math.max(rifleWidth, rifleDepth) * 0.72);

  let rifleAfter = null;
  await expect
    .poll(async () => {
      rifleAfter = await getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID);
      return quaternionDeltaRadians(rifleBefore.worldQuaternion, rifleAfter?.worldQuaternion);
    }, { timeout: 25_000 })
    .toBeGreaterThan(0.01);
  expect(rifleAfter).toBeTruthy();

  const pivotDrift = Math.hypot(
    rifleAfter.worldPosition[0] - rifleBefore.worldPosition[0],
    rifleAfter.worldPosition[2] - rifleBefore.worldPosition[2]
  );
  expect(pivotDrift).toBeLessThan(0.03);
  expect(quaternionDeltaRadians(rifleBefore.worldQuaternion, rifleAfter.worldQuaternion)).toBeGreaterThan(0.01);

  const baseMaxEmissive = rifleBefore.emissiveStats?.maxIntensity ?? 0;
  expect(rifleBefore.emissiveStats?.materialCount ?? 0).toBeGreaterThan(0);
  await expect.poll(() => activateCenterArtifactDebug(page), { timeout: 25_000 }).toBe(true);
  await expect
    .poll(
      async () => (await getPropState(page, SOUTH_PADRE_RIFLE_PROP_ID))?.emissiveStats?.maxIntensity ?? 0,
      { timeout: 25_000 }
    )
    .toBeGreaterThan(Math.max(1, baseMaxEmissive + 0.2));
});

test("south padre gallery panels stay hidden behind neighboring room walls and appear inside SPI", async ({
  page
}) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "debugProjectScenePanel");

  const outsideRoomPosition = [-19.3, 1.7, 5.1];
  const insideSpiPosition = [-19.3, 1.7, -6.5];
  for (const panelId of [SOUTH_PADRE_BROWSER_PANEL_ID, SOUTH_PADRE_PREVIEW_PANEL_ID]) {
    const outsideAim = await aimCameraAtPanel(page, panelId, outsideRoomPosition);
    expect(outsideAim?.lookDot ?? -1).toBeGreaterThan(0.2);
    await expect
      .poll(async () => (await debugProjectScenePanel(page, panelId))?.reason ?? null, {
        timeout: 25_000
      })
      .toMatch(/^occluded-(center|corner-\d)$/);
    await expect
      .poll(async () => (await getScenePanelSnapshot(page, panelId))?.visible ?? null, {
        timeout: 25_000
      })
      .toBe(false);

    const insideAim = await aimCameraAtPanel(page, panelId, insideSpiPosition);
    expect(insideAim?.lookDot ?? -1).toBeGreaterThan(0.2);
    await expect
      .poll(async () => (await getScenePanelSnapshot(page, panelId))?.visible ?? null, {
        timeout: 25_000
      })
      .toBe(true);
  }
});

test("back hallway is left empty for now", async ({ page }) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getScenePanels");

  await expect.poll(() => teleportDebug(page, [0, 1.7, -25.6], 0, 0), {
    timeout: 25_000
  }).toBe(true);

  for (const propId of REMOVED_REAR_PROP_IDS) {
    await expect
      .poll(async () => await getPropState(page, propId), {
        timeout: 25_000
      })
      .toBe(null);
  }

  for (const panelId of REMOVED_REAR_PANEL_IDS) {
    await expect
      .poll(async () => await getScenePanelSnapshot(page, panelId), {
        timeout: 25_000
      })
      .toBe(null);
  }
});

test("screening overflow rebalances cards instead of leaving a nearly empty second room", async ({
  page
}) => {
  const overflowPayload = await createOverflowVideosPayload();
  await page.route(/\/(?:config|config\.defaults)\/videos-feed\.json(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(overflowPayload)
    });
  });

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getCatalogRoomSnapshot");
  await waitForDebugApi(page, "probeColliders");

  await expect
    .poll(async () => {
      const snapshot = await getCatalogRoomSnapshot(page, "videos");
      return snapshot?.nodeCount || 0;
    }, { timeout: 25_000 })
    .toBe(2);

  await expect
    .poll(async () => {
      const snapshot = await getCatalogRoomSnapshot(page, "videos");
      return snapshot?.cardCounts || [];
    }, { timeout: 25_000 })
    .toEqual([5, 5]);

  for (const position of [
    [19.3, 1.7, -5.1],
    [19.3, 1.7, -9.9],
    [19.3, 1.7, -14.7]
  ]) {
    await expect
      .poll(async () => (await probeColliders(page, position, 0.34))?.blockerCount ?? -1, {
        timeout: 25_000
      })
      .toBe(0);
  }
});
