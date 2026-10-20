import { invoke } from '@tauri-apps/api/core';
import {
  AmbientLight, AnimationClip, AnimationMixer, Box3, BufferGeometry, Color, DirectionalLight,
  GridHelper, Group, HemisphereLight, Line, LineBasicMaterial, Material, Mesh, MeshBasicMaterial,
  MeshNormalMaterial, Object3D, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2,
  Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LoadedModel } from './load';

export type RenderMode = 'shaded' | 'wireframe' | 'normals';
export type Lighting = 'studio' | 'warm' | 'flat';
export type ModelInfo = { vertices: number; triangles: number; meshes: number; bones: number; dimensions: [number, number, number]; clips: string[] };

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value && typeof value.dispose === 'function') value.dispose();
  }
  material.dispose();
}

export class ModelStage {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly scene = new Scene();
  readonly controls: OrbitControls;
  readonly content = new Group();
  private readonly ambient = new AmbientLight(0xffffff, 0.5);
  private readonly hemisphere = new HemisphereLight(0xffffff, 0x405070, 1.2);
  private readonly key = new DirectionalLight(0xffffff, 2);
  private readonly fill = new DirectionalLight(0x8cabff, 0.7);
  private readonly grid = new GridHelper(10, 20, 0x4d6688, 0x39485f);
  private readonly markers = new Group();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly originals = new Map<Mesh, Material | Material[]>();
  private loaded: LoadedModel | null = null;
  private mixer: AnimationMixer | null = null;
  private clips: AnimationClip[] = [];
  private clipIndex = -1;
  private frameId = 0;
  private lastTime = performance.now();
  private playing = true;
  private exporting = false;
  private disposed = false;
  private renderMode: RenderMode = 'shaded';
  private measurement = false;
  private points: Vector3[] = [];
  private onMeasure: (distance: number | null) => void;

  constructor(canvas: HTMLCanvasElement, onMeasure: (distance: number | null) => void) {
    this.onMeasure = onMeasure;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x111827);
    this.camera = new PerspectiveCamera(45, 1, 0.01, 10000);
    this.camera.position.set(3, 2, 4);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.key.position.set(4, 8, 6);
    this.fill.position.set(-5, 2, -4);
    this.scene.add(this.ambient, this.hemisphere, this.key, this.fill, this.content, this.grid, this.markers);
    this.grid.visible = false;
    canvas.addEventListener('click', this.pick);
    this.frameId = requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    const seconds = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    if (!this.exporting) {
      if (this.playing) this.mixer?.update(seconds);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
    this.frameId = requestAnimationFrame(this.tick);
  };

