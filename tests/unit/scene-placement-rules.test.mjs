import test from "node:test";
import assert from "node:assert/strict";

import {
  collectPlacementIssuesForBounds,
  normalizePlacementPolicy
} from "../../src/engine/sceneLoader.js";

test("normalizePlacementPolicy defaults to safe builder placement guards", () => {
  const policy = normalizePlacementPolicy({});

  assert.equal(policy.avoidCatalog, true);
  assert.equal(policy.avoidDoorways, true);
  assert.equal(policy.avoidPortals, true);
  assert.equal(policy.avoidProps, true);
  assert.equal(policy.clearance, 0.12);
  assert.equal(policy.searchStep, 0.5);
  assert.equal(policy.searchRadius, 6);
});

test("normalizePlacementPolicy respects explicit placement overrides", () => {
  const policy = normalizePlacementPolicy({
    collider: false,
    placement: {
      avoidCatalog: false,
      avoidDoorways: false,
      avoidPortals: true,
      avoidProps: false,
      clearance: 0.34,
      searchStep: 0.75,
      searchRadius: 9
    }
  });

  assert.equal(policy.avoidCatalog, false);
  assert.equal(policy.avoidDoorways, false);
  assert.equal(policy.avoidPortals, true);
  assert.equal(policy.avoidProps, false);
  assert.equal(policy.clearance, 0.34);
  assert.equal(policy.searchStep, 0.75);
  assert.equal(policy.searchRadius, 9);
});

test("collectPlacementIssuesForBounds reports catalog, doorway, portal, and prop blockers", () => {
  const issues = collectPlacementIssuesForBounds(
    {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.5,
      maxZ: 0.5
    },
    {
      prop: {},
      catalogZones: [{ id: "catalog-main", minX: -1, maxX: 1, minZ: -1, maxZ: 1 }],
      safetyZones: [
        { id: "door-north", kind: "doorway", minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
        { id: "portal-east", kind: "portal", minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
      ],
      colliders: [{ id: "prop:blocker", enabled: true, minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]
    }
  );

  assert.deepEqual(
    issues.map((issue) => [issue.type, issue.id, issue.severity]),
    [
      ["catalog", "catalog-main", "error"],
      ["doorway", "door-north", "error"],
      ["portal", "portal-east", "error"],
      ["prop", "prop:blocker", "warn"]
    ]
  );
});

test("collectPlacementIssuesForBounds honors relaxed doorway and prop rules", () => {
  const issues = collectPlacementIssuesForBounds(
    {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.5,
      maxZ: 0.5
    },
    {
      prop: {
        collider: false,
        placement: {
          avoidDoorways: false
        }
      },
      safetyZones: [{ id: "door-north", kind: "doorway", minX: -1, maxX: 1, minZ: -1, maxZ: 1 }],
      colliders: [{ id: "prop:blocker", enabled: true, minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]
    }
  );

  assert.equal(issues.length, 0);
});

test("collectPlacementIssuesForBounds ignores the selected collider footprint by id", () => {
  const issues = collectPlacementIssuesForBounds(
    {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.5,
      maxZ: 0.5
    },
    {
      prop: {},
      colliders: [
        { id: "prop:self", enabled: true, minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
        { id: "prop:other", enabled: true, minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
      ],
      ignoreId: "prop:self"
    }
  );

  assert.deepEqual(
    issues.map((issue) => issue.id),
    ["prop:other"]
  );
});
