import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];
const LOBBY_PATH = (process.env.PLAYWRIGHT_BASE_PATH || "/").replace(/\/?$/, "/");

test.setTimeout(120_000);

async function installPointerLockShim(page) {
  await page.addInitScript(() => {
    if (window.__pwPointerLockShimInstalled) {
      return;
    }
    window.__pwPointerLockShimInstalled = true;

    let lockTarget = null;
    const emitPointerLockChange = () => document.dispatchEvent(new Event("pointerlockchange"));

    try {
      Object.defineProperty(Document.prototype, "pointerLockElement", {
        configurable: true,
        get() {
          return lockTarget;
        }
      });
    } catch {
      // noop
    }

    const nativeRequest = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function requestPointerLock(...args) {
      try {
        nativeRequest?.apply(this, args);
      } catch {
        // noop
      }
      if (lockTarget !== this) {
        lockTarget = this;
        emitPointerLockChange();
      }
    };

    const nativeExit = Document.prototype.exitPointerLock;
    Document.prototype.exitPointerLock = function exitPointerLock(...args) {
      try {
        nativeExit?.apply(this, args);
      } catch {
        // noop
      }
      if (lockTarget) {
        lockTarget = null;
        emitPointerLockChange();
      }
    };
  });
}

async function stabilizeSpawnYawForPortalChecks(page) {
  const patchScene = async (route) => {
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }

    let sceneConfig = null;
    try {
      const contentType = response.headers()["content-type"] || "";
      if (contentType.toLowerCase().includes("application/json")) {
        sceneConfig = await response.json();
      } else {
        const payload = await response.text();
        sceneConfig = JSON.parse(payload);
      }
    } catch {
      await route.fulfill({ response });
      return;
    }

    if (!sceneConfig || typeof sceneConfig !== "object" || Array.isArray(sceneConfig)) {
      await route.fulfill({ response });
      return;
    }

    await route.fulfill({
      response,
      json: {
        ...sceneConfig,
        spawn: {
          ...(sceneConfig.spawn || {}),
          yaw: 180
        }
      }
    });
  };

  await page.route("**/config/scene.json*", patchScene);
  await page.route("**/config.defaults/scene.json*", patchScene);
}

async function readDebugStats(page) {
  return page.evaluate(async (hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api !== "object") {
        continue;
      }

      if (typeof api.getStats === "function") {
        const stats = await api.getStats();
        return { hookName, stats };
      }
    }
    return { hookName: null, stats: null };
  }, DEBUG_HOOK_NAMES);
}

async function readAnyPortalHit(page) {
  const { stats } = await readDebugStats(page);
  const hitId = stats?.anyPortalHit;
  return typeof hitId === "string" && hitId.trim() ? hitId.trim() : null;
}

async function readPortalIds(page) {
  return page.evaluate(async (hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api !== "object") {
        continue;
      }
      if (typeof api.getPortalIds === "function") {
        const ids = await api.getPortalIds();
        return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id.trim()) : [];
      }
    }
    return [];
  }, DEBUG_HOOK_NAMES);
}

async function debugActivatePortal(page, portalId) {
  return page.evaluate(async ({ hookNames, portalId: nextPortalId }) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api !== "object") {
        continue;
      }
      if (typeof api.activatePortal === "function") {
        const activated = await api.activatePortal(nextPortalId);
        return Boolean(activated);
      }
    }
    return false;
  }, { hookNames: DEBUG_HOOK_NAMES, portalId });
}

async function activatePortalThroughDebugApi(page) {
  const visiblePortalId = await readAnyPortalHit(page);
  const portalIds = await readPortalIds(page);
  const candidateIds = [
    visiblePortalId,
    ...portalIds,
    "contact",
    "shop",
    "youtube",
    "discord",
    "github"
  ].filter((portalId, index, source) => {
    const normalizedId = typeof portalId === "string" ? portalId.trim() : "";
    return normalizedId && source.indexOf(portalId) === index;
  });

  for (const portalId of candidateIds) {
    const activated = await debugActivatePortal(page, portalId);
    if (!activated) {
      continue;
    }
    await page.waitForTimeout(80);
    const openedCount = await page.evaluate(() => window.__pwOpenedUrls.length);
    if (openedCount > 0) {
      return true;
    }
  }

  return false;
}

