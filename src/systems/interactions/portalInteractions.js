import * as THREE from "three";

function hasUrlTarget(target) {
  const url = typeof target?.url === "string" ? target.url.trim() : "";
  return Boolean(url);
}

function isPortalTarget(target) {
  return target?.type === "portal";
}

function isTargetInteractive(target) {
  if (!target?.hitbox) {
    return false;
  }
  if (target.hitbox.visible === false) {
    return false;
  }
  if (target.userData?.hiddenFromInteraction) {
    return false;
  }
  return true;
}

export class PortalInteractionSystem {
  constructor({
    domElement,
    camera,
    targets,
    isPointerLocked,
    syncMatrices,
    onHover,
    onActivate
  }) {
    this.domElement = domElement;
    this.camera = camera;
    this.targets = [];
    this.isPointerLocked = isPointerLocked || (() => false);
    this.syncMatrices = typeof syncMatrices === "function" ? syncMatrices : null;
    this.onHover = onHover;
    this.onActivate = onActivate;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(0, 0);
    this.hoveredTarget = null;
    this.hitboxToTarget = new Map();
    this.hitboxes = [];
    this.lastPickAt = -Infinity;
    this.lastActivationAt = -Infinity;
    this.pointerLockUpdateIntervalMs = 42;
    this.pointerUpdateIntervalMs = 28;
    this.setTargets(targets || []);

    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundClick = (event) => this.onClick(event);
    this.boundKeyDown = (event) => this.onKeyDown(event);

    this.domElement.addEventListener("pointermove", this.boundPointerMove, { passive: true });
    this.domElement.addEventListener("pointerdown", this.boundPointerDown);
    this.domElement.addEventListener("click", this.boundClick);
    window.addEventListener("keydown", this.boundKeyDown);
  }

  syncRaycastTransforms() {
    this.syncMatrices?.();
    if (typeof this.camera?.updateWorldMatrix === "function") {
      this.camera.updateWorldMatrix(true, false);
    } else {
      this.camera?.updateMatrixWorld?.(true);
    }
  }

  onPointerMove(event) {
    if (this.isPointerLocked()) {
      return;
    }

    this.updatePointerFromClientPosition(event.clientX, event.clientY);
  }

  updatePointerFromClientPosition(clientX, clientY) {
    const bounds = this.domElement?.getBoundingClientRect?.();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const normalizedX = (clientX - bounds.left) / bounds.width;
    const normalizedY = (clientY - bounds.top) / bounds.height;
    this.pointer.x = normalizedX * 2 - 1;
    this.pointer.y = -(normalizedY * 2 - 1);
  }

  isUiTarget(target) {
    return Boolean(target?.closest?.("[data-ui]"));
  }

  activateResolvedTarget(target) {
    if (!isTargetInteractive(target) || !this.onActivate) {
      return false;
    }
    this.lastActivationAt = performance.now();
    this.setHovered(target);
    this.onActivate(target);
    return true;
  }

  getHoveredInteractiveTarget() {
    return isTargetInteractive(this.hoveredTarget) ? this.hoveredTarget : null;
  }

  markPointerLockSuppressed(durationMs = 280) {
    if (!this.domElement?.dataset) {
      return;
    }
    this.domElement.dataset.pointerLockSuppressedUntil = String(performance.now() + durationMs);
  }

