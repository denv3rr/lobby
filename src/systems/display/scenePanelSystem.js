import * as THREE from "three";

import { resolvePublicPath } from "../../utils/path.js";

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class ScenePanelSystem {
  constructor({
    domElement,
    camera,
    scene = null,
    panels = [],
    onOpenUrl = null,
    isPointerLocked = null,
    updateIntervalMs = 100
  }) {
    this.domElement = domElement || null;
    this.camera = camera || null;
    this.scene = scene || null;
    this.onOpenUrl = typeof onOpenUrl === "function" ? onOpenUrl : null;
    this.isPointerLocked = typeof isPointerLocked === "function" ? isPointerLocked : () => false;
    this.layer = null;
    this.panelEntries = [];
    this.gallerySelections = new Map();
    this.worldCenter = new THREE.Vector3();
    this.worldNormal = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.cameraWorldPosition = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.toPanelDirection = new THREE.Vector3();
    this.cameraSpacePoint = new THREE.Vector3();
    this.occlusionDirection = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.worldCorners = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ];
    this.updateIntervalMs = clamp(Number(updateIntervalMs) || 100, 33, 250);
    this.lastUpdateAt = -Infinity;
    this.collectPerfStats = false;
    this.perfStats = {
      lastUpdateMs: 0,
      lastUpdateAt: 0,
      lastUpdateAttemptAt: 0,
      updateIntervalMs: this.updateIntervalMs,
      skippedUpdates: 0,
      visiblePanelCount: 0,
      hiddenPanelCount: 0,
      panelCount: 0,
      occlusionChecks: 0,
      raycastCalls: 0
    };

    this.setPanels(panels);
  }

  ensureLayer() {
    if (this.layer?.isConnected) {
      return this.layer;
    }

    const host = this.domElement?.parentElement || document.body;
    const layer = document.createElement("div");
    layer.className = "scene-panel-layer";
    host.appendChild(layer);
    this.layer = layer;
    return layer;
  }

  clearPanels() {
    for (const entry of this.panelEntries) {
      entry.root?.remove?.();
    }
    this.panelEntries = [];
    this.perfStats.panelCount = 0;
    this.perfStats.visiblePanelCount = 0;
    this.perfStats.hiddenPanelCount = 0;
  }

  markPointerLockSuppressed(durationMs = 320) {
    if (!this.domElement?.dataset) {
      return;
    }
    this.domElement.dataset.pointerLockSuppressedUntil = String(performance.now() + durationMs);
  }

  bindUiControl(element, { blurOnClick = false } = {}) {
    if (!element) {
      return element;
    }

    this.disableElementDrag(element);
    element.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this.markPointerLockSuppressed();
    });
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.markPointerLockSuppressed();
      if (blurOnClick && typeof element.blur === "function") {
        queueMicrotask(() => element.blur());
      }
    });
    return element;
  }

  disableElementDrag(element) {
    if (!element) {
      return element;
    }
    if ("draggable" in element) {
      element.draggable = false;
    }
    element.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    return element;
  }

  syncPointerLockState(pointerLocked) {
    const pointerEvents = pointerLocked ? "none" : "auto";
    for (const entry of this.panelEntries) {
      if (entry?.frame) {
        entry.frame.style.pointerEvents = pointerEvents;
      }
    }
  }

  createPanelScaffold(panel) {
    const layer = this.ensureLayer();
    const root = document.createElement("section");
    root.className = "scene-panel hidden";
    root.dataset.panelId = panel.id;
    root.dataset.ui = "true";
    const accent = readText(panel.accent, "");
    if (accent) {
      root.style.setProperty("--scene-panel-accent", accent);
    }

    const frame = document.createElement("div");
    frame.className = "scene-panel-frame";
    frame.dataset.ui = "true";

    const header = document.createElement("div");
    header.className = "scene-panel-header";
    header.dataset.ui = "true";

    const title = document.createElement("div");
    title.className = "scene-panel-title";
    title.textContent = readText(panel.title, "Gallery");
    title.dataset.ui = "true";

    const subtitle = document.createElement("div");
    subtitle.className = "scene-panel-subtitle";
    subtitle.textContent = readText(panel.subtitle, "");
    subtitle.classList.toggle("hidden", !subtitle.textContent);
    subtitle.dataset.ui = "true";

    header.appendChild(title);
    header.appendChild(subtitle);
    frame.appendChild(header);
    root.appendChild(frame);
    layer.appendChild(root);

    return {
      root,
      frame,
      header
    };
  }

  createPanelFooter(panel, frame) {
    const footer = document.createElement("div");
    footer.className = "scene-panel-footer";
    footer.dataset.ui = "true";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-panel-button";
    button.textContent = readText(panel.cta?.label, "Visit the project site");
    button.disabled = !readText(panel.cta?.url, "");
    button.dataset.ui = "true";
    this.bindUiControl(button, { blurOnClick: true });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = readText(panel.cta?.url, "");
      if (!url || !this.onOpenUrl) {
        return;
      }
      void this.onOpenUrl(url, panel);
    });

    footer.appendChild(button);
    footer.classList.toggle("hidden", !readText(panel.cta?.url, ""));
    frame.appendChild(footer);

    return {
      footer,
      button
    };
  }

  createScrollGalleryPanel(panel) {
    const { root, frame } = this.createPanelScaffold(panel);
    const scroll = document.createElement("div");
    scroll.className = "scene-panel-scroll";
    scroll.dataset.ui = "true";

    if (Array.isArray(panel.images) && panel.images.length) {
      panel.images.forEach((imageUrl, index) => {
        const figure = document.createElement("figure");
        figure.className = "scene-panel-shot";
        figure.dataset.ui = "true";

        const image = document.createElement("img");
        image.className = "scene-panel-shot-image";
        image.src = resolvePublicPath(imageUrl);
        image.alt = `${readText(panel.title, "Gallery")} screenshot ${index + 1}`;
        image.loading = "lazy";
        image.decoding = "async";
        image.dataset.ui = "true";

        figure.appendChild(image);
        scroll.appendChild(figure);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "scene-panel-empty";
      empty.textContent = readText(panel.emptyLabel, "Gallery images coming soon.");
      empty.dataset.ui = "true";
      scroll.appendChild(empty);
    }

    frame.appendChild(scroll);
    const { footer, button } = this.createPanelFooter(panel, frame);

    return {
      ...panel,
      root,
      frame,
      scroll,
      footer,
      button
    };
  }

  getGalleryId(panel) {
    const galleryId = readText(panel?.galleryId, "");
    return galleryId || readText(panel?.id, "");
  }

  getEffectivePanelImages(panel) {
    if (Array.isArray(panel?.images) && panel.images.length) {
      return panel.images;
    }

    const galleryId = this.getGalleryId(panel);
    if (!galleryId) {
      return [];
    }

    const source = this.panelEntries.find(
      (entry) =>
        entry !== panel &&
        this.getGalleryId(entry) === galleryId &&
        Array.isArray(entry.images) &&
        entry.images.length
    );
    return Array.isArray(source?.images) ? source.images : [];
  }

  getGallerySelection(galleryId, imageCount = 0) {
    if (!galleryId || imageCount <= 0) {
      return 0;
    }

    const current = Number(this.gallerySelections.get(galleryId));
    const clamped = clamp(Number.isFinite(current) ? current : 0, 0, imageCount - 1);
    this.gallerySelections.set(galleryId, clamped);
    return clamped;
  }

  setGallerySelection(galleryId, index) {
    const id = readText(galleryId, "");
    if (!id) {
      return;
    }

    const galleryPanels = this.panelEntries.filter((entry) => this.getGalleryId(entry) === id);
    const sourceEntry = galleryPanels.find((entry) => this.getEffectivePanelImages(entry).length) || null;
    const imageCount = this.getEffectivePanelImages(sourceEntry).length;
    if (!imageCount) {
      return;
    }

    const nextIndex = clamp(Number(index) || 0, 0, imageCount - 1);
    this.gallerySelections.set(id, nextIndex);
    this.syncGalleryPanels(id);
  }

  createGalleryThumbnailPanel(panel) {
    const { root, frame } = this.createPanelScaffold(panel);
    const strip = document.createElement("div");
    strip.className = "scene-panel-gallery-strip";
    strip.dataset.ui = "true";
    const thumbButtons = [];
    const galleryId = this.getGalleryId(panel);

    if (Array.isArray(panel.images) && panel.images.length) {
      panel.images.forEach((imageUrl, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "scene-panel-gallery-button";
        button.dataset.ui = "true";
        button.dataset.index = String(index);
        this.bindUiControl(button, { blurOnClick: true });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.setGallerySelection(galleryId, index);
        });

        const image = document.createElement("img");
        image.className = "scene-panel-gallery-thumb";
        image.src = resolvePublicPath(imageUrl);
        image.alt = `${readText(panel.title, "Gallery")} thumbnail ${index + 1}`;
        image.loading = "lazy";
        image.decoding = "async";
        image.dataset.ui = "true";
        this.disableElementDrag(image);

        button.appendChild(image);
        strip.appendChild(button);
        thumbButtons.push(button);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "scene-panel-empty";
      empty.textContent = readText(panel.emptyLabel, "Gallery images coming soon.");
      empty.dataset.ui = "true";
      strip.appendChild(empty);
    }

    frame.appendChild(strip);
    const { footer, button } = this.createPanelFooter(panel, frame);

    return {
      ...panel,
      root,
      frame,
      strip,
      thumbButtons,
      footer,
      button
    };
  }

  createGalleryPreviewPanel(panel) {
    const { root, frame } = this.createPanelScaffold(panel);
    const preview = document.createElement("div");
    preview.className = "scene-panel-gallery-preview";
    preview.dataset.ui = "true";

    const stage = document.createElement("div");
    stage.className = "scene-panel-gallery-preview-stage";
    stage.dataset.ui = "true";

    const image = document.createElement("img");
    image.className = "scene-panel-gallery-preview-image hidden";
    image.loading = "eager";
    image.decoding = "async";
    image.dataset.ui = "true";
    this.disableElementDrag(image);

    stage.appendChild(image);
    preview.appendChild(stage);

    const caption = document.createElement("div");
    caption.className = "scene-panel-gallery-caption";
    caption.dataset.ui = "true";
    preview.appendChild(caption);

    frame.appendChild(preview);
    const { footer, button } = this.createPanelFooter(panel, frame);

    return {
      ...panel,
      root,
      frame,
      preview,
      previewImage: image,
      previewCaption: caption,
      footer,
      button
    };
  }

  createInfoPanel(panel) {
    const { root, frame } = this.createPanelScaffold(panel);
    const content = document.createElement("div");
    content.className = "scene-panel-copy";
    content.dataset.ui = "true";

    const body = document.createElement("p");
    body.className = "scene-panel-body";
    body.textContent = readText(panel.body, "");
    body.classList.toggle("hidden", !body.textContent);
    body.dataset.ui = "true";
    content.appendChild(body);

    const tags = document.createElement("div");
    tags.className = "scene-panel-chip-list";
    tags.dataset.ui = "true";
    for (const tag of Array.isArray(panel.tags) ? panel.tags : []) {
      const chip = document.createElement("span");
      chip.className = "scene-panel-chip";
      chip.textContent = tag;
      chip.dataset.ui = "true";
      tags.appendChild(chip);
    }
    tags.classList.toggle("hidden", !tags.childElementCount);
    content.appendChild(tags);

    const bullets = document.createElement("ul");
    bullets.className = "scene-panel-bullets";
    bullets.dataset.ui = "true";
    for (const line of Array.isArray(panel.bullets) ? panel.bullets : []) {
      const item = document.createElement("li");
      item.className = "scene-panel-bullet";
      item.textContent = line;
      item.dataset.ui = "true";
      bullets.appendChild(item);
    }
    bullets.classList.toggle("hidden", !bullets.childElementCount);
    content.appendChild(bullets);

    frame.appendChild(content);
    const { footer, button } = this.createPanelFooter(panel, frame);

    return {
      ...panel,
      root,
      frame,
      content,
      body,
      tags,
      bullets,
      footer,
      button
    };
  }

  setPanels(panels = []) {
    this.clearPanels();
    const normalizedPanels = Array.isArray(panels) ? panels.filter((entry) => entry?.object) : [];
    this.panelEntries = normalizedPanels
      .map((panel) => {
        if (panel.type === "scroll-gallery") {
          return this.createScrollGalleryPanel(panel);
        }
        if (panel.type === "gallery-thumbnails") {
          return this.createGalleryThumbnailPanel(panel);
        }
        if (panel.type === "gallery-preview") {
          return this.createGalleryPreviewPanel(panel);
        }
        if (panel.type === "info-panel") {
          return this.createInfoPanel(panel);
        }
        return null;
      })
      .filter(Boolean);
    this.perfStats.panelCount = this.panelEntries.length;
    this.syncGalleryPanels();
  }

  syncGalleryPanels(targetGalleryId = "") {
    const galleryEntries = this.panelEntries.filter(
      (entry) => entry?.type === "gallery-thumbnails" || entry?.type === "gallery-preview"
    );
    if (!galleryEntries.length) {
      return;
    }

    const galleryIds = targetGalleryId
      ? [targetGalleryId]
      : [...new Set(galleryEntries.map((entry) => this.getGalleryId(entry)).filter(Boolean))];
    for (const galleryId of galleryIds) {
      const entries = galleryEntries.filter((entry) => this.getGalleryId(entry) === galleryId);
      if (!entries.length) {
        continue;
      }

      const imageSourceEntry =
        entries.find((entry) => this.getEffectivePanelImages(entry).length) || entries[0];
      const images = this.getEffectivePanelImages(imageSourceEntry);
      const imageCount = Array.isArray(images) ? images.length : 0;
      const selectedIndex = this.getGallerySelection(galleryId, imageCount);

      for (const entry of entries) {
        if (entry.type === "gallery-thumbnails") {
          entry.thumbButtons?.forEach((button, index) => {
            const selected = index === selectedIndex;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
          });
          continue;
        }

        if (entry.type !== "gallery-preview") {
          continue;
        }

        const previewImages = this.getEffectivePanelImages(entry);
        const imageUrl = previewImages[selectedIndex] || "";
        if (!imageUrl) {
          entry.previewImage?.removeAttribute("src");
          entry.previewImage?.classList.add("hidden");
          if (entry.previewCaption) {
            entry.previewCaption.textContent = readText(
              entry.emptyLabel,
              "Gallery images coming soon."
            );
          }
          continue;
        }

        if (entry.previewImage) {
          entry.previewImage.src = resolvePublicPath(imageUrl);
          entry.previewImage.alt = `${readText(entry.title, "Gallery")} screenshot ${selectedIndex + 1}`;
          entry.previewImage.classList.remove("hidden");
        }
        if (entry.previewCaption) {
          entry.previewCaption.textContent = `${selectedIndex + 1} / ${previewImages.length}`;
        }
      }
    }
  }

  hidePanel(entry) {
    if (!entry?.root) {
      return;
    }
    entry.root.classList.add("hidden");
    entry.root.style.transform = "translate(-200vw, -200vh)";
    entry.root.style.width = "0px";
    entry.root.style.height = "0px";
  }

  getPanelEntry(panelId) {
    const id = readText(panelId, "");
    if (!id) {
      return null;
    }
    return this.panelEntries.find((entry) => readText(entry?.id, "") === id) || null;
  }

  isPanelObject(object, panelObject) {
    let current = object;
    while (current) {
      if (current === panelObject) {
        return true;
      }
      current = current.parent || null;
    }
    return false;
  }

  isOccludingIntersection(intersection, panelObject, panelDistance) {
    const object = intersection?.object;
    if (!object?.visible || !Number.isFinite(intersection?.distance)) {
      return false;
    }
    if (intersection.distance >= panelDistance - 0.08) {
      return false;
    }
    if (this.isPanelObject(object, panelObject) || object.userData?.isInteractionHitbox) {
      return false;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      const opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
      const transmission = Number.isFinite(material.transmission) ? material.transmission : 0;
      if ((material.transparent && opacity < 0.72) || transmission > 0.2) {
        continue;
      }
      return true;
    }

    return false;
  }

  isOccludedAtPoint(entry, worldPoint, activeCamera = this.camera) {
    if (!this.scene || !entry?.object || !worldPoint) {
      return false;
    }

    this.occlusionDirection.copy(worldPoint).sub(this.cameraWorldPosition);
    const panelDistance = this.occlusionDirection.length();
    if (panelDistance <= 0.04) {
      return false;
    }
    this.occlusionDirection.multiplyScalar(1 / panelDistance);
    this.raycaster.set(this.cameraWorldPosition, this.occlusionDirection);
    this.raycaster.camera = activeCamera || null;
    this.raycaster.far = panelDistance - 0.04;

    if (this.collectPerfStats) {
      this.perfStats.occlusionChecks += 1;
      this.perfStats.raycastCalls += 1;
    }

    let intersections = [];
    try {
      intersections = this.raycaster.intersectObjects(this.scene.children, true);
    } catch {
      return false;
    }
    for (const intersection of intersections) {
      if (this.isOccludingIntersection(intersection, entry.object, panelDistance)) {
        return true;
      }
    }
    return false;
  }

  isOccluded(entry, activeCamera = this.camera) {
    return this.isOccludedAtPoint(entry, this.worldCenter, activeCamera);
  }

  computePanelRect(entry, activeCamera) {
    const bounds = this.domElement?.getBoundingClientRect?.();
    if (!entry?.object || !activeCamera || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    const localWidth = Math.max(0.2, Number(entry.localSize?.[0]) || 1);
    const localHeight = Math.max(0.2, Number(entry.localSize?.[1]) || 1);
    const projection = entry.projection || {};
    const minFacingDot = Number(projection.minFacingDot) || 0.08;
    const minLookDot = Number(projection.minLookDot) || 0.52;
    const maxViewportWidth = Number(projection.maxViewportWidth) || 0.76;
    const maxViewportHeight = Number(projection.maxViewportHeight) || 0.86;
    const maxViewportArea = Number(projection.maxViewportArea) || 0.42;
    const minPixelWidth = Number(projection.minPixelWidth) || 180;
    const minPixelHeight = Number(projection.minPixelHeight) || 120;
    const minPlaneDistance = Number(projection.minPlaneDistance) || 0.18;
    const projectedAxisLimit = Number(projection.projectedAxisLimit) || 1.24;
    const minAspectScale = Number(projection.minAspectScale) || 0.38;
    const maxAspectScale = Number(projection.maxAspectScale) || 2.8;

    entry.object.getWorldPosition(this.worldCenter);
    entry.object.getWorldQuaternion(this.worldQuaternion);
    this.worldNormal.set(0, 0, 1).applyQuaternion(this.worldQuaternion).normalize();

    activeCamera.getWorldPosition(this.cameraWorldPosition);
    activeCamera.getWorldDirection(this.cameraForward).normalize();
    this.toPanelDirection.copy(this.cameraWorldPosition).sub(this.worldCenter);
    this.cameraSpacePoint.copy(this.worldCenter).applyMatrix4(activeCamera.matrixWorldInverse);

    if (this.worldNormal.dot(this.toPanelDirection) <= minFacingDot) {
      return null;
    }
    if (Math.abs(this.toPanelDirection.dot(this.worldNormal)) <= minPlaneDistance) {
      return null;
    }
    if (this.cameraSpacePoint.z >= -0.12) {
      return null;
    }

    this.toPanelDirection.copy(this.worldCenter).sub(this.cameraWorldPosition).normalize();
    if (this.toPanelDirection.dot(this.cameraForward) < minLookDot) {
      return null;
    }
    if (this.isOccluded(entry, activeCamera)) {
      return null;
    }

    const halfWidth = localWidth * 0.5;
    const halfHeight = localHeight * 0.5;
    const localCorners = [
      [-halfWidth, halfHeight, 0.01],
      [halfWidth, halfHeight, 0.01],
      [halfWidth, -halfHeight, 0.01],
      [-halfWidth, -halfHeight, 0.01]
    ];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < this.worldCorners.length; index += 1) {
      const [x, y, z] = localCorners[index];
      const projected = this.worldCorners[index].set(x, y, z);
      entry.object.localToWorld(projected);
      if (this.isOccludedAtPoint(entry, projected, activeCamera)) {
        return null;
      }
      this.cameraSpacePoint.copy(projected).applyMatrix4(activeCamera.matrixWorldInverse);
      if (this.cameraSpacePoint.z >= -0.04) {
        return null;
      }
      projected.project(activeCamera);
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        Math.abs(projected.x) > projectedAxisLimit ||
        Math.abs(projected.y) > projectedAxisLimit ||
        projected.z < -1 ||
        projected.z > 1.2
      ) {
        return null;
      }

      const pixelX = ((projected.x + 1) * 0.5) * bounds.width;
      const pixelY = ((1 - projected.y) * 0.5) * bounds.height;
      minX = Math.min(minX, pixelX);
      minY = Math.min(minY, pixelY);
      maxX = Math.max(maxX, pixelX);
      maxY = Math.max(maxY, pixelY);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    const baseAspect = localWidth / localHeight;
    const projectedAspect = width / Math.max(1, height);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(area) ||
      width < minPixelWidth ||
      height < minPixelHeight ||
      width > bounds.width * maxViewportWidth ||
      height > bounds.height * maxViewportHeight ||
      area > bounds.width * bounds.height * maxViewportArea ||
      projectedAspect < baseAspect * minAspectScale ||
      projectedAspect > baseAspect * maxAspectScale ||
      maxX < 0 ||
      maxY < 0 ||
      minX > bounds.width ||
      minY > bounds.height
    ) {
      return null;
    }

    return {
      x: clamp(minX, -bounds.width, bounds.width * 2),
      y: clamp(minY, -bounds.height, bounds.height * 2),
      width,
      height
    };
  }

  debugProjectPanel(panelId, activeCamera = this.camera) {
    const entry = this.getPanelEntry(panelId);
    const bounds = this.domElement?.getBoundingClientRect?.();
    if (!entry) {
      return {
        id: readText(panelId, ""),
        ok: false,
        reason: "missing-panel"
      };
    }
    if (!entry?.object || !activeCamera || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      return {
        id: entry.id,
        ok: false,
        reason: "missing-prereq"
      };
    }

    const localWidth = Math.max(0.2, Number(entry.localSize?.[0]) || 1);
    const localHeight = Math.max(0.2, Number(entry.localSize?.[1]) || 1);
    const projection = entry.projection || {};
    const minFacingDot = Number(projection.minFacingDot) || 0.08;
    const minLookDot = Number(projection.minLookDot) || 0.52;
    const maxViewportWidth = Number(projection.maxViewportWidth) || 0.76;
    const maxViewportHeight = Number(projection.maxViewportHeight) || 0.86;
    const maxViewportArea = Number(projection.maxViewportArea) || 0.42;
    const minPixelWidth = Number(projection.minPixelWidth) || 180;
    const minPixelHeight = Number(projection.minPixelHeight) || 120;
    const minPlaneDistance = Number(projection.minPlaneDistance) || 0.18;
    const projectedAxisLimit = Number(projection.projectedAxisLimit) || 1.24;
    const minAspectScale = Number(projection.minAspectScale) || 0.38;
    const maxAspectScale = Number(projection.maxAspectScale) || 2.8;

    entry.object.getWorldPosition(this.worldCenter);
    entry.object.getWorldQuaternion(this.worldQuaternion);
    this.worldNormal.set(0, 0, 1).applyQuaternion(this.worldQuaternion).normalize();
    activeCamera.getWorldPosition(this.cameraWorldPosition);
    activeCamera.getWorldDirection(this.cameraForward).normalize();

    const snapshot = {
      id: entry.id,
      ok: false,
      hidden: entry.root?.classList?.contains("hidden") ?? null,
      localSize: [Number(localWidth.toFixed(4)), Number(localHeight.toFixed(4))],
      worldCenter: [
        Number(this.worldCenter.x.toFixed(4)),
        Number(this.worldCenter.y.toFixed(4)),
        Number(this.worldCenter.z.toFixed(4))
      ],
      worldNormal: [
        Number(this.worldNormal.x.toFixed(4)),
        Number(this.worldNormal.y.toFixed(4)),
        Number(this.worldNormal.z.toFixed(4))
      ],
      cameraPosition: [
        Number(this.cameraWorldPosition.x.toFixed(4)),
        Number(this.cameraWorldPosition.y.toFixed(4)),
        Number(this.cameraWorldPosition.z.toFixed(4))
      ],
      cameraForward: [
        Number(this.cameraForward.x.toFixed(4)),
        Number(this.cameraForward.y.toFixed(4)),
        Number(this.cameraForward.z.toFixed(4))
      ]
    };

    this.toPanelDirection.copy(this.cameraWorldPosition).sub(this.worldCenter);
    snapshot.facingDot = Number(this.worldNormal.dot(this.toPanelDirection).toFixed(4));
    snapshot.planeDistance = Number(Math.abs(this.toPanelDirection.dot(this.worldNormal)).toFixed(4));
    this.cameraSpacePoint.copy(this.worldCenter).applyMatrix4(activeCamera.matrixWorldInverse);
    snapshot.centerCameraSpaceZ = Number(this.cameraSpacePoint.z.toFixed(4));

    if (snapshot.facingDot <= minFacingDot) {
      return { ...snapshot, reason: "facing-dot" };
    }
    if (snapshot.planeDistance <= minPlaneDistance) {
      return { ...snapshot, reason: "plane-distance" };
    }
    if (this.cameraSpacePoint.z >= -0.12) {
      return { ...snapshot, reason: "center-camera-space" };
    }

    this.toPanelDirection.copy(this.worldCenter).sub(this.cameraWorldPosition).normalize();
    snapshot.lookDot = Number(this.toPanelDirection.dot(this.cameraForward).toFixed(4));
    if (snapshot.lookDot < minLookDot) {
      return { ...snapshot, reason: "look-dot" };
    }

    snapshot.centerOccluded = this.isOccludedAtPoint(entry, this.worldCenter, activeCamera);
    if (snapshot.centerOccluded) {
      return { ...snapshot, reason: "occluded-center" };
    }

    const halfWidth = localWidth * 0.5;
    const halfHeight = localHeight * 0.5;
    const localCorners = [
      [-halfWidth, halfHeight, 0.01],
      [halfWidth, halfHeight, 0.01],
      [halfWidth, -halfHeight, 0.01],
      [-halfWidth, -halfHeight, 0.01]
    ];
    const projectedCorners = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < this.worldCorners.length; index += 1) {
      const [x, y, z] = localCorners[index];
      const projected = this.worldCorners[index].set(x, y, z);
      entry.object.localToWorld(projected);
      if (this.isOccludedAtPoint(entry, projected, activeCamera)) {
        return { ...snapshot, reason: `occluded-corner-${index}`, projectedCorners };
      }
      this.cameraSpacePoint.copy(projected).applyMatrix4(activeCamera.matrixWorldInverse);
      if (this.cameraSpacePoint.z >= -0.04) {
        return { ...snapshot, reason: `corner-camera-space-${index}` };
      }
      projected.project(activeCamera);
      projectedCorners.push([
        Number(projected.x.toFixed(4)),
        Number(projected.y.toFixed(4)),
        Number(projected.z.toFixed(4))
      ]);
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        Math.abs(projected.x) > projectedAxisLimit ||
        Math.abs(projected.y) > projectedAxisLimit ||
        projected.z < -1 ||
        projected.z > 1.2
      ) {
        return { ...snapshot, reason: `corner-axis-${index}`, projectedCorners };
      }

      const pixelX = ((projected.x + 1) * 0.5) * bounds.width;
      const pixelY = ((1 - projected.y) * 0.5) * bounds.height;
      minX = Math.min(minX, pixelX);
      minY = Math.min(minY, pixelY);
      maxX = Math.max(maxX, pixelX);
      maxY = Math.max(maxY, pixelY);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    const baseAspect = localWidth / localHeight;
    const projectedAspect = width / Math.max(1, height);
    const metrics = {
      width: Number(width.toFixed(4)),
      height: Number(height.toFixed(4)),
      area: Number(area.toFixed(4)),
      projectedAspect: Number(projectedAspect.toFixed(4)),
      projectedCorners
    };

    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(area)) {
      return { ...snapshot, ...metrics, reason: "non-finite-size" };
    }
    if (width < minPixelWidth) {
      return { ...snapshot, ...metrics, reason: "min-pixel-width" };
    }
    if (height < minPixelHeight) {
      return { ...snapshot, ...metrics, reason: "min-pixel-height" };
    }
    if (width > bounds.width * maxViewportWidth) {
      return { ...snapshot, ...metrics, reason: "max-viewport-width" };
    }
    if (height > bounds.height * maxViewportHeight) {
      return { ...snapshot, ...metrics, reason: "max-viewport-height" };
    }
    if (area > bounds.width * bounds.height * maxViewportArea) {
      return { ...snapshot, ...metrics, reason: "max-viewport-area" };
    }
    if (projectedAspect < baseAspect * minAspectScale) {
      return { ...snapshot, ...metrics, reason: "min-aspect-scale" };
    }
    if (projectedAspect > baseAspect * maxAspectScale) {
      return { ...snapshot, ...metrics, reason: "max-aspect-scale" };
    }
    if (maxX < 0 || maxY < 0 || minX > bounds.width || minY > bounds.height) {
      return { ...snapshot, ...metrics, reason: "outside-viewport" };
    }

    return {
      ...snapshot,
      ...metrics,
      ok: true,
      rect: {
        x: Number(minX.toFixed(4)),
        y: Number(minY.toFixed(4)),
        width: Number(width.toFixed(4)),
        height: Number(height.toFixed(4))
      }
    };
  }

  update(activeCamera = this.camera) {
    const pointerLocked = this.isPointerLocked();
    this.syncPointerLockState(pointerLocked);

    const now = performance.now();
    const shouldRecompute = !Number.isFinite(this.lastUpdateAt)
      || now - this.lastUpdateAt >= this.updateIntervalMs;
    if (!shouldRecompute) {
      this.perfStats.skippedUpdates += 1;
      this.perfStats.updateIntervalMs = this.updateIntervalMs;
      this.perfStats.lastUpdateAttemptAt = now;
      this.perfStats.lastUpdateMs = 0;
      this.perfStats.panelCount = this.panelEntries.length;
      return;
    }

    const start = performance.now();
    this.collectPerfStats = true;
    this.perfStats.occlusionChecks = 0;
    this.perfStats.raycastCalls = 0;
    let visiblePanelCount = 0;
    let hiddenPanelCount = 0;
    try {
      for (const entry of this.panelEntries) {
        if (!entry?.object?.parent || entry.object.visible === false) {
          this.hidePanel(entry);
          hiddenPanelCount += 1;
          continue;
        }

        const rect = this.computePanelRect(entry, activeCamera);
        if (!rect) {
          this.hidePanel(entry);
          hiddenPanelCount += 1;
          continue;
        }

        entry.root.classList.remove("hidden");
        entry.root.style.transform = `translate(${rect.x.toFixed(2)}px, ${rect.y.toFixed(2)}px)`;
        entry.root.style.width = `${rect.width.toFixed(2)}px`;
        entry.root.style.height = `${rect.height.toFixed(2)}px`;
        visiblePanelCount += 1;
      }
    } finally {
      this.collectPerfStats = false;
    }
    const end = performance.now();
    this.lastUpdateAt = end;
    this.perfStats.lastUpdateMs = Number((end - start).toFixed(3));
    this.perfStats.lastUpdateAt = end;
    this.perfStats.lastUpdateAttemptAt = end;
    this.perfStats.updateIntervalMs = this.updateIntervalMs;
    this.perfStats.visiblePanelCount = visiblePanelCount;
    this.perfStats.hiddenPanelCount = hiddenPanelCount;
    this.perfStats.panelCount = this.panelEntries.length;
  }

  getPanelSnapshot(panelId) {
    const id = readText(panelId, "");
    if (!id) {
      return null;
    }
    const entry = this.panelEntries.find((panel) => panel?.id === id);
    if (!entry) {
      return null;
    }
    const effectiveImages = this.getEffectivePanelImages(entry);
    const galleryId = this.getGalleryId(entry);
    const selectedIndex = effectiveImages.length
      ? this.getGallerySelection(galleryId, effectiveImages.length)
      : null;
    return {
      id: entry.id,
      type: entry.type || null,
      imageCount: effectiveImages.length,
      selectedIndex,
      visible: Boolean(entry.root && !entry.root.classList.contains("hidden")),
      ctaUrl: readText(entry.cta?.url, ""),
      previewSrc:
        entry.type === "gallery-preview" ? readText(entry.previewImage?.getAttribute?.("src"), "") : "",
      previewCaption:
        entry.type === "gallery-preview" ? readText(entry.previewCaption?.textContent, "") : ""
    };
  }

  getPanelSnapshots() {
    return this.panelEntries
      .map((entry) => this.getPanelSnapshot(entry?.id))
      .filter(Boolean);
  }

  getDebugStats() {
    return {
      ...this.perfStats,
      panelCount: this.panelEntries.length
    };
  }

  activatePanelCta(panelId) {
    const entry = this.getPanelSnapshot(panelId);
    if (!entry?.ctaUrl || !this.onOpenUrl) {
      return false;
    }
    void this.onOpenUrl(entry.ctaUrl, this.panelEntries.find((panel) => panel?.id === entry.id) || null);
    return true;
  }

  dispose() {
    this.clearPanels();
    this.layer?.remove?.();
    this.layer = null;
  }
}
