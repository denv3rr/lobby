import * as THREE from "three";

function hasUrlTarget(target) {
  const url = typeof target?.url === "string" ? target.url.trim() : "";
  return Boolean(url);
}

export class PortalInteractionSystem {
  constructor({
    domElement,
    camera,
    targets,
    isPointerLocked,
    onHover,
    onActivate
  }) {
    this.domElement = domElement;
    this.camera = camera;
    this.targets = [];
    this.isPointerLocked = isPointerLocked || (() => false);
    this.onHover = onHover;
    this.onActivate = onActivate;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(0, 0);
    this.hoveredTarget = null;
    this.hitboxToTarget = new Map();
    this.hitboxes = [];
    this.setTargets(targets || []);

    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundClick = (event) => this.onClick(event);

    this.domElement.addEventListener("pointermove", this.boundPointerMove, { passive: true });
    this.domElement.addEventListener("click", this.boundClick);
  }

  onPointerMove(event) {
    if (this.isPointerLocked()) {
      return;
    }

    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onClick(event) {
    if (event.target.closest("[data-ui]")) {
      return;
    }

    if (this.hoveredTarget && this.onActivate) {
      this.onActivate(this.hoveredTarget);
    }
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
    if (!this.hitboxes.length) {
      this.setHovered(null);
      return;
    }

    const sample = this.isPointerLocked() ? { x: 0, y: 0 } : this.pointer;
    this.raycaster.setFromCamera(sample, this.camera);

    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) {
      this.setHovered(null);
      return;
    }

    const target = this.hitboxToTarget.get(hits[0].object) || null;
    this.setHovered(target);
  }

  debugPickAtNdc(x = 0, y = 0) {
    if (!this.hitboxes.length) {
      return null;
    }

    this.raycaster.setFromCamera({ x, y }, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (!hits.length) {
      return null;
    }

    return this.hitboxToTarget.get(hits[0].object) || null;
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
    if (!this.hitboxes.length) {
      return null;
    }

    const xs = [-0.85, -0.5, -0.2, 0, 0.2, 0.5, 0.85];
    const ys = [-0.6, -0.3, 0, 0.3, 0.6];
    for (const y of ys) {
      for (const x of xs) {
        const hit = this.debugPickAtNdc(x, y);
        if (hasUrlTarget(hit)) {
          return hit;
        }
      }
    }
    return null;
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
    this.domElement.removeEventListener("click", this.boundClick);
    this.setHovered(null);
  }
}
