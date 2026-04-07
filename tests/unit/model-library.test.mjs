import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditorPresetFromLibraryEntry,
  normalizeModelLibraryManifest,
  resolveEffectPresetId,
  resolveMotionPresetId
} from "../../src/editor/modelLibrary.js";
import {
  getRuntimePhaseModuleId,
  normalizeRuntimePhase
} from "../../src/utils/runtimePhases.js";

test("normalizeRuntimePhase folds artifact fog aliases into one phase id", () => {
  assert.equal(normalizeRuntimePhase("artifact-transition"), "artifact-transition");
  assert.equal(normalizeRuntimePhase("artifact-fog"), "artifact-transition");
  assert.equal(normalizeRuntimePhase("fogtransition"), "artifact-transition");
  assert.equal(normalizeRuntimePhase("always"), "");
  assert.equal(getRuntimePhaseModuleId("artifact-transition"), "phase:artifact-transition");
});

test("normalizeModelLibraryManifest keeps only valid model entries", () => {
  const manifest = normalizeModelLibraryManifest({
    version: 1,
    entries: [
      {
        id: "valid-prop",
        label: "Valid Prop",
        model: "/assets/models/props/valid.glb",
        defaults: {
          model: "/assets/models/props/valid.glb",
          runtimePhase: "artifact-fog"
        }
      },
      {
        id: "broken-prop",
        label: "",
        model: "/assets/models/props/broken.glb"
      }
    ]
  });

  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].defaults.runtimePhase, "artifact-transition");
  assert.equal(manifest.entries[0].defaults.modelFallback, "box");
});

test("buildEditorPresetFromLibraryEntry clones export-safe model defaults", () => {
  const preset = buildEditorPresetFromLibraryEntry({
    id: "crate",
    label: "Crate",
    category: "Horror Reveal",
    defaults: {
      model: "/assets/models/props/crate.glb",
      runtimePhase: "artifact-transition",
      effect: {
        type: "smoke"
      }
    }
  });

  assert.equal(preset.id, "library:crate");
  assert.equal(preset.config.model, "/assets/models/props/crate.glb");
  assert.equal(preset.config.runtimePhase, "artifact-transition");
  assert.notEqual(preset.config, preset.defaults);
});

test("preset resolvers classify known motion and effect shapes", () => {
  assert.equal(
    resolveMotionPresetId({
      animation: {
        type: "spin-y",
        speed: 0.18
      }
    }),
    "spin-y-creep"
  );
  assert.equal(
    resolveEffectPresetId({
      effect: {
        type: "embers"
      }
    }),
    "embers"
  );
  assert.equal(
    resolveEffectPresetId({
      effect: {
        type: "custom-ash"
      }
    }),
    "custom"
  );
});
