import test from "node:test";
import assert from "node:assert/strict";

import {
  isLocalAuthoringHostName,
  normalizeExternalUrl,
  shouldEnableLocalDebugUi,
  shouldEnableLocalEditor
} from "../../src/utils/runtimePolicy.js";

test("isLocalAuthoringHostName accepts localhost variants", () => {
  assert.equal(isLocalAuthoringHostName("localhost"), true);
  assert.equal(isLocalAuthoringHostName("127.0.0.1"), true);
  assert.equal(isLocalAuthoringHostName("studio.local"), true);
  assert.equal(isLocalAuthoringHostName("example.com"), false);
});

test("shouldEnableLocalDebugUi stays query-gated even in dev", () => {
  assert.equal(
    shouldEnableLocalDebugUi(new URLSearchParams("debugui=1"), {
      isDev: true
    }),
    true
  );
  assert.equal(
    shouldEnableLocalDebugUi(new URLSearchParams(""), {
      isDev: true
    }),
    false
  );
});

test("shouldEnableLocalDebugUi rejects public hosts", () => {
  assert.equal(
    shouldEnableLocalDebugUi(new URLSearchParams("debugui=1"), {
      hostname: "example.com"
    }),
    false
  );
  assert.equal(
    shouldEnableLocalDebugUi(new URLSearchParams("debugui=1"), {
      hostname: "127.0.0.1"
    }),
    true
  );
});

test("shouldEnableLocalEditor remains local-only", () => {
  assert.equal(
    shouldEnableLocalEditor(new URLSearchParams("editor=1"), {
      hostname: "localhost"
    }),
    true
  );
  assert.equal(
    shouldEnableLocalEditor(new URLSearchParams("editor=1"), {
      hostname: "example.com"
    }),
    false
  );
});

test("normalizeExternalUrl allows relative and https urls but blocks scripts", () => {
  assert.equal(
    normalizeExternalUrl("/shop", {
      baseUrl: "https://seperet.com/lobby/"
    }),
    "https://seperet.com/shop"
  );
  assert.equal(
    normalizeExternalUrl("https://example.com/path"),
    "https://example.com/path"
  );
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), "");
  assert.equal(normalizeExternalUrl("data:text/html,boom"), "");
});
