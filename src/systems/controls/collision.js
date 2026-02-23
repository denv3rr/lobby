function isInsideExpandedBox(position, radius, collider) {
  const minX = (collider.minX ?? 0) - radius;
  const maxX = (collider.maxX ?? 0) + radius;
  const minZ = (collider.minZ ?? 0) - radius;
  const maxZ = (collider.maxZ ?? 0) + radius;

  return (
    position.x > minX &&
    position.x < maxX &&
    position.z > minZ &&
    position.z < maxZ
  );
}

function resolveOne(position, radius, collider) {
  const minX = (collider.minX ?? 0) - radius;
  const maxX = (collider.maxX ?? 0) + radius;
  const minZ = (collider.minZ ?? 0) - radius;
  const maxZ = (collider.maxZ ?? 0) + radius;

  const distToMinX = Math.abs(position.x - minX);
  const distToMaxX = Math.abs(maxX - position.x);
  const distToMinZ = Math.abs(position.z - minZ);
  const distToMaxZ = Math.abs(maxZ - position.z);

  const smallest = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);
  if (smallest === distToMinX) {
    position.x = minX;
  } else if (smallest === distToMaxX) {
    position.x = maxX;
  } else if (smallest === distToMinZ) {
    position.z = minZ;
  } else {
    position.z = maxZ;
  }
}

export function resolvePositionAgainstColliders({
  position,
  colliders,
  radius = 0.38,
  sampleY = 0
}) {
  if (!Array.isArray(colliders) || !colliders.length) {
    return 0;
  }

  let hits = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    let hadHitInPass = false;
    for (const collider of colliders) {
      if (!collider || collider.enabled === false) {
        continue;
      }

      const minY = Number.isFinite(collider.minY) ? collider.minY : -Infinity;
      const maxY = Number.isFinite(collider.maxY) ? collider.maxY : Infinity;
      if (sampleY < minY || sampleY > maxY) {
        continue;
      }

      if (!isInsideExpandedBox(position, radius, collider)) {
        continue;
      }

      resolveOne(position, radius, collider);
      hadHitInPass = true;
      hits += 1;
    }

    if (!hadHitInPass) {
      break;
    }
  }

  return hits;
}

export function mergeColliderSets(...sets) {
  const merged = [];
  for (const set of sets) {
    if (!Array.isArray(set)) {
      continue;
    }
    for (const entry of set) {
      if (!entry) {
        continue;
      }
      merged.push(entry);
    }
  }
  return merged;
}
