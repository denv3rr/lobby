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
const OUTDOOR_FRONTIER_HORSE_PROP_ID = "outdoor_frontier_horse";
const OUTDOOR_FRONTIER_HALO_PROP_ID = "outdoor_frontier_halo";
const OUTDOOR_FRONTIER_RIFLE_PROP_ID = "outdoor_frontier_rifle";
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

async function setGeneratedShellVisibleDebug(page, shellNodeId, visible) {
  return page.evaluate(
    ([hookNames, requestedShellNodeId, nextVisible]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.setGeneratedShellVisible !== "function") {
          continue;
        }
        return Boolean(api.setGeneratedShellVisible(requestedShellNodeId, nextVisible));
      }
      return false;
    },
    [DEBUG_HOOK_NAMES, shellNodeId, visible]
  );
}

async function setThemeDebug(page, themeName) {
  return page.evaluate(
    async ([hookNames, requestedThemeName]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.setTheme !== "function") {
          continue;
        }
        await api.setTheme(requestedThemeName);
        return true;
      }
      return false;
    },
    [DEBUG_HOOK_NAMES, themeName]
  );
}

async function getGeneratedShellEntry(page, shellNodeId) {
  return page.evaluate(
    ([hookNames, requestedShellNodeId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.getGeneratedShellEntries !== "function") {
          continue;
        }
        const entries = api.getGeneratedShellEntries("videos");
        return Array.isArray(entries)
          ? entries.find((entry) => entry?.id === requestedShellNodeId) || null
          : null;
      }
      return null;
    },
    [DEBUG_HOOK_NAMES, shellNodeId]
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

async function readDefaultVideosPayload() {
  const sourcePath = new URL("../../public/config.defaults/videos-feed.json", import.meta.url);
  const raw = await readFile(sourcePath, "utf8");
  return JSON.parse(raw);
}

async function readDefaultCatalogPayload() {
  const sourcePath = new URL("../../public/config.defaults/catalog.json", import.meta.url);
  const raw = await readFile(sourcePath, "utf8");
  return JSON.parse(raw);
}

async function createExpandedVideosPayload() {
  const payload = await readDefaultVideosPayload();
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

async function createMultiRoomVideosPayload() {
  const payload = await readDefaultVideosPayload();
  const baseItems = Array.isArray(payload.items) ? payload.items : [];
  const expandedItems = [];
  for (let index = 0; index < 42; index += 1) {
    const template = baseItems[index % Math.max(1, baseItems.length)] || {};
    expandedItems.push({
      ...template,
      id: `${template.id || `video-${index + 1}`}-multi-${index + 1}`,
      title: `${template.title || `Video ${index + 1}`} Multi ${index + 1}`
    });
  }
  payload.items = expandedItems;
  if (payload.meta && typeof payload.meta === "object") {
    payload.meta = {
      ...payload.meta,
      count: payload.items.length
    };
  }
  return payload;
}

async function createMultiRoomCatalogPayload() {
  const payload = await readDefaultCatalogPayload();
  payload.rooms = payload.rooms || {};
  payload.rooms.videos = payload.rooms.videos || {};
  payload.rooms.videos.layout = {
    ...(payload.rooms.videos.layout || {}),
    maxItems: 42
  };
  return payload;
}

async function createLimitedVideosPayload(limit = 2) {
  const payload = await readDefaultVideosPayload();
  payload.items = (Array.isArray(payload.items) ? payload.items : []).slice(0, limit);
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

  const insideAim = await aimCameraAtPanel(page, SOUTH_PADRE_BROWSER_PANEL_ID, [-19.3, 1.7, -6.5]);
  expect(insideAim?.lookDot ?? -1).toBeGreaterThan(0.2);
  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.visible ?? null, {
      timeout: 25_000
    })
    .toBe(true);

  const initialPreview = await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID);
  expect(initialPreview?.selectedIndex).toBe(0);
  expect(initialPreview?.previewSrc || "").toContain("Arma Reforger-2026_02_27-08-22-58.png");

  await page
    .locator(`[data-panel-id="${SOUTH_PADRE_BROWSER_PANEL_ID}"] .scene-panel-gallery-button`)
    .nth(3)
    .click();

  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.selectedIndex ?? null, {
      timeout: 25_000
    })
    .toBe(3);

  const previewAim = await aimCameraAtPanel(page, SOUTH_PADRE_PREVIEW_PANEL_ID, [-19.3, 1.7, -6.5]);
  expect(previewAim?.lookDot ?? -1).toBeGreaterThan(0.2);
  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.visible ?? null, {
      timeout: 25_000
    })
    .toBe(true);
  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.selectedIndex ?? null, {
      timeout: 25_000
    })
    .toBe(3);
  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.previewCaption ?? null, {
      timeout: 25_000
    })
    .toBe("4 / 21");
  await expect
    .poll(async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.previewSrc ?? "", {
      timeout: 25_000
    })
    .toContain("Arma Reforger-2026_02_27-05-14-47.png");

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

