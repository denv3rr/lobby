import test from "node:test";
import assert from "node:assert/strict";

import {
  getFeedPayloadFreshness,
  isFeedRuntimeConfigFile,
  selectPreferredFeedRuntimeSource
} from "../../src/utils/runtimeConfigFeeds.js";

test("isFeedRuntimeConfigFile only matches feed config files", () => {
  assert.equal(isFeedRuntimeConfigFile("videos-feed.json"), true);
  assert.equal(isFeedRuntimeConfigFile("videos-long-feed.json"), true);
  assert.equal(isFeedRuntimeConfigFile("scene.json"), false);
});

test("getFeedPayloadFreshness uses feed metadata timestamps", () => {
  const freshness = getFeedPayloadFreshness({
    meta: {
      fetchedAt: "2026-03-10T10:50:13.411Z"
    },
    items: []
  });

  assert.ok(freshness > 0);
  assert.equal(
    freshness,
    Date.parse("2026-03-10T10:50:13.411Z")
  );
});

test("getFeedPayloadFreshness falls back to item publish times", () => {
  const freshness = getFeedPayloadFreshness({
    items: [
      { publishedAt: "2026-03-08T03:00:00.000Z" },
      { publishedAt: "2026-03-10T18:30:00.000Z" }
    ]
  });

  assert.equal(
    freshness,
    Date.parse("2026-03-10T18:30:00.000Z")
  );
});

test("getFeedPayloadFreshness prefers feed metadata over item publish times when both exist", () => {
  const freshness = getFeedPayloadFreshness({
    meta: {
      fetchedAt: "2026-03-10T10:50:13.411Z"
    },
    items: [
      { publishedAt: "2026-03-12T18:30:00.000Z" }
    ]
  });

  assert.equal(
    freshness,
    Date.parse("2026-03-10T10:50:13.411Z")
  );
});

test("selectPreferredFeedRuntimeSource picks defaults when defaults are fresher", () => {
  const preferred = selectPreferredFeedRuntimeSource("videos-feed.json", {
    localPayload: {
      meta: { fetchedAt: "2026-03-08T03:41:04.796Z" },
      items: [{ id: "older" }]
    },
    defaultsPayload: {
      meta: { fetchedAt: "2026-03-10T10:50:13.411Z" },
      items: [{ id: "newer" }]
    }
  });

  assert.equal(preferred, "defaults");
});

test("selectPreferredFeedRuntimeSource preserves local overrides when freshness is unknown", () => {
  const preferred = selectPreferredFeedRuntimeSource("videos-feed.json", {
    localPayload: {
      items: [{ id: "custom-local-entry" }]
    },
    defaultsPayload: {
      meta: { fetchedAt: "2026-03-10T10:50:13.411Z" },
      items: [{ id: "synced-default-entry" }]
    }
  });

  assert.equal(preferred, "local");
});
