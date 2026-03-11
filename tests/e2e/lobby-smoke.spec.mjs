import { expect, test } from "@playwright/test";

const DEBUG_HOOK_NAMES = [
  "__LOBBY_DEBUG",
  "__LOBBY_DEBUG__",
  "__lobbyDebug",
  "lobbyDebug",
  "__SEPERET_LOBBY_DEBUG__"
];
const LOBBY_PATH = (process.env.PLAYWRIGHT_BASE_PATH || "/").replace(/\/?$/, "/");
const CENTER_ARTIFACT_TARGET_ID = "prop:center_hover_gif";
const SOUTH_PADRE_BROWSER_PANEL_ID = "east_media_frame_north";
const SOUTH_PADRE_PREVIEW_PANEL_ID = "east_media_frame";

async function projectTarget(page, targetId) {
  return page.evaluate(
    ([hookNames, requestedTargetId]) => {
      for (const hookName of hookNames) {
        const api = window[hookName];
        if (!api || typeof api.projectInteractionTarget !== "function") {
          continue;
        }
        const projection = api.projectInteractionTarget(requestedTargetId);
        if (projection) {
          return projection;
        }
      }

      return null;
    },
    [DEBUG_HOOK_NAMES, targetId]
  );
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

async function getEditorSnapshot(page) {
  return page.evaluate((hookNames) => {
    for (const hookName of hookNames) {
      const api = window[hookName];
      if (!api || typeof api.getEditorSnapshot !== "function") {
        continue;
      }
      return api.getEditorSnapshot();
    }
    return null;
  }, DEBUG_HOOK_NAMES);
}

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

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);

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

  await expect(page.locator("#dev-config-file")).toBeVisible();
  await expect(page.locator("#dev-config-editor")).toBeVisible();

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

  await expect
    .poll(
      () =>
        page.evaluate((hookNames) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (!api || typeof api.getCatalogRoomIds !== "function") {
              continue;
            }
            return api.getCatalogRoomIds().includes("atelier");
          }
          return false;
        }, DEBUG_HOOK_NAMES),
      { timeout: 25_000 }
    )
    .toBe(false);

  await expect
    .poll(
      () =>
        page.evaluate((hookNames) => {
          for (const hookName of hookNames) {
            const api = window[hookName];
            if (!api || typeof api.estimateCatalogRoomCount !== "function") {
              continue;
            }
            return api.estimateCatalogRoomCount("videos", 8);
          }
          return null;
        }, DEBUG_HOOK_NAMES),
      { timeout: 25_000 }
    )
    .toBe(1);

  const objectivesPanel = page.locator("#objectives-panel");
  await expect(objectivesPanel).toBeHidden();
  await expect
    .poll(async () => page.locator("#objectives-list .objectives-item").count(), {
      timeout: 25_000
    })
    .toBe(1);

  await expect
    .poll(() => teleportDebug(page, [0, 1.7, 4.8], 0, 0), {
      timeout: 25_000
    })
    .toBe(true);
  await expect
    .poll(() => projectTarget(page, CENTER_ARTIFACT_TARGET_ID), {
      timeout: 25_000
    })
    .toBeTruthy();
  await expect
    .poll(async () => {
      const projection = await projectTarget(page, CENTER_ARTIFACT_TARGET_ID);
      return Boolean(projection?.withinViewport);
    }, {
      timeout: 25_000
    })
    .toBe(true);
  const artifactProjection = await projectTarget(page, CENTER_ARTIFACT_TARGET_ID);
  expect(artifactProjection).toBeTruthy();
  expect(artifactProjection.withinViewport).toBe(true);
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).toBeTruthy();
  await canvas.click({
    position: {
      x: ((artifactProjection.ndc.x + 1) * 0.5) * canvasBox.width,
      y: ((1 - artifactProjection.ndc.y) * 0.5) * canvasBox.height
    }
  });
  await expect
    .poll(async () => page.locator("#objectives-list .objectives-item.is-complete").count(), {
      timeout: 25_000
    })
    .toBe(1);

  await expect.poll(() => teleportDebug(page, [-19.3, 1.7, -5.1], 0, 0), {
    timeout: 25_000
  }).toBe(true);
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.type ?? null,
      {
        timeout: 25_000
      }
    )
    .toBe("gallery-thumbnails");
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_BROWSER_PANEL_ID))?.imageCount ?? null,
      { timeout: 25_000 }
    )
    .toBe(21);
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.type ?? null,
      {
        timeout: 25_000
      }
    )
    .toBe("gallery-preview");
  await expect
    .poll(
      async () => (await getScenePanelSnapshot(page, SOUTH_PADRE_PREVIEW_PANEL_ID))?.imageCount ?? null,
      { timeout: 25_000 }
    )
    .toBe(21);

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
  const spiImageResponses = assetResponses.filter((entry) =>
    /ArmaReforger_SPI/i.test(entry.url)
  );
  expect(spiImageResponses.length).toBeGreaterThan(0);
  expect(spiImageResponses.every((entry) => entry.status < 400)).toBe(true);
});

test("turning around near SPI room panels does not crash runtime", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);

  await expect
    .poll(async () => {
      const stats = await getDebugStats(page);
      return Boolean(stats && typeof stats === "object");
    }, { timeout: 25_000 })
    .toBe(true);

  for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315, 0]) {
    await expect.poll(() => teleportDebug(page, [-19.3, 1.7, -5.1], yaw, 0), {
      timeout: 25_000
    }).toBe(true);
    await expect
      .poll(async () => {
        const stats = await getDebugStats(page);
        return Number.isFinite(stats?.portalCount) && Number.isFinite(stats?.interactionTargetCount);
      }, { timeout: 25_000 })
      .toBe(true);
  }

  const fallbackVisible = await page.evaluate(() => {
    const panel = document.querySelector("#fallback-panel");
    return Boolean(panel && !panel.classList.contains("hidden"));
  });
  expect(fallbackVisible).toBe(false);
  expect(pageErrors).toHaveLength(0);
});

test("editor mode stays query-gated and mounts local editor on demand", async ({ page }) => {
  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1`);
  await expect(page.locator("#local-editor")).toHaveCount(0);
  await expect
    .poll(async () => await getEditorSnapshot(page), { timeout: 25_000 })
    .toBe(null);

  await page.goto(`${LOBBY_PATH}?debugui=1&sceneui=1&editor=1`);
  await expect(page.locator("#local-editor")).toBeVisible();

  await expect
    .poll(async () => (await getEditorSnapshot(page))?.propCount ?? 0, { timeout: 25_000 })
    .toBeGreaterThan(20);
});