async function clickCenterCanvas(page) {
  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  const neutralSpot =
    (await page.evaluate((hookNames) => {
      const samples = [
        { x: -0.72, y: 0.78 },
        { x: -0.52, y: 0.72 },
        { x: -0.32, y: 0.68 },
        { x: 0.32, y: 0.68 },
        { x: 0.52, y: 0.72 },
        { x: 0.72, y: 0.78 }
      ];
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.pickTargetAt !== "function") {
          continue;
        }
        for (const sample of samples) {
          if (!api.pickTargetAt(sample.x, sample.y)) {
            return sample;
          }
        }
      }
      return null;
    }, DEBUG_HOOK_NAMES)) || { x: 0, y: 0.82 };
  await canvas.click({
    position: {
      x: ((neutralSpot.x + 1) * 0.5) * bounds.width,
      y: ((1 - neutralSpot.y) * 0.5) * bounds.height
    }
  });
}

async function ensurePointerLock(page) {
  await expect
    .poll(async () => page.evaluate(() => Boolean(document.pointerLockElement)))
    .toBeTruthy();
}

async function primePortalView(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const visiblePortalId = await readAnyPortalHit(page);
    if (visiblePortalId) {
      return visiblePortalId;
    }

    const direction = attempt % 2 === 0 ? 1 : -1;
    const vertical = attempt % 3 === 0 ? -12 : attempt % 3 === 1 ? 12 : 0;
    await dispatchMouseLook(page, 110 * direction, vertical);
    await page.waitForTimeout(50);
  }

  return readAnyPortalHit(page);
}

async function activateAnyPortal(page) {
  await lockCanvas(page);
  await primePortalView(page);
  return activatePortalThroughDebugApi(page);
}

