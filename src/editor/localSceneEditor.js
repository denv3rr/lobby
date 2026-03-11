import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

const EDITOR_STATE_STORAGE_KEY = "lobby.editor.state.v1";
const DEFAULT_TRANSLATE_SNAP = 0.25;
const DEFAULT_ROTATE_SNAP_DEG = 15;
const DEFAULT_SCALE_SNAP = 0.1;

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toRounded(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(digits));
}

function normalizeSavedState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      version: 1,
      props: {}
    };
  }

  const source = payload.props && typeof payload.props === "object" ? payload.props : {};
  const props = {};
  for (const [propId, transform] of Object.entries(source)) {
    const id = readText(propId, "");
    if (!id || !transform || typeof transform !== "object") {
      continue;
    }
    const normalized = {};
    if (Array.isArray(transform.position) && transform.position.length >= 3) {
      normalized.position = transform.position.slice(0, 3).map((value) => Number(value) || 0);
    }
    if (Array.isArray(transform.rotation) && transform.rotation.length >= 3) {
      normalized.rotation = transform.rotation.slice(0, 3).map((value) => Number(value) || 0);
    }
    if (Array.isArray(transform.scale) && transform.scale.length >= 3) {
      normalized.scale = transform.scale
        .slice(0, 3)
        .map((value) => Math.max(0.001, Number(value) || 1));
    }
    props[id] = normalized;
  }

  return {
    version: 1,
    updatedAt: readText(payload.updatedAt, ""),
    props
  };
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(EDITOR_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeSavedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredState(state) {
  const normalized = normalizeSavedState(state);
  const withTimestamp = {
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(EDITOR_STATE_STORAGE_KEY, JSON.stringify(withTimestamp));
  return withTimestamp;
}

function clearStoredState() {
  window.localStorage.removeItem(EDITOR_STATE_STORAGE_KEY);
}

export function createLocalSceneEditor({
  mount = document.body,
  scene = null,
  camera = null,
  renderer = null,
  sceneContext = null,
  onSceneMutated = null,
  onSuppressPointerLock = null
} = {}) {
  if (!scene || !camera || !renderer || !sceneContext) {
    return null;
  }

  const domElement = renderer.domElement || null;
  if (!domElement) {
    return null;
  }

  const host =
    mount?.querySelector?.(".ui-layer") ||
    mount?.querySelector?.(".lobby-root") ||
    mount ||
    document.body;

  const root = document.createElement("section");
  root.id = "local-editor";
  root.className = "editor-panel";
  root.dataset.ui = "true";
  root.innerHTML = `
    <header class="editor-panel-head" data-ui>
      <h2 data-ui>Local Editor</h2>
      <p class="editor-panel-subtitle" data-ui>Dev-only scene authoring</p>
    </header>
    <div class="editor-panel-row editor-mode-row" data-ui>
      <button type="button" data-mode="translate" data-ui>Move</button>
      <button type="button" data-mode="rotate" data-ui>Rotate</button>
      <button type="button" data-mode="scale" data-ui>Scale</button>
      <label class="editor-panel-checkbox" data-ui>
        <input id="editor-snap-toggle" type="checkbox" checked data-ui />
        Snap
      </label>
    </div>
    <label class="editor-panel-label" data-ui>
      Outliner
      <select id="editor-prop-list" size="11" data-ui></select>
    </label>
    <div class="editor-panel-row editor-transform-row" data-ui>
      <code id="editor-transform-readout" data-ui>Nothing selected.</code>
    </div>
    <div class="editor-panel-row editor-actions-row" data-ui>
      <button id="editor-refresh-btn" type="button" data-ui>Refresh</button>
      <button id="editor-save-btn" type="button" data-ui>Save Local</button>
      <button id="editor-load-btn" type="button" data-ui>Load Local</button>
      <button id="editor-clear-btn" type="button" data-ui>Clear Local</button>
      <button id="editor-copy-btn" type="button" data-ui>Copy JSON</button>
    </div>
    <p id="editor-status" class="editor-status" data-ui></p>
  `;
  host.appendChild(root);

  const propList = root.querySelector("#editor-prop-list");
  const snapToggle = root.querySelector("#editor-snap-toggle");
  const refreshButton = root.querySelector("#editor-refresh-btn");
  const saveButton = root.querySelector("#editor-save-btn");
  const loadButton = root.querySelector("#editor-load-btn");
  const clearButton = root.querySelector("#editor-clear-btn");
  const copyButton = root.querySelector("#editor-copy-btn");
  const statusLabel = root.querySelector("#editor-status");
  const readout = root.querySelector("#editor-transform-readout");
  const modeButtons = [...root.querySelectorAll("[data-mode]")];

  const transformControls = new TransformControls(camera, domElement);
  transformControls.setSpace("world");
  transformControls.size = 0.8;
  transformControls.enabled = true;
  scene.add(transformControls);

  let selectedPropId = "";
  let activeMode = "translate";
  let disposed = false;

  function setStatus(text, tone = "muted") {
    if (!statusLabel) {
      return;
    }
    statusLabel.textContent = readText(text, "");
    statusLabel.dataset.tone = tone;
  }

  function getEditableIds() {
    return sceneContext.getEditablePropIds?.() || [];
  }

  function setSnapEnabled(enabled) {
    const useSnap = enabled !== false;
    transformControls.translationSnap = useSnap ? DEFAULT_TRANSLATE_SNAP : null;
    transformControls.rotationSnap = useSnap
      ? THREE.MathUtils.degToRad(DEFAULT_ROTATE_SNAP_DEG)
      : null;
    transformControls.scaleSnap = useSnap ? DEFAULT_SCALE_SNAP : null;
  }

  function setMode(mode) {
    const nextMode = ["translate", "rotate", "scale"].includes(mode) ? mode : "translate";
    activeMode = nextMode;
    transformControls.setMode(nextMode);
    for (const button of modeButtons) {
      const selected = button.dataset.mode === nextMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function getSelectedObject() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getEditablePropObject?.(selectedPropId) || null;
  }

  function refreshTransformReadout() {
    if (!readout) {
      return;
    }
    const transform = sceneContext.getEditablePropTransform?.(selectedPropId);
    if (!transform) {
      readout.textContent = "Nothing selected.";
      return;
    }
    const [px, py, pz] = transform.position || [0, 0, 0];
    const [rx, ry, rz] = transform.rotation || [0, 0, 0];
    const [sx, sy, sz] = transform.scale || [1, 1, 1];
    readout.textContent =
      `P ${toRounded(px, 2)}, ${toRounded(py, 2)}, ${toRounded(pz, 2)} | ` +
      `R ${toRounded(rx, 1)}, ${toRounded(ry, 1)}, ${toRounded(rz, 1)} | ` +
      `S ${toRounded(sx, 2)}, ${toRounded(sy, 2)}, ${toRounded(sz, 2)}`;
  }

  function detachSelection() {
    selectedPropId = "";
    transformControls.detach();
    if (propList) {
      propList.value = "";
    }
    refreshTransformReadout();
  }

  function selectProp(propId) {
    const nextId = readText(propId, "");
    if (!nextId) {
      detachSelection();
      return false;
    }
    const object = sceneContext.getEditablePropObject?.(nextId);
    if (!object || !object.parent) {
      detachSelection();
      return false;
    }
    selectedPropId = nextId;
    object.visible = true;
    transformControls.attach(object);
    if (propList) {
      propList.value = nextId;
    }
    refreshTransformReadout();
    return true;
  }

  function refreshOutliner() {
    if (!propList) {
      return;
    }
    const ids = getEditableIds();
    const previous = selectedPropId || readText(propList.value, "");
    propList.innerHTML = "";
    for (const id of ids) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id;
      propList.appendChild(option);
    }
    if (previous && ids.includes(previous)) {
      selectProp(previous);
    } else if (selectedPropId) {
      detachSelection();
    } else {
      refreshTransformReadout();
    }
  }

  function buildSerializableState() {
    const props = {};
    for (const id of getEditableIds()) {
      const transform = sceneContext.getEditablePropTransform?.(id);
      if (!transform) {
        continue;
      }
      props[id] = transform;
    }
    return {
      version: 1,
      props
    };
  }

  function applyState(state, { markDirty = true } = {}) {
    const normalized = normalizeSavedState(state);
    const updated = sceneContext.applyEditablePropTransforms?.(normalized.props, { markDirty }) || 0;
    if (updated > 0) {
      onSceneMutated?.();
      refreshTransformReadout();
    }
    return updated;
  }

  function saveState() {
    const payload = buildSerializableState();
    writeStoredState(payload);
    setStatus(`Saved ${Object.keys(payload.props).length} prop transforms locally.`, "success");
    return payload;
  }

  function loadSavedState({ silent = false } = {}) {
    const payload = readStoredState();
    if (!payload) {
      if (!silent) {
        setStatus("No local editor state found.", "warn");
      }
      return 0;
    }
    const applied = applyState(payload, { markDirty: true });
    if (!silent) {
      setStatus(`Loaded ${applied} prop transforms from local state.`, "success");
    }
    return applied;
  }

  function clearState() {
    clearStoredState();
    setStatus("Cleared local editor state.", "muted");
  }

  async function copyStateToClipboard() {
    const payload = buildSerializableState();
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied editor state JSON to clipboard.", "success");
      return true;
    } catch {
      setStatus("Clipboard unavailable. Use Save Local and load from browser storage.", "warn");
      return false;
    }
  }

  function suppressPointerLock() {
    if (typeof onSuppressPointerLock === "function") {
      onSuppressPointerLock();
      return;
    }
    if (domElement?.dataset) {
      domElement.dataset.pointerLockSuppressedUntil = String(performance.now() + 600);
    }
    document.exitPointerLock?.();
  }

  transformControls.addEventListener("dragging-changed", (event) => {
    if (disposed) {
      return;
    }
    if (event?.value) {
      suppressPointerLock();
      return;
    }
    if (selectedPropId) {
      sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: true });
      onSceneMutated?.();
      refreshTransformReadout();
    }
  });

  transformControls.addEventListener("objectChange", () => {
    if (disposed || !selectedPropId) {
      return;
    }
    sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: false });
    refreshTransformReadout();
  });

  propList?.addEventListener("change", () => {
    const nextId = readText(propList.value, "");
    selectProp(nextId);
  });

  snapToggle?.addEventListener("change", () => {
    setSnapEnabled(Boolean(snapToggle.checked));
  });

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
    });
  }

  refreshButton?.addEventListener("click", () => {
    refreshOutliner();
    setStatus("Outliner refreshed.", "muted");
  });
  saveButton?.addEventListener("click", () => {
    saveState();
  });
  loadButton?.addEventListener("click", () => {
    loadSavedState();
  });
  clearButton?.addEventListener("click", () => {
    clearState();
  });
  copyButton?.addEventListener("click", () => {
    void copyStateToClipboard();
  });

  setSnapEnabled(true);
  setMode("translate");
  refreshOutliner();
  setStatus(`Ready. ${getEditableIds().length} props available.`, "muted");

  return {
    selectProp,
    refreshOutliner,
    loadSavedState,
    saveState,
    clearState,
    getSnapshot: () => ({
      selectedPropId,
      mode: activeMode,
      propCount: getEditableIds().length,
      hasStoredState: Boolean(readStoredState())
    }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      transformControls.detach();
      scene.remove(transformControls);
      transformControls.dispose();
      root.remove();
    }
  };
}