test("outdoor courtyard centers the horse and rifle without blocking the main path", async ({
  page
}) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getPropState");
  await waitForDebugApi(page, "probeColliders");

  await expect.poll(() => teleportDebug(page, [0, 1.7, 35.4], 180, 0), {
    timeout: 25_000
  }).toBe(true);

  const [horseState, haloState, rifleState] = await Promise.all([
    getPropState(page, OUTDOOR_FRONTIER_HORSE_PROP_ID),
    getPropState(page, OUTDOOR_FRONTIER_HALO_PROP_ID),
    getPropState(page, OUTDOOR_FRONTIER_RIFLE_PROP_ID)
  ]);
  const removedStreetCache = await getPropState(page, "outdoor_street_cache_holo");
  const removedFrontierPlinth = await getPropState(page, "outdoor_frontier_plinth");
  const removedFrontierBaseRing = await getPropState(page, "outdoor_frontier_base_ring");

  expect(horseState).toBeTruthy();
  expect(haloState).toBeTruthy();
  expect(rifleState).toBeTruthy();
  expect(removedStreetCache).toBe(null);
  expect(removedFrontierPlinth).toBe(null);
  expect(removedFrontierBaseRing).toBe(null);
  expect(Math.abs(horseState.worldPosition[0])).toBeLessThan(0.4);
  expect(horseState.worldPosition[1]).toBeLessThan(0.2);
  expect(Math.abs(rifleState.worldPosition[0])).toBeLessThan(0.4);
  expect(haloState.worldPosition[1]).toBeGreaterThan(horseState.worldPosition[1] + 3.5);
  expect(rifleState.worldPosition[2]).toBeLessThan(horseState.worldPosition[2] - 1);

  for (const position of [
    [0, 1.7, 30.2],
    [0, 1.7, 35.4],
    [0, 1.7, 40.2]
  ]) {
    await expect
      .poll(async () => (await probeColliders(page, position, 0.34))?.blockerCount ?? -1, {
        timeout: 25_000
      })
      .toBe(0);
  }
});

test("screening hall keeps overflow in a single widened room instead of cloning south", async ({
  page
}) => {
  const overflowPayload = await createExpandedVideosPayload();
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
    .toBe(1);

  await expect
    .poll(async () => {
      const snapshot = await getCatalogRoomSnapshot(page, "videos");
      return (snapshot?.cardCounts || []).length;
    }, { timeout: 25_000 })
    .toBe(1);
  await expect
    .poll(async () => {
      const counts = (await getCatalogRoomSnapshot(page, "videos"))?.cardCounts || [];
      return counts.reduce((sum, count) => sum + count, 0);
    }, { timeout: 25_000 })
    .toBe(18);
  await expect
    .poll(async () => {
      const counts = (await getCatalogRoomSnapshot(page, "videos"))?.cardCounts || [];
      return counts.length ? Math.min(...counts) : 0;
    }, { timeout: 25_000 })
    .toBeGreaterThanOrEqual(5);
  await expect
    .poll(async () => (await getCatalogRoomSnapshot(page, "videos"))?.latestItemId ?? null, {
      timeout: 25_000
    })
    .toBe(overflowPayload.items?.[0]?.id || null);

  for (const position of [
    [19.3, 1.7, -5.1],
    [27.4, 1.7, -5.1],
    [31.2, 1.7, -5.1],
    [19.3, 1.7, -14.7]
  ]) {
    await expect
      .poll(async () => (await probeColliders(page, position, 0.34))?.blockerCount ?? -1, {
        timeout: 25_000
      })
      .toBe(0);
  }
});

