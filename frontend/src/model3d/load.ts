import { invoke } from '@tauri-apps/api/core';
import {
  AnimationClip, BufferGeometry, DoubleSide, Group, LoadingManager, Mesh, MeshStandardMaterial,
  Object3D,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export type ModelFile = { id: number; path: string; bytes: number; model: boolean };
export type LoadedModel = { object: Object3D; animations: AnimationClip[]; release: () => void; missing: string[] };

async function read(file: ModelFile): Promise<Uint8Array<ArrayBuffer>> {
  const response = await invoke<ArrayBuffer | number[]>('model_read', { id: file.id });
  return new Uint8Array(response);
}

function mime(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', mtl: 'text/plain', gltf: 'model/gltf+json' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

function normalized(path: string, base: string): string {
  const cleaned = path.replaceAll('\\', '/');
  if (/^(blob:|data:)/i.test(cleaned)) return cleaned;
  if (/^[a-z]+:/i.test(cleaned) && !/^[a-z]:/i.test(cleaned)) return '';
  const relative = cleaned.replace(/^[a-z]:/i, '').replace(/^\/+/, '');
  const parts = [...base.split('/').filter(Boolean)];
  for (const part of decodeURIComponent(relative.split(/[?#]/)[0]).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/').toLowerCase();
}

export async function loadModel(file: ModelFile, catalog: ModelFile[], signal: AbortSignal): Promise<LoadedModel> {
  const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';
  const nearby = catalog.filter(item => !item.model && item.path.startsWith(folder));
  const urls = new Map<string, string>();
  const names = new Map<string, string>();
  const missing: string[] = [];
  const manager = new LoadingManager();
  try {
    if (nearby.length > 1000 || nearby.reduce((size, item) => size + item.bytes, 0) > 256 * 1024 * 1024) throw new Error('model.dependenciesLarge');
    for (const item of nearby) {
      signal.throwIfAborted();
      const bytes = await read(item);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime(item.path) }));
      urls.set(item.path.toLowerCase(), url);
      const basename = item.path.split('/').pop()?.toLowerCase();
      if (basename && !names.has(basename)) names.set(basename, url);
    }
    manager.setURLModifier(request => {
      if (/^(blob:|data:)/i.test(request)) return request;
      const match = urls.get(normalized(request, folder)) ?? names.get(request.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? '');
      if (!match) { missing.push(request); return 'about:blank'; }
      return match;
    });
    signal.throwIfAborted();
    const bytes = await read(file);
    const extension = file.path.split('.').pop()?.toLowerCase();
    let object: Object3D;
    let animations: AnimationClip[] = [];
    if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader(manager);
      const data = extension === 'glb' ? bytes.buffer : new TextDecoder().decode(bytes);
      const result = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) => loader.parse(data, '', resolve, reject));
      object = result.scene;
      animations = result.animations;
    } else if (extension === 'fbx') {
      object = new FBXLoader(manager).parse(bytes.buffer, '');
      animations = object.animations;
    } else if (extension === 'obj') {
      const source = new TextDecoder().decode(bytes);
      const loader = new OBJLoader(manager);
      const library = source.match(/^mtllib\s+(.+)$/im)?.[1]?.trim();
      const material = library && nearby.find(item => item.path.toLowerCase() === `${folder}${library}`.toLowerCase());
      if (material) {
        const materialSource = new TextDecoder().decode(await read(material));
        const materials = new MTLLoader(manager).parse(materialSource, '');
        materials.preload();
        loader.setMaterials(materials);
      }
      object = loader.parse(source);
    } else if (extension === 'stl') {
      const geometry: BufferGeometry = new STLLoader(manager).parse(bytes.buffer);
      object = new Group();
      object.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x9cb4d8, metalness: 0.15, roughness: 0.72, side: DoubleSide })));
    } else {
      throw new Error('model.unsupported');
    }
    signal.throwIfAborted();
    return { object, animations, missing, release: () => { for (const url of urls.values()) URL.revokeObjectURL(url); } };
  } catch (error) {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    throw error;
  }
}
