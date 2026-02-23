import * as THREE from "three";

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
    for (const target of this.targets) {
      this.hitboxToTarget.set(target.hitbox, target);
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
    const sample = this.isPointerLocked() ? { x: 0, y: 0 } : this.pointer;
    this.raycaster.setFromCamera(sample, this.camera);

    const hitboxes = this.targets.map((target) => target.hitbox);
    const hits = this.raycaster.intersectObjects(hitboxes, false);
    if (!hits.length) {
      this.setHovered(null);
      return;
    }

    const target = this.hitboxToTarget.get(hits[0].object) || null;
    this.setHovered(target);
  }

  dispose() {
    this.domElement.removeEventListener("pointermove", this.boundPointerMove);
    this.domElement.removeEventListener("click", this.boundClick);
    this.setHovered(null);
  }
}