async function ensureCanvasReady(page) {
  const canvas = page.locator("#viewport canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

async function lockCanvas(page) {
  await page.evaluate(() => {
    document.querySelector("#viewport canvas")?.requestPointerLock?.();
  });
  await ensurePointerLock(page);
}

async function prepareCanvas(page) {
  await ensureCanvasReady(page);
  await lockCanvas(page);
}

async function waitForPortalOpen(page) {
  const openedUrl = await page.evaluate(() => window.__pwOpenedUrls[0] || "");
  return typeof openedUrl === "string" ? openedUrl : "";
}

async function activatePortalAndReadUrl(page) {
  const portalActivated = await activateAnyPortal(page);
  if (!portalActivated) {
    return {
      activated: false,
      openedUrl: ""
    };
  }

  return {
    activated: true,
    openedUrl: await waitForPortalOpen(page)
  };
}

async function readThemeExtraCount(page) {
  const { stats } = await readDebugStats(page);
  const count = stats?.props?.byTag?.["theme-extra"];
  return typeof count === "number" ? count : null;
}

async function readPlayerPosition(page) {
  const { stats } = await readDebugStats(page);
  const player = stats?.player;
  if (!player) {
    return null;
  }
  return {
    x: Number(player.x || 0),
    z: Number(player.z || 0)
  };
}

function planarDistance(from, to) {
  if (!from || !to) {
    return 0;
  }
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.hypot(dx, dz);
}

async function moveProbeDistance(page, minDistance = 0.05) {
  const start = await readPlayerPosition(page);
  if (!start) {
    return 0;
  }

  const sequence = [
    { key: "w", holdMs: 650, lookX: 140 },
    { key: "a", holdMs: 520, lookX: -120 },
    { key: "d", holdMs: 520, lookX: 100 },
    { key: "s", holdMs: 650, lookX: -140 }
  ];

  let bestDistance = 0;
  for (const step of sequence) {
    await page.keyboard.down(step.key);
    await page.waitForTimeout(step.holdMs);
    await page.keyboard.up(step.key);
    await page.waitForTimeout(140);

    const current = await readPlayerPosition(page);
    bestDistance = Math.max(bestDistance, planarDistance(start, current));
    if (bestDistance > minDistance) {
      return bestDistance;
    }

    await dispatchMouseLook(page, step.lookX, 0);
    await page.waitForTimeout(60);
  }

  return bestDistance;
}

async function waitForThemeExtraCount(page, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = await readThemeExtraCount(page);
    if (typeof count === "number") {
      return count;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Timed out waiting for theme-extra prop count from debug API.");
}

async function dispatchMouseLook(page, movementX, movementY = 0) {
  await page.evaluate(
    ({ x, y }) => {
      const event = new MouseEvent("mousemove", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "movementX", { value: x });
      Object.defineProperty(event, "movementY", { value: y });
      document.dispatchEvent(event);
    },
    { x: movementX, y: movementY }
  );
}

async function waitForDebugSceneReady(page, timeoutMs = 25_000) {
  await expect
    .poll(async () => Boolean((await readDebugStats(page)).stats?.player), {
      timeout: timeoutMs
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const { stats } = await readDebugStats(page);
      return Number(stats?.portalCount || 0);
    }, { timeout: timeoutMs })
    .toBeGreaterThan(0);
}

test("rapid theme switching leaves no stale props and controls/portals still respond", async ({
  page
}) => {
  await installPointerLockShim(page);
  await stabilizeSpawnYawForPortalChecks(page);
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1&perf=1`);

  const fallbackVisible = await page.evaluate(() => {
    const panel = document.querySelector("#fallback-panel");
    return Boolean(panel && !panel.classList.contains("hidden"));
  });
  test.skip(fallbackVisible, "WebGL fallback page is active, 3D interaction is unavailable.");

  const themeSelect = page.locator("#theme-select");
  await expect(themeSelect).toBeVisible();
  await expect
    .poll(async () => themeSelect.locator("option").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);
  await expect(page.locator("#status-text")).toContainText(/scene ready/i, {
    timeout: 30_000
  });

  await expect
    .poll(async () => (await readDebugStats(page)).hookName, { timeout: 30_000 })
    .not.toBeNull();
  await waitForDebugSceneReady(page, 30_000);

  const themeIds = await themeSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  const uniqueThemeIds = [...new Set(themeIds)];
  expect(uniqueThemeIds.length).toBeGreaterThanOrEqual(3);

  const preferredOrder = ["backrooms", "lobby", "winter", "roman"];
  const chosen = preferredOrder.filter((id) => uniqueThemeIds.includes(id)).slice(0, 3);
  const [themeA, themeB, themeC] =
    chosen.length >= 3 ? chosen : uniqueThemeIds.slice(0, 3);
  const finalTheme = themeC;

  await themeSelect.selectOption(finalTheme);
  await expect(themeSelect).toHaveValue(finalTheme);
  await page.waitForTimeout(450);

  const baselineThemeExtraCount = await waitForThemeExtraCount(page, 10_000);

  const themeSequence = [themeA, themeB, themeC, themeA, themeC, themeB, themeC];
  for (const themeId of themeSequence) {
    await themeSelect.selectOption(themeId);
  }

  await expect(themeSelect).toHaveValue(finalTheme);
  await page.waitForTimeout(700);
  await waitForDebugSceneReady(page, 20_000);

  const postBurstThemeExtraCount = await waitForThemeExtraCount(page, 10_000);
  expect(postBurstThemeExtraCount).toBe(baselineThemeExtraCount);

  const soundButton = page.locator("#enable-sound-btn");
  if (await soundButton.isVisible()) {
    await soundButton.click({ force: true });
  }
  await expect(page.locator("#sound-gate")).toHaveClass(/hidden/);

  await page.evaluate(() => {
    window.__pwOpenedUrls = [];
    window.open = (url) => {
      window.__pwOpenedUrls.push(String(url || ""));
      return { closed: false };
    };
  });

  await prepareCanvas(page);

  const { activated: portalActivated, openedUrl } = await activatePortalAndReadUrl(page);
  expect(portalActivated).toBeTruthy();
  expect(openedUrl).toMatch(/^https?:\/\//);

  const movedDistance = await moveProbeDistance(page);
  expect(movedDistance).toBeGreaterThan(0.05);
});
