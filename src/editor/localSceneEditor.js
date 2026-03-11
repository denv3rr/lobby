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

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => readText(entry, "")).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function isEditableTarget(target) {
  return Boolean(
    target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      target?.isContentEditable
  );
}

function normalizeEditorOverrides(payload) {
  const state = normalizeSavedState(payload);
  return {
    version: 2,
    props: state.props,
    hiddenProps: normalizeStringList(state.hiddenProps),
    hiddenGeneratedNodes: normalizeStringList(state.hiddenGeneratedNodes)
  };
}

function hasEditorOverrideContent(payload) {
  const normalized = normalizeEditorOverrides(payload);
  return (
    Object.keys(normalized.props).length > 0 ||
    normalized.hiddenProps.length > 0 ||
    normalized.hiddenGeneratedNodes.length > 0
  );
}

function normalizeSavedState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      version: 2,
      props: {},
      hiddenProps: [],
      hiddenGeneratedNodes: []
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
    version: 2,
    updatedAt: readText(payload.updatedAt, ""),
    props,
    hiddenProps: normalizeStringList(payload.hiddenProps),
    hiddenGeneratedNodes: normalizeStringList(payload.hiddenGeneratedNodes)
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
  catalogSystem = null,
  applyLookDelta = null,
  clearMovementKeys = null,
  readSceneConfig = null,
  writeSceneConfig = null,
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
      <button type="button" data-mode="select" data-ui>Select</button>
      <button type="button" data-mode="translate" data-ui>Move</button>
      <button type="button" data-mode="rotate" data-ui>Rotate</button>
      <button type="button" data-mode="scale" data-ui>Scale</button>
      <label class="editor-panel-checkbox" data-ui>
        <input id="editor-snap-toggle" type="checkbox" checked data-ui />
        Snap
      </label>
    </div>
    <p class="editor-panel-hint" data-ui>RMB look, RMB+WASD move, click to select, Q/W/E/R for tools.</p>
    <label class="editor-panel-label" data-ui>
      Props
      <select id="editor-prop-list" size="9" data-ui></select>
    </label>
    <label class="editor-panel-label" data-ui>
      Generated Shell
      <select id="editor-generated-list" size="8" data-ui></select>
    </label>
    <div class="editor-panel-row editor-transform-row" data-ui>
      <code id="editor-transform-readout" data-ui>Nothing selected.</code>
    </div>
    <div class="editor-panel-row editor-source-row" data-ui>
      <code id="editor-source-readout" data-ui>No source path.</code>
    </div>
    <div class="editor-panel-row editor-selection-actions-row" data-ui>
      <button id="editor-hide-selected-btn" type="button" data-ui>Hide Selected</button>
      <button id="editor-restore-selected-btn" type="button" data-ui>Restore Selected</button>
      <button id="editor-restore-room-btn" type="button" data-ui>Restore Room</button>
    </div>
    <div class="editor-panel-row editor-actions-row" data-ui>
      <button id="editor-refresh-btn" type="button" data-ui>Refresh</button>
      <button id="editor-save-btn" type="button" data-ui>Save Session</button>
      <button id="editor-load-btn" type="button" data-ui>Load Session</button>
      <button id="editor-clear-btn" type="button" data-ui>Clear Session</button>
      <button id="editor-copy-path-btn" type="button" data-ui>Copy Path</button>
      <button id="editor-copy-btn" type="button" data-ui>Copy JSON</button>
    </div>
    <div class="editor-panel-row editor-export-row" data-ui>
      <button id="editor-export-local-btn" type="button" data-ui>Export Local Scene</button>
      <button id="editor-export-defaults-btn" type="button" data-ui>Export Defaults</button>
    </div>
    <p id="editor-status" class="editor-status" data-ui></p>
  `;
  host.appendChild(root);

  const propList = root.querySelector("#editor-prop-list");
  const generatedList = root.querySelector("#editor-generated-list");
  const snapToggle = root.querySelector("#editor-snap-toggle");
  const refreshButton = root.querySelector("#editor-refresh-btn");
  const saveButton = root.querySelector("#editor-save-btn");
  const loadButton = root.querySelector("#editor-load-btn");
  const clearButton = root.querySelector("#editor-clear-btn");
  const copyPathButton = root.querySelector("#editor-copy-path-btn");
  const copyButton = root.querySelector("#editor-copy-btn");
  const exportLocalButton = root.querySelector("#editor-export-local-btn");
  const exportDefaultsButton = root.querySelector("#editor-export-defaults-btn");
  const hideSelectedButton = root.querySelector("#editor-hide-selected-btn");
  const restoreSelectedButton = root.querySelector("#editor-restore-selected-btn");
  const restoreRoomButton = root.querySelector("#editor-restore-room-btn");
  const statusLabel = root.querySelector("#editor-status");
  const readout = root.querySelector("#editor-transform-readout");
  const sourceReadout = root.querySelector("#editor-source-readout");
  const modeButtons = [...root.querySelectorAll("[data-mode]")];

  const transformControls = new TransformControls(camera, domElement);
  transformControls.setSpace("world");
  transformControls.size = 0.8;
  transformControls.enabled = true;
  scene.add(transformControls);
  const selectionBounds = new THREE.Box3();
  const selectionHelper = new THREE.Box3Helper(selectionBounds, 0xff8ed5);
  selectionHelper.visible = false;
  selectionHelper.renderOrder = 10;
  selectionHelper.material.depthTest = false;
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.95;
  scene.add(selectionHelper);

  let selectedPropId = "";
  let selectedGeneratedNodeId = "";
  let activeMode = "select";
  let disposed = false;
  let isTransformDragging = false;
  let isCameraLookActive = false;
  let lastLookClientX = 0;
  let lastLookClientY = 0;
  const pickRaycaster = new THREE.Raycaster();
  const pickPointer = new THREE.Vector2();

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

  function getGeneratedEntries() {
    return catalogSystem?.getGeneratedShellEntries?.() || [];
  }

  function getSelectedType() {
    if (selectedPropId) {
      return "prop";
    }
    if (selectedGeneratedNodeId) {
      return "generated";
    }
    return "";
  }

  function getSelectedObject() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getEditablePropObject?.(selectedPropId) || null;
  }

  function getSelectedPropState() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getPropState?.(selectedPropId) || null;
  }

  function getSelectedGeneratedEntry() {
    if (!selectedGeneratedNodeId) {
      return null;
    }
    return getGeneratedEntries().find((entry) => entry.id === selectedGeneratedNodeId) || null;
  }

  function getSelectedSceneObject() {
    if (selectedPropId) {
      return getSelectedObject();
    }
    return getSelectedGeneratedEntry()?.object || null;
  }

  function refreshSelectionHighlight() {
    const object = getSelectedSceneObject();
    if (!object || object.visible === false) {
      selectionHelper.visible = false;
      return;
    }

    object.updateWorldMatrix?.(true, true);
    selectionBounds.setFromObject(object);
    if (selectionBounds.isEmpty()) {
      selectionHelper.visible = false;
      return;
    }
    selectionHelper.visible = true;
    selectionHelper.updateMatrixWorld(true);
  }

  function syncTransformAttachment() {
    if (activeMode === "select" || !selectedPropId) {
      transformControls.detach();
      refreshSelectionHighlight();
      return;
    }

    const object = getSelectedObject();
    if (!object || !object.parent) {
      transformControls.detach();
      refreshSelectionHighlight();
      return;
    }

    transformControls.attach(object);
    refreshSelectionHighlight();
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
    const nextMode = ["select", "translate", "rotate", "scale"].includes(mode) ? mode : "select";
    activeMode = nextMode;
    if (nextMode !== "select") {
      transformControls.setMode(nextMode);
    }
    for (const button of modeButtons) {
      const selected = button.dataset.mode === nextMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    syncTransformAttachment();
  }

  function updateActionState() {
    const selectedType = getSelectedType();
    const propState = getSelectedPropState();
    const generatedEntry = getSelectedGeneratedEntry();
    const hasSelection = Boolean(selectedType);

    if (hideSelectedButton) {
      hideSelectedButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && propState?.editorHidden === true) ||
        (selectedType === "generated" && generatedEntry?.visible === false);
    }
    if (restoreSelectedButton) {
      restoreSelectedButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && propState?.editorHidden !== true) ||
        (selectedType === "generated" &&
          generatedEntry?.visible !== false &&
          generatedEntry?.enabledColliderCount === generatedEntry?.colliderCount);
    }
    if (restoreRoomButton) {
      restoreRoomButton.disabled = !generatedEntry;
    }
    if (copyPathButton) {
      copyPathButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && !readText(propState?.sourcePath, "")) ||
        (selectedType === "generated" && !readText(generatedEntry?.sourcePath, ""));
    }
  }

  function refreshReadout() {
    const selectedType = getSelectedType();
    if (!readout || !sourceReadout) {
      return;
    }

    if (selectedType === "prop") {
      const transform = sceneContext.getEditablePropTransform?.(selectedPropId);
      const state = getSelectedPropState();
      if (!transform || !state) {
        readout.textContent = "Nothing selected.";
        sourceReadout.textContent = "No source path.";
        updateActionState();
        return;
      }

      const [px, py, pz] = transform.position || [0, 0, 0];
      const [rx, ry, rz] = transform.rotation || [0, 0, 0];
      const [sx, sy, sz] = transform.scale || [1, 1, 1];
      const hiddenLabel = state.editorHidden ? " | hidden locally" : "";
      readout.textContent =
        `Prop ${selectedPropId}${hiddenLabel} | ` +
        `P ${toRounded(px, 2)}, ${toRounded(py, 2)}, ${toRounded(pz, 2)} | ` +
        `R ${toRounded(rx, 1)}, ${toRounded(ry, 1)}, ${toRounded(rz, 1)} | ` +
        `S ${toRounded(sx, 2)}, ${toRounded(sy, 2)}, ${toRounded(sz, 2)}`;

      const configFile = readText(state.sourceConfigFile, "scene.json");
      const sourcePath = readText(state.sourcePath, "");
      const sourceGroupId = readText(state.sourceGroupId, "");
      sourceReadout.textContent = sourcePath
        ? sourceGroupId
          ? `${configFile} :: ${sourcePath} | group ${sourceGroupId}`
          : `${configFile} :: ${sourcePath}`
        : "Runtime-only object.";
      updateActionState();
      return;
    }

    if (selectedType === "generated") {
      const entry = getSelectedGeneratedEntry();
      if (!entry) {
        readout.textContent = "Nothing selected.";
        sourceReadout.textContent = "No source path.";
        updateActionState();
        return;
      }

      const [px, py, pz] = entry.worldPosition || [0, 0, 0];
      const [sx, sy, sz] = entry.worldBoundsSize || [0, 0, 0];
      const hiddenLabel = entry.visible ? "" : " | hidden locally";
      readout.textContent =
        `${entry.label}${hiddenLabel} | ` +
        `${entry.roomId} room ${entry.roomIndex + 1} | ` +
        `P ${toRounded(px, 2)}, ${toRounded(py, 2)}, ${toRounded(pz, 2)} | ` +
        `Size ${toRounded(sx, 2)}, ${toRounded(sy, 2)}, ${toRounded(sz, 2)} | ` +
        `Colliders ${entry.enabledColliderCount}/${entry.colliderCount}`;
      sourceReadout.textContent =
        `${readText(entry.sourceConfigFile, "catalog.json")} :: ${readText(entry.sourcePath, "catalog.rooms")} | ` +
        `${readText(entry.partId, "generated-shell")}`;
      updateActionState();
      return;
    }

    readout.textContent = "Nothing selected.";
    sourceReadout.textContent = "No source path.";
    updateActionState();
  }

  function clearSelection() {
    selectedPropId = "";
    selectedGeneratedNodeId = "";
    transformControls.detach();
    selectionHelper.visible = false;
    if (propList) {
      propList.value = "";
    }
    if (generatedList) {
      generatedList.value = "";
    }
    refreshReadout();
  }

  function buildPropOptionLabel(id) {
    const state = sceneContext.getPropState?.(id) || null;
    if (!state) {
      return id;
    }
    if (state.editorHidden) {
      return `[hidden] ${id}`;
    }
    if (state.visible === false) {
      return `[culled] ${id}`;
    }
    return id;
  }

  function buildGeneratedOptionLabel(entry) {
    if (!entry) {
      return "";
    }
    const hiddenPrefix = entry.visible ? "" : "[hidden] ";
    return `[${entry.roomId} ${entry.roomIndex + 1}] ${hiddenPrefix}${entry.label}`;
  }

  function selectProp(propId) {
    const nextId = readText(propId, "");
    if (!nextId) {
      clearSelection();
      return false;
    }
    const object = sceneContext.getEditablePropObject?.(nextId);
    if (!object || !object.parent) {
      clearSelection();
      return false;
    }

    selectedPropId = nextId;
    selectedGeneratedNodeId = "";
    if (propList) {
      propList.value = nextId;
    }
    if (generatedList) {
      generatedList.value = "";
    }
    syncTransformAttachment();
    refreshReadout();
    return true;
  }

  function selectGeneratedNode(shellNodeId) {
    const nextId = readText(shellNodeId, "");
    if (!nextId) {
      clearSelection();
      return false;
    }
    const object = catalogSystem?.getGeneratedShellObject?.(nextId) || null;
    if (!object || !object.parent) {
      clearSelection();
      return false;
    }

    selectedPropId = "";
    selectedGeneratedNodeId = nextId;
    syncTransformAttachment();
    if (propList) {
      propList.value = "";
    }
    if (generatedList) {
      generatedList.value = nextId;
    }
    refreshReadout();
    return true;
  }

  function refreshPropOutliner() {
    if (!propList) {
      return;
    }

    const ids = getEditableIds();
    const previous = selectedPropId || readText(propList.value, "");
    propList.innerHTML = "";
    for (const id of ids) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = buildPropOptionLabel(id);
      propList.appendChild(option);
    }

    if (previous && ids.includes(previous) && getSelectedType() === "prop") {
      selectProp(previous);
    } else if (!selectedGeneratedNodeId) {
      refreshReadout();
    }
  }

  function refreshGeneratedOutliner() {
    if (!generatedList) {
      return;
    }

    const entries = getGeneratedEntries();
    const previous = selectedGeneratedNodeId || readText(generatedList.value, "");
    generatedList.innerHTML = "";
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = buildGeneratedOptionLabel(entry);
      generatedList.appendChild(option);
    }

    if (previous && entries.some((entry) => entry.id === previous) && getSelectedType() === "generated") {
      selectGeneratedNode(previous);
    } else if (!selectedPropId) {
      refreshReadout();
    }
  }

  function refreshOutliner() {
    refreshPropOutliner();
    refreshGeneratedOutliner();
    refreshReadout();
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
      version: 2,
      props,
      hiddenProps: sceneContext.getHiddenEditablePropIds?.() || [],
      hiddenGeneratedNodes: catalogSystem?.getHiddenGeneratedShellNodeIds?.() || []
    };
  }

  async function exportStateToConfig(target = "local") {
    if (typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function") {
      setStatus("Config export is only available in local dev mode.", "warn");
      return false;
    }

    try {
      const current = await readSceneConfig("effective");
      const parsed = JSON.parse(current?.text || "{}");
      const overrides = normalizeEditorOverrides(buildSerializableState());

      if (hasEditorOverrideContent(overrides)) {
        parsed.editorOverrides = overrides;
      } else {
        delete parsed.editorOverrides;
      }

      await writeSceneConfig(target, `${JSON.stringify(parsed, null, 2)}\n`);
      setStatus(
        target === "defaults"
          ? "Exported current editor overrides to public/config.defaults/scene.json."
          : "Exported current editor overrides to public/config/scene.json.",
        "success"
      );
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to export scene overrides.", "warn");
      return false;
    }
  }

  function applyHiddenPropState(hiddenIds = [], { markDirty = true } = {}) {
    const nextHiddenIds = new Set(normalizeStringList(hiddenIds));
    let updatedCount = 0;
    for (const id of getEditableIds()) {
      const state = sceneContext.getPropState?.(id) || null;
      const shouldBeVisible = !nextHiddenIds.has(id);
      const currentlyVisible = state?.editorHidden !== true;
      if (currentlyVisible === shouldBeVisible) {
        continue;
      }
      if (sceneContext.setEditablePropVisible?.(id, shouldBeVisible, { markDirty })) {
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  function applyHiddenGeneratedState(hiddenIds = []) {
    const nextHiddenIds = new Set(normalizeStringList(hiddenIds));
    const entries = getGeneratedEntries();
    const currentHiddenIds = new Set(
      catalogSystem?.getHiddenGeneratedShellNodeIds?.() ||
        entries.filter((entry) => entry.visible === false).map((entry) => entry.id)
    );
    const allIds = new Set([
      ...entries.map((entry) => entry.id),
      ...currentHiddenIds,
      ...nextHiddenIds
    ]);
    let updatedCount = 0;
    for (const id of allIds) {
      const shouldBeVisible = !nextHiddenIds.has(id);
      const currentlyVisible = !currentHiddenIds.has(id);
      if (currentlyVisible === shouldBeVisible) {
        continue;
      }
      if (catalogSystem?.setGeneratedShellNodeVisible?.(id, shouldBeVisible)) {
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  function applyState(state, { markDirty = true } = {}) {
    const normalized = normalizeSavedState(state);
    const updatedTransforms =
      sceneContext.applyEditablePropTransforms?.(normalized.props, { markDirty }) || 0;
    const updatedHiddenProps = applyHiddenPropState(normalized.hiddenProps, { markDirty });
    const updatedHiddenGenerated = applyHiddenGeneratedState(normalized.hiddenGeneratedNodes);
    const updated = updatedTransforms + updatedHiddenProps + updatedHiddenGenerated;
    if (updated > 0) {
      onSceneMutated?.();
      refreshOutliner();
    }
    return updated;
  }

  function saveState() {
    const payload = buildSerializableState();
    writeStoredState(payload);
    setStatus(
      `Saved ${Object.keys(payload.props).length} props, ${payload.hiddenProps.length} hidden props, and ${payload.hiddenGeneratedNodes.length} hidden shell pieces locally.`,
      "success"
    );
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
      setStatus(`Loaded ${applied} local editor changes.`, "success");
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

  async function copySelectedPathToClipboard() {
    const selectedType = getSelectedType();
    if (selectedType === "prop") {
      const state = getSelectedPropState();
      const sourcePath = readText(state?.sourcePath, "");
      if (!selectedPropId || !sourcePath) {
        setStatus("Select a scene prop with a JSON source path first.", "warn");
        return false;
      }
      const text = `${readText(state?.sourceConfigFile, "scene.json")} :: ${sourcePath}`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus(`Copied source path for ${selectedPropId}.`, "success");
        return true;
      } catch {
        setStatus("Clipboard unavailable. Source path is shown in the editor panel.", "warn");
        return false;
      }
    }

    if (selectedType === "generated") {
      const entry = getSelectedGeneratedEntry();
      const sourcePath = readText(entry?.sourcePath, "");
      if (!entry || !sourcePath) {
        setStatus("Select a generated shell piece first.", "warn");
        return false;
      }
      const text = `${readText(entry.sourceConfigFile, "catalog.json")} :: ${sourcePath} :: ${readText(entry.partId, "generated-shell")}`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus(`Copied source path for ${entry.label}.`, "success");
        return true;
      } catch {
        setStatus("Clipboard unavailable. Source path is shown in the editor panel.", "warn");
        return false;
      }
    }

    setStatus("Select a prop or generated shell piece first.", "warn");
    return false;
  }

  function stopCameraLook() {
    if (!isCameraLookActive) {
      return;
    }
    isCameraLookActive = false;
    clearMovementKeys?.();
  }

  function applyEditorLookDelta(deltaX, deltaY) {
    if (typeof applyLookDelta === "function") {
      applyLookDelta(deltaX, deltaY);
      return;
    }

    const player = sceneContext?.player;
    const pitch = sceneContext?.pitch;
    if (!player || !pitch) {
      return;
    }

    const nextYaw = player.rotation.y - (Number(deltaX) || 0) * 0.0022;
    const nextPitch = pitch.rotation.x - (Number(deltaY) || 0) * 0.0022;
    player.rotation.y = Number.isFinite(nextYaw) ? nextYaw : player.rotation.y;
    pitch.rotation.x = THREE.MathUtils.clamp(
      Number.isFinite(nextPitch) ? nextPitch : pitch.rotation.x,
      -Math.PI * 0.5 + 0.01,
      Math.PI * 0.5 - 0.01
    );
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

  function handleCanvasMouseDown(event) {
    if (disposed || event.target !== domElement) {
      return;
    }
    if (event.button !== 2) {
      return;
    }
    event.preventDefault();
    suppressPointerLock();
    clearMovementKeys?.();
    isCameraLookActive = true;
    lastLookClientX = Number(event.clientX) || 0;
    lastLookClientY = Number(event.clientY) || 0;
  }

  function handleWindowMouseMove(event) {
    if (!isCameraLookActive) {
      return;
    }

    const nextX = Number(event.clientX) || 0;
    const nextY = Number(event.clientY) || 0;
    const deltaX = Number.isFinite(event.movementX) && event.movementX !== 0
      ? event.movementX
      : nextX - lastLookClientX;
    const deltaY = Number.isFinite(event.movementY) && event.movementY !== 0
      ? event.movementY
      : nextY - lastLookClientY;
    lastLookClientX = nextX;
    lastLookClientY = nextY;
    applyEditorLookDelta(deltaX, deltaY);
  }

  function handleWindowMouseUp(event) {
    if (event.button === 2) {
      stopCameraLook();
    }
  }

  function handleCanvasContextMenu(event) {
    if (event.target === domElement) {
      event.preventDefault();
    }
  }

  function handleWindowKeyDown(event) {
    if (disposed || event.defaultPrevented || isEditableTarget(event.target)) {
      return;
    }

    if (!isCameraLookActive) {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
        clearMovementKeys?.();
        event.preventDefault();
        event.stopPropagation();
      }
      switch (event.code) {
        case "KeyQ":
          setMode("select");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyW":
          setMode("translate");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyE":
          setMode("rotate");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyR":
          setMode("scale");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "Delete":
        case "Backspace":
          hideSelected();
          event.preventDefault();
          event.stopPropagation();
          return;
        default:
          break;
      }
    }
  }

  function handleWindowKeyUp(event) {
    if (disposed || isEditableTarget(event.target)) {
      return;
    }
    if (!isCameraLookActive && ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      clearMovementKeys?.();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function resolvePickedPropId(object) {
    let current = object;
    while (current) {
      const propId = readText(current.userData?.propId, "");
      if (propId) {
        return propId;
      }
      current = current.parent || null;
    }
    return "";
  }

  function resolvePickedGeneratedNodeId(object) {
    let current = object;
    while (current) {
      const shellNodeId = readText(current.userData?.generatedShellNodeId, "");
      if (shellNodeId) {
        return shellNodeId;
      }
      current = current.parent || null;
    }
    return "";
  }

  function updatePickRaycaster(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }

    pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pickRaycaster.setFromCamera(pickPointer, camera);
    return true;
  }

  function pickPropIdAtClientPosition(clientX, clientY) {
    if (!updatePickRaycaster(clientX, clientY)) {
      return "";
    }

    const editableRoots = getEditableIds()
      .map((id) => sceneContext.getEditablePropObject?.(id))
      .filter((object) => object?.visible !== false);
    if (!editableRoots.length) {
      return "";
    }

    const hits = pickRaycaster.intersectObjects(editableRoots, true);
    for (const hit of hits) {
      const propId = resolvePickedPropId(hit.object);
      if (propId) {
        return propId;
      }
    }
    return "";
  }

  function pickGeneratedNodeIdAtClientPosition(clientX, clientY) {
    if (!updatePickRaycaster(clientX, clientY)) {
      return "";
    }

    const objects = getGeneratedEntries()
      .map((entry) => entry.object)
      .filter((object) => object?.visible !== false);
    if (!objects.length) {
      return "";
    }

    const hits = pickRaycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      const shellNodeId = resolvePickedGeneratedNodeId(hit.object);
      if (shellNodeId) {
        return shellNodeId;
      }
    }
    return "";
  }

  function hideSelected() {
    const selectedType = getSelectedType();
    if (selectedType === "prop" && selectedPropId) {
      if (sceneContext.setEditablePropVisible?.(selectedPropId, false, { markDirty: true })) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Hid ${selectedPropId} locally.`, "success");
      }
      return;
    }

    if (selectedType === "generated" && selectedGeneratedNodeId) {
      const entry = getSelectedGeneratedEntry();
      if (catalogSystem?.setGeneratedShellNodeVisible?.(selectedGeneratedNodeId, false)) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Hid ${entry?.label || selectedGeneratedNodeId} locally.`, "success");
      }
    }
  }

  function restoreSelected() {
    const selectedType = getSelectedType();
    if (selectedType === "prop" && selectedPropId) {
      if (sceneContext.setEditablePropVisible?.(selectedPropId, true, { markDirty: true })) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Restored ${selectedPropId}.`, "success");
      }
      return;
    }

    if (selectedType === "generated" && selectedGeneratedNodeId) {
      const entry = getSelectedGeneratedEntry();
      if (catalogSystem?.setGeneratedShellNodeVisible?.(selectedGeneratedNodeId, true)) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Restored ${entry?.label || selectedGeneratedNodeId}.`, "success");
      }
    }
  }

  function restoreSelectedRoom() {
    const entry = getSelectedGeneratedEntry();
    if (!entry) {
      setStatus("Select a generated shell piece first.", "warn");
      return;
    }

    const restored = catalogSystem?.restoreGeneratedShellRoom?.(entry.roomId) || 0;
    onSceneMutated?.();
    refreshOutliner();
    setStatus(`Restored ${restored} shell pieces in ${entry.roomId}.`, "success");
  }

  function handleCanvasClick(event) {
    if (disposed || isTransformDragging || isCameraLookActive || event.defaultPrevented || event.button !== 0) {
      return;
    }
    if (event.target !== domElement) {
      return;
    }
    suppressPointerLock();

    const pickedPropId = pickPropIdAtClientPosition(event.clientX, event.clientY);
    if (pickedPropId) {
      if (selectProp(pickedPropId)) {
        const state = getSelectedPropState();
        setStatus(
          readText(state?.sourcePath, "")
            ? `Selected ${pickedPropId} from ${state.sourcePath}.`
            : `Selected ${pickedPropId}.`,
          "muted"
        );
      }
      return;
    }

    const pickedGeneratedNodeId = pickGeneratedNodeIdAtClientPosition(event.clientX, event.clientY);
    if (!pickedGeneratedNodeId) {
      return;
    }
    if (selectGeneratedNode(pickedGeneratedNodeId)) {
      const entry = getSelectedGeneratedEntry();
      setStatus(
        entry
          ? `Selected ${entry.label} from ${entry.sourcePath}.`
          : `Selected ${pickedGeneratedNodeId}.`,
        "muted"
      );
    }
  }

  transformControls.addEventListener("dragging-changed", (event) => {
    if (disposed) {
      return;
    }
    isTransformDragging = Boolean(event?.value);
    if (event?.value) {
      suppressPointerLock();
      return;
    }
    if (selectedPropId) {
      sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: true });
      onSceneMutated?.();
      refreshReadout();
    }
  });

  transformControls.addEventListener("objectChange", () => {
    if (disposed || !selectedPropId) {
      return;
    }
    sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: false });
    refreshSelectionHighlight();
    refreshReadout();
  });

  propList?.addEventListener("change", () => {
    const nextId = readText(propList.value, "");
    selectProp(nextId);
  });

  generatedList?.addEventListener("change", () => {
    const nextId = readText(generatedList.value, "");
    selectGeneratedNode(nextId);
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
    setStatus("Outliners refreshed.", "muted");
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
  copyPathButton?.addEventListener("click", () => {
    void copySelectedPathToClipboard();
  });
  copyButton?.addEventListener("click", () => {
    void copyStateToClipboard();
  });
  exportLocalButton?.addEventListener("click", () => {
    void exportStateToConfig("local");
  });
  exportDefaultsButton?.addEventListener("click", () => {
    void exportStateToConfig("defaults");
  });
  hideSelectedButton?.addEventListener("click", () => {
    hideSelected();
  });
  restoreSelectedButton?.addEventListener("click", () => {
    restoreSelected();
  });
  restoreRoomButton?.addEventListener("click", () => {
    restoreSelectedRoom();
  });
  domElement.addEventListener("mousedown", handleCanvasMouseDown);
  domElement.addEventListener("contextmenu", handleCanvasContextMenu);
  domElement.addEventListener("click", handleCanvasClick);
  window.addEventListener("mousemove", handleWindowMouseMove, true);
  window.addEventListener("mouseup", handleWindowMouseUp, true);
  window.addEventListener("keydown", handleWindowKeyDown, true);
  window.addEventListener("keyup", handleWindowKeyUp, true);
  window.addEventListener("blur", stopCameraLook);

  if (exportLocalButton) {
    exportLocalButton.disabled = typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function";
  }
  if (exportDefaultsButton) {
    exportDefaultsButton.disabled = typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function";
  }

  setSnapEnabled(true);
  setMode("select");
  refreshOutliner();
  setStatus(
    typeof readSceneConfig === "function" && typeof writeSceneConfig === "function"
      ? `Ready. ${getEditableIds().length} props and ${getGeneratedEntries().length} generated shell pieces available. Export writes scene.json editor overrides.`
      : `Ready. ${getEditableIds().length} props and ${getGeneratedEntries().length} generated shell pieces available.`,
    "muted"
  );

  return {
    selectProp,
    selectGeneratedNode,
    refreshOutliner,
    loadSavedState,
    saveState,
    clearState,
    getSnapshot: () => ({
      selectionType: getSelectedType(),
      selectedPropId,
      selectedGeneratedNodeId,
      selectedSourcePath:
        readText(getSelectedPropState()?.sourcePath, "") ||
        readText(getSelectedGeneratedEntry()?.sourcePath, ""),
      mode: activeMode,
      propCount: getEditableIds().length,
      generatedCount: getGeneratedEntries().length,
      hiddenPropCount: sceneContext.getHiddenEditablePropIds?.().length || 0,
      hiddenGeneratedCount: catalogSystem?.getHiddenGeneratedShellNodeIds?.().length || 0,
      hasStoredState: Boolean(readStoredState())
    }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopCameraLook();
      window.removeEventListener("blur", stopCameraLook);
      window.removeEventListener("mousemove", handleWindowMouseMove, true);
      window.removeEventListener("mouseup", handleWindowMouseUp, true);
      window.removeEventListener("keydown", handleWindowKeyDown, true);
      window.removeEventListener("keyup", handleWindowKeyUp, true);
      domElement.removeEventListener("mousedown", handleCanvasMouseDown);
      domElement.removeEventListener("contextmenu", handleCanvasContextMenu);
      domElement.removeEventListener("click", handleCanvasClick);
      transformControls.detach();
      scene.remove(transformControls);
      transformControls.dispose();
      scene.remove(selectionHelper);
      root.remove();
    }
  };
}
