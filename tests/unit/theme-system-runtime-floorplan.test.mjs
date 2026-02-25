import test from "node:test";
import assert from "node:assert/strict";

import { ThemeSystem } from "../../src/systems/theming/applyTheme.js";

function createThemeSystem() {
  return new ThemeSystem({
    scene: {
      add() {},
      remove() {}
    },
    sceneContext: {
      floorY: 0,
      roomConfig: { size: [30, 8, 30] },
      lights: [],
      baseLightState: [],
      roomMaterials: {
        wall: {},
        floor: {},
        ceiling: {}
      },
      portals: [],
      removePropsByTag() {},
      applyThemeFloorplan() {},
      resetThemeFloorplan() {}
    },
    cache: {
      async loadTexture() {
        return null;
      }
    },
    themesConfig: {
      defaultTheme: "lobby",
      themes: {
        lobby: {}
      }
    },
    audioSystem: {
      setAmbientMix() {}
    },
    qualityProfile: {}
  });
}

test("setRuntimeFloorplanOverrides deep-clones object entries without throwing", () => {
  const themeSystem = createThemeSystem();
  const source = [
    {
      annexes: [{ id: "archive", size: [7, 4, 8] }],
      navigationBounds: { minX: -10, maxX: 10, minZ: -12, maxZ: 12 }
    },
    null,
    42
  ];

  themeSystem.setRuntimeFloorplanOverrides(source, { reapply: false });

  assert.equal(themeSystem.runtimeFloorplanOverrides.length, 1);
  source[0].annexes[0].id = "mutated";
  source[0].navigationBounds.minX = -999;

  assert.equal(themeSystem.runtimeFloorplanOverrides[0].annexes[0].id, "archive");
  assert.equal(themeSystem.runtimeFloorplanOverrides[0].navigationBounds.minX, -10);
});

test("getRuntimeFloorplanOverride merges runtime overrides and annex arrays", () => {
  const themeSystem = createThemeSystem();

  themeSystem.setRuntimeFloorplanOverrides(
    [
      {
        annexes: [{ id: "east" }],
        navigationBounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }
      },
      {
        annexes: [{ id: "west" }],
        navigationProfile: { speed: 1.15 }
      }
    ],
    { reapply: false }
  );

  const merged = themeSystem.getRuntimeFloorplanOverride();
  assert.ok(merged);
  assert.deepEqual(
    merged.annexes.map((entry) => entry.id),
    ["east", "west"]
  );
  assert.equal(merged.navigationBounds.minX, -20);
  assert.equal(merged.navigationProfile.speed, 1.15);
});
