import * as THREE from "three";

export class ParticleSystem {
  constructor(scene, floorY = 0) {
    this.scene = scene;
    this.floorY = floorY;
    this.effect = null;
    this.elapsed = 0;
  }

  clearEffect() {
    if (!this.effect) {
      return;
    }
    this.scene.remove(this.effect.points);
    this.effect.geometry.dispose();
    this.effect.material.dispose();
    this.effect = null;
  }

  setEffect(effectConfig, qualityMultiplier, roomSize) {
    if (!effectConfig?.enabled) {
      this.clearEffect();
      return;
    }

    this.clearEffect();
    const type = effectConfig.type || "snow";

    const area = effectConfig.area || [roomSize[0], 10, roomSize[2]];
    const count = Math.max(
      40,
      Math.floor((effectConfig.count || 300) * (qualityMultiplier || 1))
    );
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const halfX = (area[0] || 20) * 0.5;
    const halfZ = (area[2] || 20) * 0.5;
    const minY = this.floorY + 0.2;
    const maxY = this.floorY + (area[1] || 10);
    const speedBase =
      type === "embers" ? effectConfig.riseSpeed || 0.8 : effectConfig.fallSpeed || 0.6;

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = THREE.MathUtils.randFloat(-halfX, halfX);
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(minY, maxY);
      positions[i * 3 + 2] = THREE.MathUtils.randFloat(-halfZ, halfZ);
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = THREE.MathUtils.randFloat(
        speedBase * 0.6,
        speedBase * 1.2
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: effectConfig.color || "#ffffff",
      size: effectConfig.size || 0.08,
      transparent: true,
      opacity: effectConfig.opacity ?? 0.8,
      depthWrite: false,
      blending: effectConfig.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    points.position.y = 0;
    this.scene.add(points);

    this.effect = {
      type,
      points,
      geometry,
      material,
      speeds,
      phases,
      minY,
      maxY,
      halfX,
      halfZ,
      drift: effectConfig.drift ?? 0.45
    };
  }

  setSnow(snowConfig, qualityMultiplier, roomSize) {
    if (!snowConfig?.enabled) {
      this.setEffect(null, qualityMultiplier, roomSize);
      return;
    }
    this.setEffect(
      {
        type: "snow",
        ...snowConfig
      },
      qualityMultiplier,
      roomSize
    );
  }

  update(deltaTime) {
    if (!this.effect) {
      return;
    }

    this.elapsed += deltaTime;
    const positions = this.effect.geometry.attributes.position.array;
    const rising = this.effect.type === "embers";
    const driftScale = this.effect.drift;

    for (let i = 0; i < this.effect.speeds.length; i += 1) {
      const base = i * 3;
      const speed = this.effect.speeds[i];
      const phase = this.effect.phases[i];

      if (rising) {
        positions[base + 1] += speed * deltaTime;
      } else {
        positions[base + 1] -= speed * deltaTime;
      }

      positions[base] += Math.sin(this.elapsed * 0.7 + phase) * driftScale * deltaTime;
      positions[base + 2] += Math.cos(this.elapsed * 0.6 + phase * 1.7) * driftScale * deltaTime;

      if (positions[base] > this.effect.halfX) positions[base] = -this.effect.halfX;
      if (positions[base] < -this.effect.halfX) positions[base] = this.effect.halfX;
      if (positions[base + 2] > this.effect.halfZ) positions[base + 2] = -this.effect.halfZ;
      if (positions[base + 2] < -this.effect.halfZ) positions[base + 2] = this.effect.halfZ;

      if (!rising && positions[base + 1] <= this.effect.minY) {
        positions[base] = THREE.MathUtils.randFloat(-this.effect.halfX, this.effect.halfX);
        positions[base + 1] = this.effect.maxY;
        positions[base + 2] = THREE.MathUtils.randFloat(-this.effect.halfZ, this.effect.halfZ);
      } else if (rising && positions[base + 1] >= this.effect.maxY) {
        positions[base] = THREE.MathUtils.randFloat(-this.effect.halfX, this.effect.halfX);
        positions[base + 1] = this.effect.minY;
        positions[base + 2] = THREE.MathUtils.randFloat(-this.effect.halfZ, this.effect.halfZ);
      }
    }
    this.effect.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.clearEffect();
  }
}
