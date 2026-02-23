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
    onPointerLockChange
  }) {
    this.domElement = domElement;
    this.camera = camera;
    this.player = player;
    this.pitch = pitch;
    this.roomBounds = roomBounds;
    this.getColliders = getColliders;
    this.onMoveDistance = onMoveDistance;
    this.onPointerLockChange = onPointerLockChange;

    this.speed = 5.2;
    this.sprintMultiplier = 1.4;
    this.mouseSensitivity = 0.0022;
    this.pitchMin = -Math.PI * 0.42;
    this.pitchMax = Math.PI * 0.42;
    this.keys = new Set();
    this.pointerLocked = false;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.moveVector = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.collisionRadius = 0.42;
    this.collisionSampleHeightOffset = 0.9;

    this.boundKeyDown = (event) => this.onKeyDown(event);
    this.boundKeyUp = (event) => this.onKeyUp(event);
    this.boundMouseMove = (event) => this.onMouseMove(event);
    this.boundPointerLock = () => this.onPointerLockChanged();
    this.boundCanvasClick = () => this.requestPointerLock();

    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    document.addEventListener("pointerlockchange", this.boundPointerLock);
    document.addEventListener("mousemove", this.boundMouseMove);
    this.domElement.addEventListener("click", this.boundCanvasClick);
  }

  onKeyDown(event) {
    this.keys.add(event.code);
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  onPointerLockChanged() {
    this.pointerLocked = document.pointerLockElement === this.domElement;
    if (this.onPointerLockChange) {
      this.onPointerLockChange(this.pointerLocked);
    }
  }

  onMouseMove(event) {
    if (!this.pointerLocked) {
      return;
    }

    this.player.rotation.y -= event.movementX * this.mouseSensitivity;
    this.pitch.rotation.x = THREE.MathUtils.clamp(
      this.pitch.rotation.x - event.movementY * this.mouseSensitivity,
      this.pitchMin,
      this.pitchMax
    );
  }

  requestPointerLock() {
    if (!this.pointerLocked) {
      this.domElement.requestPointerLock?.();
    }
  }

  isPointerLocked() {
    return this.pointerLocked;
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

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-5) {
      this.forward.set(0, 0, -1);
    } else {
      this.forward.normalize();
    }

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

    const before = this.player.position.clone();
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

    const moved = before.distanceTo(this.player.position);
    if (moved > 0 && this.onMoveDistance) {
      this.onMoveDistance(moved);
    }
    return moved;
  }

  dispose() {
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    document.removeEventListener("pointerlockchange", this.boundPointerLock);
    document.removeEventListener("mousemove", this.boundMouseMove);
    this.domElement.removeEventListener("click", this.boundCanvasClick);
  }
}