  resolveActivationTarget(
    event = null,
    { preferHovered = false, includeCenter = false, includeNearby = false } = {}
  ) {
    if (event && !this.isPointerLocked()) {
      this.updatePointerFromClientPosition(event.clientX, event.clientY);
    }

    const hoveredTarget = this.getHoveredInteractiveTarget();
    const pickedTarget = this.pickCurrentTarget(true);
    const candidates = preferHovered
      ? [hoveredTarget, pickedTarget]
      : [pickedTarget, hoveredTarget];

    if (includeCenter) {
      candidates.push(this.debugPickAtNdc(0, 0));
    }

    if (includeNearby) {
      candidates.push(this.pickNearbyTarget());
    }

    for (const candidate of candidates) {
      if (isTargetInteractive(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  peekActivationTarget(event = null) {
    if (event && this.isUiTarget(event.target)) {
      return null;
    }
    if (event && !this.isPointerLocked()) {
      this.updatePointerFromClientPosition(event.clientX, event.clientY);
    }
    return this.pickCurrentTarget(true) || this.getHoveredInteractiveTarget() || null;
  }

  pickNearbyTarget() {
    const centerX = this.isPointerLocked() ? 0 : this.pointer.x;
    const centerY = this.isPointerLocked() ? 0 : this.pointer.y;
    const offsets = [0, -0.06, 0.06, -0.12, 0.12, -0.2, 0.2];
    for (const offsetY of offsets) {
      for (const offsetX of offsets) {
        const candidate = this.debugPickAtNdc(centerX + offsetX, centerY + offsetY);
        if (candidate) {
          return candidate;
        }
      }
    }
    return null;
  }

  onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    if (this.isUiTarget(event.target)) {
      return;
    }

    const target = this.resolveActivationTarget(event, {
      preferHovered: !this.isPointerLocked(),
      includeCenter: this.isPointerLocked()
    });
    if (!target) {
      return;
    }

    event.preventDefault();
    this.markPointerLockSuppressed();
    this.activateResolvedTarget(target);
  }

  onClick(event) {
    if (this.isUiTarget(event.target)) {
      return;
    }

    if (performance.now() - this.lastActivationAt < 220) {
      return;
    }
    const target = this.resolveActivationTarget(event, {
      preferHovered: !this.isPointerLocked(),
      includeCenter: this.isPointerLocked()
    });
    if (target) {
      event.preventDefault();
    }
    this.activateResolvedTarget(target);
  }

  onKeyDown(event) {
    if (event.defaultPrevented) {
      return;
    }

    if (event.code !== "KeyE" && event.code !== "Enter") {
      return;
    }

    const target =
      this.getHoveredInteractiveTarget() ||
      this.resolveActivationTarget(null, {
        preferHovered: true,
        includeCenter: true
      }) ||
      this.debugPickAtNdc(0, 0) ||
      null;
    if (!target) {
      return;
    }

    event.preventDefault();
    this.activateResolvedTarget(target);
  }

  setTargets(targets = []) {
    this.targets = Array.isArray(targets) ? targets.filter((item) => item?.hitbox) : [];
    this.hitboxToTarget.clear();
    this.hitboxes = [];
    for (const target of this.targets) {
      this.hitboxToTarget.set(target.hitbox, target);
      this.hitboxes.push(target.hitbox);
    }
    if (this.hoveredTarget && !this.targets.includes(this.hoveredTarget)) {
      this.setHovered(null);
    }
  }

  setHovered(target) {
    if (this.hoveredTarget === target) {
      return;
    }

    if (this.hoveredTarget) {
      this.hoveredTarget.setHovered(false);
    }

    this.hoveredTarget = target;

    if (this.hoveredTarget) {
      this.hoveredTarget.setHovered(true);
    }

    if (this.onHover) {
      this.onHover(this.hoveredTarget);
    }
  }

  update() {
    const target = this.pickCurrentTarget(false);
    if (target === undefined) {
      return;
    }
    this.setHovered(target);
  }

  pickCurrentTarget(force = false) {
    if (!this.hitboxes.length) {
      return null;
    }

    const now = performance.now();
    const minInterval = this.isPointerLocked()
      ? this.pointerLockUpdateIntervalMs
      : this.pointerUpdateIntervalMs;
    if (!force && this.lastPickAt >= 0 && now - this.lastPickAt < minInterval) {
      return undefined;
    }
    this.lastPickAt = now;

    this.syncRaycastTransforms();
    const sample = this.isPointerLocked() ? { x: 0, y: 0 } : this.pointer;
    this.raycaster.setFromCamera(sample, this.camera);

    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) {
      return null;
    }

    for (const hit of hits) {
      const candidate = this.hitboxToTarget.get(hit.object) || null;
      if (isTargetInteractive(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  debugPickAtNdc(x = 0, y = 0) {
    if (!this.hitboxes.length) {
      return null;
    }

    this.syncRaycastTransforms();
    this.raycaster.setFromCamera({ x, y }, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) {
      return null;
    }

    for (const hit of hits) {
      const target = this.hitboxToTarget.get(hit.object) || null;
      if (isTargetInteractive(target)) {
        return target;
      }
    }
    return null;
  }

  debugFindAnyTargetHit() {
    if (!this.hitboxes.length) {
      return null;
    }

    const xs = [-0.85, -0.5, -0.2, 0, 0.2, 0.5, 0.85];
    const ys = [-0.6, -0.3, 0, 0.3, 0.6];
    for (const y of ys) {
      for (const x of xs) {
        const hit = this.debugPickAtNdc(x, y);
        if (hit) {
          return hit;
        }
      }
    }
    return null;
  }

  debugFindAnyUrlTargetHit() {
    return this.debugFindAnyMatchingTarget((target) => hasUrlTarget(target));
  }

  debugFindAnyPortalHit() {
    return this.debugFindAnyMatchingTarget((target) => isPortalTarget(target));
  }

  debugFindAnyMatchingTarget(match) {
    if (!this.hitboxes.length) {
      return null;
    }

    const xs = [-0.85, -0.5, -0.2, 0, 0.2, 0.5, 0.85];
    const ys = [-0.6, -0.3, 0, 0.3, 0.6];
    for (const y of ys) {
      for (const x of xs) {
        const hit = this.debugPickAtNdc(x, y);
        if (match(hit)) {
          return hit;
        }
      }
    }
    return null;
  }

  debugActivateAnyPortal() {
    const hoveredPortal = isPortalTarget(this.hoveredTarget) ? this.hoveredTarget : null;
    const centerTarget = this.debugPickAtNdc(0, 0);
    const centerPortal = isPortalTarget(centerTarget) ? centerTarget : null;
    const anyPortal = this.debugFindAnyPortalHit();
    const target = hoveredPortal || centerPortal || anyPortal || null;
    if (!target || !this.onActivate) {
      return false;
    }
    this.setHovered(target);
    this.onActivate(target);
    return true;
  }

  debugActivateHoveredOrAnyTarget() {
    const hoveredUrlTarget = hasUrlTarget(this.hoveredTarget) ? this.hoveredTarget : null;
    const centerTarget = this.debugPickAtNdc(0, 0);
    const centerUrlTarget = hasUrlTarget(centerTarget) ? centerTarget : null;
    const anyUrlTarget = this.debugFindAnyUrlTargetHit();
    const target =
      hoveredUrlTarget ||
      centerUrlTarget ||
      anyUrlTarget ||
      this.hoveredTarget ||
      centerTarget ||
      this.debugFindAnyTargetHit() ||
      null;
    if (!target || !this.onActivate) {
      return false;
    }
    this.setHovered(target);
    this.onActivate(target);
    return true;
  }

  dispose() {
    this.domElement.removeEventListener("pointermove", this.boundPointerMove);
    this.domElement.removeEventListener("pointerdown", this.boundPointerDown);
    this.domElement.removeEventListener("click", this.boundClick);
    window.removeEventListener("keydown", this.boundKeyDown);
    this.setHovered(null);
  }
}