test("hidden screening shell walls stay collider-disabled after a catalog rebuild", async ({ page }) => {
  const videosPayload = await createMultiRoomVideosPayload();
  const catalogPayload = await createMultiRoomCatalogPayload();
  await page.route(/\/(?:config|config\.defaults)\/videos-feed\.json(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(videosPayload)
    });
  });
  await page.route(/\/(?:config|config\.defaults)\/catalog\.json(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(catalogPayload)
    });
  });

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1&editor=1`);
  await waitForDebugApi(page, "getCatalogRoomSnapshot");
  await waitForDebugApi(page, "getGeneratedShellEntries");
  await waitForDebugApi(page, "setGeneratedShellVisible");
  await waitForDebugApi(page, "setTheme");

  await expect
    .poll(async () => (await getCatalogRoomSnapshot(page, "videos"))?.nodeCount ?? 0, {
      timeout: 25_000
    })
    .toBeGreaterThanOrEqual(2);

  const shellNodeId = "catalog:videos:0:back-wall-right";
  await expect.poll(() => setGeneratedShellVisibleDebug(page, shellNodeId, false), {
    timeout: 25_000
  }).toBe(true);

  await expect
    .poll(async () => (await getGeneratedShellEntry(page, shellNodeId))?.enabledColliderCount ?? -1, {
      timeout: 25_000
    })
    .toBe(0);
  await expect
    .poll(async () => (await getGeneratedShellEntry(page, shellNodeId))?.visible ?? true, {
      timeout: 25_000
    })
    .toBe(false);

  await expect.poll(() => setThemeDebug(page, "backrooms"), { timeout: 25_000 }).toBe(true);
  await expect.poll(() => setThemeDebug(page, "lobby"), { timeout: 25_000 }).toBe(true);

  await expect
    .poll(async () => (await getGeneratedShellEntry(page, shellNodeId))?.enabledColliderCount ?? -1, {
      timeout: 25_000
    })
    .toBe(0);
  await expect
    .poll(async () => (await getGeneratedShellEntry(page, shellNodeId))?.visible ?? true, {
      timeout: 25_000
    })
    .toBe(false);
});

test("screening hall prefers the fresher default video feed over a stale local override", async ({
  page
}) => {
  const staleLocalPayload = await createLimitedVideosPayload(2);
  staleLocalPayload.meta = {
    ...(staleLocalPayload.meta || {}),
    fetchedAt: "2026-03-08T00:00:00.000Z",
    count: staleLocalPayload.items.length
  };

  const freshDefaultsPayload = await createExpandedVideosPayload();
  freshDefaultsPayload.meta = {
    ...(freshDefaultsPayload.meta || {}),
    fetchedAt: "2026-03-10T12:00:00.000Z",
    count: freshDefaultsPayload.items.length
  };

  const requests = [];
  await page.route(/\/config\/videos-feed\.json(?:\?|$)/, async (route) => {
    requests.push("local");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(staleLocalPayload)
    });
  });
  await page.route(/\/config\.defaults\/videos-feed\.json(?:\?|$)/, async (route) => {
    requests.push("defaults");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(freshDefaultsPayload)
    });
  });

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await waitForDebugApi(page, "getCatalogRoomSnapshot");

  await expect
    .poll(() => Array.from(new Set(requests)).sort().join(","), { timeout: 25_000 })
    .toBe("defaults,local");
  await expect
    .poll(async () => {
      const snapshot = await getCatalogRoomSnapshot(page, "videos");
      return snapshot?.nodeCount || 0;
    }, { timeout: 25_000 })
    .toBe(1);
  await expect
    .poll(async () => {
      const snapshot = await getCatalogRoomSnapshot(page, "videos");
      return (snapshot?.cardCounts || []).length;
    }, { timeout: 25_000 })
    .toBe(1);
  await expect
    .poll(async () => {
      const counts = (await getCatalogRoomSnapshot(page, "videos"))?.cardCounts || [];
      return counts.reduce((sum, count) => sum + count, 0);
    }, { timeout: 25_000 })
    .toBe(18);
  await expect
    .poll(async () => {
      const counts = (await getCatalogRoomSnapshot(page, "videos"))?.cardCounts || [];
      return counts.length ? Math.min(...counts) : 0;
    }, { timeout: 25_000 })
    .toBeGreaterThanOrEqual(5);
  await expect
    .poll(async () => (await getCatalogRoomSnapshot(page, "videos"))?.latestItemIds?.length ?? 0, {
      timeout: 25_000
    })
    .toBe(1);
  await expect
    .poll(async () => (await getCatalogRoomSnapshot(page, "videos"))?.latestItemId ?? null, {
      timeout: 25_000
    })
    .toBe(freshDefaultsPayload.items?.[0]?.id || null);
});
