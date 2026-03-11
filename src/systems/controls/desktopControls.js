import * as THREE from "three";
import { resolvePositionAgainstColliders } from "./collision.js";

export class DesktopControls {
  constructor({
    domElement,
    camera,
    player,
    pitch,
    roomBounds,
    getColliders,
    onMoveDistance,
    onPointerLockChange,
    shouldRequestPointerLock
  }) {
    this.domElement = domElement;
    this.camera = camera;
    this.player = player;
    this.pitch = pitch;
    this.roomBounds = roomBounds;
    this.getColliders = getColliders;
    this.onMoveDistance = onMoveDistance;
    this.onPointerLockChange = onPointerLockChange;
    this.shouldRequestPointerLock = shouldRequestPointerLock;

    this.speed = 5.2;
    this.sprintMultiplier = 1.4;
    this.mouseSensitivity = 0.0022;
    this.pitchMin = -Math.PI * 0.5 + 0.01;
    this.pitchMax = Math.PI * 0.5 - 0.01;
    this.keys = new Set();
    this.pointerLocked = false;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.moveVector = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.beforeMovePosition = new THREE.Vector3();
    this.collisionRadius = 0.42;
    this.collisionSampleHeightOffset = 0.9;

    this.boundKeyDown = (event) => this.onKeyDown(event);
    this.boundKeyUp = (event) => this.onKeyUp(event);
    this.boundMouseMove = (event) => this.onMouseMove(event);
    this.boundPointerLock = () => this.onPointerLockChanged();
    this.boundCanvasClick = (event) => this.onCanvasClick(event);
    this.boundWindowBlur = () => this.clearKeys();
    this.boundVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        this.clearKeys();
      }
    };

    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    window.addEventListener("blur", this.boundWindowBlur);
    document.addEventListener("visibilitychange", this.boundVisibilityChange);
    document.addEventListener("pointerlockchange", this.boundPointerLock);
    document.addEventListener("mousemove", this.boundMouseMove);
    this.domElement.addEventListener("click", this.boundCanvasClick);
  }

  onKeyDown(event) {
    const target = event.target;
    const isEditableTarget =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      target?.isContentEditable;
    if (!this.pointerLocked && isEditableTarget) {
      return;
    }
    this.keys.add(event.code);
    if (
      event.code === "KeyW" ||
      event.code === "KeyA" ||
      event.code === "KeyS" ||
      event.code === "KeyD" ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight"
    ) {
      event.preventDefault();
    }
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  onPointerLockChanged() {
    this.pointerLocked = document.pointerLockElement === this.domElement;
    if (!this.pointerLocked) {
      this.clearKeys();
    }
    if (this.onPointerLockChange) {
      this.onPointerLockChange(this.pointerLocked);
    }
  }

  clearKeys() {
    this.keys.clear();
  }

  onMouseMove(event) {
    if (!this.pointerLocked) {
      return;
    }

    const deltaX = Number.isFinite(event.movementX) ? event.movementX : 0;
    const deltaY = Number.isFinite(event.movementY) ? event.movementY : 0;
    this.applyLookDelta(deltaX, deltaY);
  }

  applyLookDelta(deltaX = 0, deltaY = 0) {
    const nextYaw = this.player.rotation.y - (Number(deltaX) || 0) * this.mouseSensitivity;
    const nextPitch = this.pitch.rotation.x - (Number(deltaY) || 0) * this.mouseSensitivity;
    this.player.rotation.y = Number.isFinite(nextYaw) ? nextYaw : this.player.rotation.y;
    this.pitch.rotation.x = THREE.MathUtils.clamp(
      Number.isFinite(nextPitch) ? nextPitch : this.pitch.rotation.x,
      this.pitchMin,
      this.pitchMax
    );
  }

  onCanvasClick(event) {
    if (this.pointerLocked) {
      return;
    }
    if (typeof this.shouldRequestPointerLock === "function") {
      const allowed = this.shouldRequestPointerLock(event);
      if (allowed === false) {
        return;
      }
    }
    this.requestPointerLock(event);
  }

  requestPointerLock(event = null) {
    if (event?.defaultPrevented || this.pointerLocked) {
      return;
    }

    const suppressedUntil = Number(this.domElement?.dataset?.pointerLockSuppressedUntil || 0);
    if (Number.isFinite(suppressedUntil) && performance.now() < suppressedUntil) {
      return;
    }

    this.domElement.requestPointerLock?.();
  }

  isPointerLocked() {
    return this.pointerLocked;
  }

  setPose({ position = null, yaw = null, pitch = null } = {}) {
    if (position) {
      if (Array.isArray(position)) {
        this.player.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
      } else if (
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z)
      ) {
        this.player.position.copy(position);
      }
    }

    if (Number.isFinite(yaw)) {
      this.player.rotation.y = yaw;
    }

    if (Number.isFinite(pitch)) {
      this.pitch.rotation.x = THREE.MathUtils.clamp(pitch, this.pitchMin, this.pitchMax);
    }

    this.clearKeys();
  }

  update(deltaTime) {
    let axisForward = 0;
    let axisRight = 0;
    if (this.keys.has("KeyW")) axisForward += 1;
    if (this.keys.has("KeyS")) axisForward -= 1;
    if (this.keys.has("KeyD")) axisRight += 1;
    if (this.keys.has("KeyA")) axisRight -= 1;

    const moving = axisForward !== 0 || axisRight !== 0;
    if (!moving) {
      return 0;
    }

    const yaw = Number.isFinite(this.player.rotation.y) ? this.player.rotation.y : 0;
    if (!Number.isFinite(this.player.rotation.y)) {
      this.player.rotation.y = yaw;
    }
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.crossVectors(this.forward, this.worldUp).normalize();
    this.moveVector
      .set(0, 0, 0)
      .addScaledVector(this.forward, axisForward)
      .addScaledVector(this.right, axisRight);

    if (this.moveVector.lengthSq() > 1) {
      this.moveVector.normalize();
    }

    const speed =
      this.speed *
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")
        ? this.sprintMultiplier
        : 1);

    this.beforeMovePosition.copy(this.player.position);
    this.player.position.addScaledVector(this.moveVector, speed * deltaTime);

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

    const moved = this.beforeMovePosition.distanceTo(this.player.position);
    if (moved > 0 && this.onMoveDistance) {
      this.onMoveDistance(moved);
    }
    return moved;
  }

  dispose() {
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("blur", this.boundWindowBlur);
    document.removeEventListener("visibilitychange", this.boundVisibilityChange);
    document.removeEventListener("pointerlockchange", this.boundPointerLock);
    document.removeEventListener("mousemove", this.boundMouseMove);
    this.domElement.removeEventListener("click", this.boundCanvasClick);
  }
}
