import * as THREE from "three";
import { resolvePositionAgainstColliders } from "./collision.js";

function angleLerp(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

export class MobileControls {
  constructor({
    domElement,
    camera,
    player,
    pitch,
    floorY,
    roomBounds,
    getColliders,
    onMoveDistance
  }) {
    this.domElement = domElement;
    this.camera = camera;
    this.player = player;
    this.pitch = pitch;
    this.floorY = floorY || 0;
    this.roomBounds = roomBounds;
    this.getColliders = getColliders;
    this.onMoveDistance = onMoveDistance;

    this.speed = 4.1;
    this.lookSensitivity = 0.003;
    this.targetPosition = null;
    this.activePointerId = null;
    this.pointerDownAt = 0;
    this.lastPoint = { x: 0, y: 0 };
    this.dragDistance = 0;
    this.collisionRadius = 0.42;
    this.collisionSampleHeightOffset = 0.9;

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.floorY);
    this.tmpHit = new THREE.Vector3();

    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);

    this.domElement.addEventListener("pointerdown", this.boundPointerDown, {
      passive: true
    });
    this.domElement.addEventListener("pointermove", this.boundPointerMove, {
      passive: true
    });
    this.domElement.addEventListener("pointerup", this.boundPointerUp, {
      passive: true
    });
    this.domElement.addEventListener("pointercancel", this.boundPointerUp, {
      passive: true
    });
  }

  onPointerDown(event) {
    if (event.target.closest("[data-ui]")) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.pointerDownAt = performance.now();
    this.dragDistance = 0;
    this.lastPoint.x = event.clientX;
    this.lastPoint.y = event.clientY;
  }

  onPointerMove(event) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const dx = event.clientX - this.lastPoint.x;
    const dy = event.clientY - this.lastPoint.y;
    this.lastPoint.x = event.clientX;
    this.lastPoint.y = event.clientY;

    const delta = Math.hypot(dx, dy);
    this.dragDistance += delta;

    if (delta > 0) {
      this.player.rotation.y -= dx * this.lookSensitivity;
      this.pitch.rotation.x = THREE.MathUtils.clamp(
        this.pitch.rotation.x - dy * this.lookSensitivity,
        -Math.PI * 0.42,
        Math.PI * 0.42
      );
    }
  }

  onPointerUp(event) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const elapsed = performance.now() - this.pointerDownAt;
    const wasTap = this.dragDistance < 12 && elapsed < 260;

    if (wasTap && !event.target.closest("[data-ui]")) {
      this.setTapTarget(event.clientX, event.clientY);
    }

    this.activePointerId = null;
    this.dragDistance = 0;
  }

  setTapTarget(clientX, clientY) {
    const x = (clientX / window.innerWidth) * 2 - 1;
    const y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera({ x, y }, this.camera);
    if (this.raycaster.ray.intersectPlane(this.floorPlane, this.tmpHit)) {
      this.targetPosition = this.tmpHit.clone();
    }
  }

  update(deltaTime) {
    if (!this.targetPosition) {
      return 0;
    }

    const toTarget = new THREE.Vector3(
      this.targetPosition.x - this.player.position.x,
      0,
      this.targetPosition.z - this.player.position.z
    );
    const distance = toTarget.length();

    if (distance <= 0.12) {
      this.targetPosition = null;
      return 0;
    }

    toTarget.normalize();
    const step = Math.min(distance, this.speed * deltaTime);
    const before = this.player.position.clone();
    this.player.position.addScaledVector(toTarget, step);

    if (this.roomBounds) {
      this.player.position.x = THREE.MathUtils.clamp(
        this.player.position.x,
        this.roomBounds.minX,
        this.roomBounds.maxX
      );
      this.player.position.z = THREE.MathUtils.clamp(
        this.player.position.z,
        this.roomBounds.minZ,
        this.roomBounds.maxZ
      );
    }

    resolvePositionAgainstColliders({
      position: this.player.position,
      colliders: this.getColliders?.(),
      radius: this.collisionRadius,
      sampleY: this.player.position.y - this.collisionSampleHeightOffset
    });

    const targetYaw = Math.atan2(toTarget.x, -toTarget.z);
    this.player.rotation.y = angleLerp(this.player.rotation.y, targetYaw, 0.1);

    const moved = before.distanceTo(this.player.position);
    if (moved > 0 && this.onMoveDistance) {
      this.onMoveDistance(moved);
    }
    return moved;
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this.boundPointerDown);
    this.domElement.removeEventListener("pointermove", this.boundPointerMove);
    this.domElement.removeEventListener("pointerup", this.boundPointerUp);
    this.domElement.removeEventListener("pointercancel", this.boundPointerUp);
  }
}
