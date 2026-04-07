import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDevModelShowroomLayout,
  createIsolatedDevModelLabSceneConfig,
  DEV_MODEL_SHOWROOM_CELL_SIZE
} from "../../src/editor/devModelShowroom.js";

test("buildDevModelShowroomLayout places portable models on unique grid cells outside room bounds", () => {
  const manifest = {
    entries: [
      {
        id: "crate",
        portable: true,
        defaults: {
          model: "/__dev/model-intake/file?path=crate.glb",
          scale: [1, 1, 1]
        }
      },
      {
        id: "chair",
        portable: true,
        defaults: {
          model: "/__dev/model-intake/file?path=chair.glb",
          scale: [1, 1, 1]
        }
      },
      {
        id: "invalid",
        portable: false,
        defaults: {
          model: "/__dev/model-intake/file?path=invalid.glb",
          scale: [1, 1, 1]
        }
      }
    ]
  };

  const layout = buildDevModelShowroomLayout(manifest, {
    roomBounds: {
      minX: -12,
      maxX: 18,
      minZ: -8,
      maxZ: 22
    }
  });

  const modelProps = layout.props.filter((entry) => String(entry.id).startsWith("dev_showroom_model_"));
  assert.equal(modelProps.length, 2);
  assert.equal(layout.meta.portableCount, 2);
  assert.ok(layout.meta.origin[0] > 18);
  assert.ok(layout.meta.origin[2] > 22);
  assert.ok(layout.spawnPosition[2] > layout.meta.origin[2]);
  assert.deepEqual(
    modelProps.map((entry) => entry.position.slice(0, 3)),
    [
      [modelProps[0].position[0], 0.34, modelProps[0].position[2]],
      [modelProps[1].position[0], 0.34, modelProps[1].position[2]]
    ]
  );
  assert.ok(
    Math.abs(modelProps[0].position[0] - modelProps[1].position[0]) >= DEV_MODEL_SHOWROOM_CELL_SIZE ||
      Math.abs(modelProps[0].position[2] - modelProps[1].position[2]) >= DEV_MODEL_SHOWROOM_CELL_SIZE
  );
});

test("createIsolatedDevModelLabSceneConfig builds a scene shell with no lobby content", () => {
  const sceneConfig = createIsolatedDevModelLabSceneConfig();

  assert.equal(sceneConfig.meta.mode, "dev-model-lab");
  assert.equal(sceneConfig.portals.length, 0);
  assert.equal(sceneConfig.props.length, 0);
  assert.equal(sceneConfig.propGroups.length, 0);
  assert.equal(sceneConfig.room.sideDoorways.enabled, false);
  assert.equal(sceneConfig.room.frontEntrance.enabled, false);
  assert.equal(sceneConfig.room.rearEntrance.enabled, false);
  assert.ok(sceneConfig.room.navigationBounds.maxX > 0);
});

test("buildDevModelShowroomLayout centers portable models in isolated placement mode", () => {
  const layout = buildDevModelShowroomLayout(
    {
      entries: [
        {
          id: "console",
          portable: true,
          defaults: {
            model: "/__dev/model-intake/file?path=console.glb",
            scale: [1, 1, 1]
          }
        }
      ]
    },
    {
      placementMode: "center"
    }
  );

  assert.deepEqual(layout.meta.origin, [0, 0, 0]);
  assert.equal(layout.portableEntries.length, 1);
  assert.equal(layout.meta.columns, 2);
  assert.equal(layout.props.find((entry) => entry.id === "dev_showroom_model_console")?.position?.[0], -3);
});
