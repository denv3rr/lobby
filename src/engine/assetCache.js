import * as THREE from "three";
import { resolvePublicPath } from "../utils/path.js";

let gltfLoaderPromise = null;

async function getGLTFLoader() {
  if (!gltfLoaderPromise) {
    gltfLoaderPromise = import("three/examples/jsm/loaders/GLTFLoader.js").then(
      (module) => new module.GLTFLoader()
    );
  }

  return gltfLoaderPromise;
}

export class AssetCache {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setCrossOrigin("anonymous");
    this.textureCache = new Map();
    this.modelCache = new Map();
  }

  async loadGifTexture(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";

      image.onload = () => {
        const width = Math.max(1, image.naturalWidth || image.width || 1);
        const height = Math.max(1, image.naturalHeight || image.height || 1);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        texture.userData.updateFrame = () => {
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
        };

        texture.userData.updateFrame();
        resolve(texture);
      };

      image.onerror = () => resolve(null);
      image.src = resolvePublicPath(src);
    });
  }

  async loadTexture(src) {
    if (!src) {
      return null;
    }

    if (!this.textureCache.has(src)) {
      const isGif = /\.gif(?:[?#].*)?$/i.test(src);
      const texturePromise = isGif
        ? this.loadGifTexture(src)
        : new Promise((resolve) => {
            this.textureLoader.load(
              resolvePublicPath(src),
              (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                resolve(texture);
              },
              undefined,
              () => resolve(null)
            );
          });

      this.textureCache.set(src, texturePromise);
    }

    return this.textureCache.get(src);
  }

  async loadModel(src) {
    if (!src) {
      return null;
    }

    if (!this.modelCache.has(src)) {
      const modelPromise = getGLTFLoader()
        .then(
          (loader) =>
            new Promise((resolve, reject) => {
              loader.load(resolvePublicPath(src), resolve, undefined, reject);
            })
        )
        .catch(() => null);

      this.modelCache.set(src, modelPromise);
    }

    const gltf = await this.modelCache.get(src);
    return gltf || null;
  }
}