  resize(width: number, height: number) {
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setModel(loaded: LoadedModel): ModelInfo {
    this.clearModel();
    this.loaded = loaded;
    this.content.add(loaded.object);
    this.content.updateMatrixWorld(true);
    this.clips = loaded.animations;
    this.mixer = loaded.animations.length ? new AnimationMixer(loaded.object) : null;
    const bounds = new Box3().setFromObject(loaded.object);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    this.content.position.copy(center).multiplyScalar(-1);
    const radius = Math.max(size.length() / 2, 0.01);
    this.camera.near = Math.max(radius / 1000, 0.001);
    this.camera.far = Math.max(radius * 100, 100);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(radius * 1.8, radius * 1.2, radius * 2.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.grid.position.y = -size.y / 2;
    this.grid.scale.setScalar(Math.max(radius / 5, 0.01));
    let vertices = 0;
    let triangles = 0;
    let meshes = 0;
    let bones = 0;
    loaded.object.traverse(node => {
      if (node.type === 'Bone') bones++;
      if (!(node instanceof Mesh)) return;
      meshes++;
      const geometry = node.geometry as BufferGeometry;
      const count = geometry.getAttribute('position')?.count ?? 0;
      vertices += count;
      triangles += Math.floor((geometry.index?.count ?? count) / 3);
      this.originals.set(node, node.material);
    });
    this.setRenderMode(this.renderMode);
    this.selectClip(loaded.animations.length ? 0 : -1);
    return { vertices, triangles, meshes, bones, dimensions: [size.x, size.y, size.z], clips: loaded.animations.map(clip => clip.name) };
  }

  selectClip(index: number) {
    this.mixer?.stopAllAction();
    this.clipIndex = index;
    const clip = this.clips[index];
    if (clip && this.mixer) this.mixer.clipAction(clip).reset().play();
  }

  setPlaying(playing: boolean) { this.playing = playing; }
  setGrid(visible: boolean) { this.grid.visible = visible; }
  setBackground(color: string) { this.renderer.setClearColor(new Color(color)); }
  setLighting(mode: Lighting) {
    this.ambient.intensity = mode === 'flat' ? 2 : 0.5;
    this.hemisphere.intensity = mode === 'flat' ? 0 : 1.2;
    this.key.intensity = mode === 'flat' ? 0 : 2;
    this.fill.intensity = mode === 'flat' ? 0 : 0.7;
    this.key.color.set(mode === 'warm' ? 0xffdbad : 0xffffff);
    this.fill.color.set(mode === 'warm' ? 0xff946b : 0x8cabff);
  }

  setRenderMode(mode: RenderMode) {
    this.renderMode = mode;
    for (const [mesh, original] of this.originals) {
      if (mesh.material !== original) {
        const active = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of active) if (material instanceof MeshNormalMaterial) material.dispose();
      }
      const materials = Array.isArray(original) ? original : [original];
      for (const material of materials) if ('wireframe' in material) material.wireframe = mode === 'wireframe';
      mesh.material = mode === 'normals' ? new MeshNormalMaterial({ side: 2 }) : original;
    }
  }

  setMeasurement(enabled: boolean) {
    this.measurement = enabled;
    this.controls.enabled = !enabled;
    if (!enabled) this.clearMeasurement();
  }

  private pick = (event: MouseEvent) => {
    if (!this.measurement || !this.loaded) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.content, true).find(item => item.object instanceof Mesh);
    if (!hit) return;
    if (this.points.length === 2) this.clearMeasurement();
    this.points.push(hit.point.clone());
    const radius = Math.max(this.camera.position.length() * 0.008, 0.003);
    const marker = new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color: 0xffbb55, depthTest: false }));
    marker.position.copy(hit.point);
    this.markers.add(marker);
    if (this.points.length === 2) {
      const line = new Line(new BufferGeometry().setFromPoints(this.points), new LineBasicMaterial({ color: 0xffbb55, depthTest: false }));
      this.markers.add(line);
      this.onMeasure(this.points[0].distanceTo(this.points[1]));
    }
  };

  clearMeasurement() {
    this.points = [];
    this.onMeasure(null);
    for (const child of [...this.markers.children]) {
      this.markers.remove(child);
      if (child instanceof Mesh || child instanceof Line) {
        child.geometry.dispose();
        (child.material as Material).dispose();
      }
    }
  }

  async exportMp4(target: string, seconds: number, fps: number, signal: AbortSignal, progress: (done: number, total: number) => void) {
    if (!this.loaded || this.exporting) throw new Error('model.exportUnavailable');
    const frames = seconds * fps;
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const exportWidth = Math.max(2, Math.round((720 * width / Math.max(width, height)) / 2) * 2);
    const exportHeight = Math.max(2, Math.round((720 * height / Math.max(width, height)) / 2) * 2);
    const previousRotation = this.content.rotation.y;
    const previousClip = this.clipIndex;
    const previousPlaying = this.playing;
    let id: number | undefined;
    this.exporting = true;
    try {
      id = (await invoke<{ id: number }>('viewer_export_begin', { target, format: 'mp4', fps, frames })).id;
      this.renderer.setSize(exportWidth, exportHeight, false);
      this.camera.aspect = exportWidth / exportHeight;
      this.camera.updateProjectionMatrix();
      this.selectClip(previousClip);
      for (let index = 0; index < frames; index++) {
        signal.throwIfAborted();
        if (index) this.mixer?.update(1 / fps);
        if (previousClip < 0) this.content.rotation.y = previousRotation + 2 * Math.PI * index / frames;
        this.renderer.render(this.scene, this.camera);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('model.exportFailed')), 'image/png'));
        await invoke('viewer_export_frame', { id, index, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
        progress(index + 1, frames);
      }
      signal.throwIfAborted();
      return await invoke<string>('viewer_export_finish', { id });
    } finally {
      if (id !== undefined) await invoke('viewer_export_cancel', { id }).catch(() => {});
      this.content.rotation.y = previousRotation;
      this.selectClip(previousClip);
      this.playing = previousPlaying;
      if (!this.disposed) this.resize(width, height);
      this.exporting = false;
    }
  }

  private clearModel() {
    this.clearMeasurement();
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.clips = [];
    if (!this.loaded) return;
    this.content.remove(this.loaded.object);
    this.loaded.object.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      const active = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of active) if (material instanceof MeshNormalMaterial) material.dispose();
      const original = this.originals.get(node);
      if (original) for (const material of Array.isArray(original) ? original : [original]) disposeMaterial(material);
    });
    this.originals.clear();
    this.loaded.release();
    this.loaded = null;
    this.content.position.set(0, 0, 0);
    this.content.rotation.set(0, 0, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.renderer.domElement.removeEventListener('click', this.pick);
    this.clearModel();
    this.grid.geometry.dispose();
    (this.grid.material as Material).dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
