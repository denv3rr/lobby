import test from "node:test";
import assert from "node:assert/strict";

import { mergeCatalogNavigationBounds } from "../../src/engine/sceneLoader.js";
import { resolvePositionAgainstColliders } from "../../src/systems/controls/collision.js";
import { clientPointToViewportNdc } from "../../src/systems/controls/mobileControls.js";

test("resolvePositionAgainstColliders keeps legacy high sample probes above low blockers", () => {
  const position = { x: 0, z: 0 };
  const hits = resolvePositionAgainstColliders({
    position,
    colliders: [
      {
        minX: -1,
        maxX: 1,
        minZ: -1,
        maxZ: 1,
        minY: 0,
        maxY: 0.7
      }
    ],
    radius: 0.42,
    sampleY: 0.9
  });

  assert.equal(hits, 0);
  assert.deepEqual(position, { x: 0, z: 0 });
});

test("resolvePositionAgainstColliders blocks low obstacles when the player body range overlaps them", () => {
  const position = { x: 0, z: 0 };
  const hits = resolvePositionAgainstColliders({
    position,
    colliders: [
      {
        minX: -1,
        maxX: 1,
        minZ: -1,
        maxZ: 1,
        minY: 0,
        maxY: 0.7
      }
    ],
    radius: 0.42,
    minY: 0.48,
    maxY: 1.6
  });

  assert.equal(hits, 1);
  assert.equal(position.x, -1.42);
  assert.equal(position.z, 0);
});

test("clientPointToViewportNdc uses the mounted viewport instead of the full window", () => {
  const point = clientPointToViewportNdc(
    {
      getBoundingClientRect() {
        return {
          left: 100,
          top: 200,
          width: 300,
          height: 150
        };
      }
    },
    250,
    275
  );

  assert.equal(point.x, 0);
  assert.equal(Math.abs(point.y), 0);
});

test("mergeCatalogNavigationBounds expands room bounds to include the widened screening hall shell", () => {
  const mergedBounds = mergeCatalogNavigationBounds(
    {
      minX: -27,
      maxX: 27,
      minZ: -60,
      maxZ: 58
    },
    {
      rooms: {
        videos: {
          origin: [24.3, 0, -5.1],
          size: [18.6, 4.6, 9.6],
          feedSource: "videos",
          layout: {
            maxItems: 18
          }
        }
      }
    },
    {
      videos: {
        items: [{ id: "video-1" }]
      }
    }
  );

  assert.equal(Number(mergedBounds.maxX.toFixed(1)), 33.6);
  assert.equal(mergedBounds.minX, -27);
  assert.equal(mergedBounds.minZ, -60);
  assert.equal(mergedBounds.maxZ, 58);
});
