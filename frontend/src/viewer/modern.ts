import * as spine from '@esotericsoftware/spine-webgl';
import type { Renderer } from './model';

export async function create(canvas: HTMLCanvasElement, text: string, images: Map<string, ImageBitmap>, data: Uint8Array, binary: boolean): Promise<Renderer> {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) throw new Error('viewer.webgl');
  const scene = new spine.SceneRenderer(canvas, gl);
  const atlas = new spine.TextureAtlas(text);
  try {
    if (new Set(atlas.pages.map(page => page.pma)).size > 1) throw new Error('viewer.mixed');
    spine.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
    for (const page of atlas.pages) page.setTexture(new spine.GLTexture(gl, images.get(page.name)!, false));
    const loader = new spine.AtlasAttachmentLoader(atlas);
    const skeletonData = binary ? new spine.SkeletonBinary(loader).readSkeletonData(data) : new spine.SkeletonJson(loader).readSkeletonData(JSON.parse(new TextDecoder().decode(data)));
    const skeleton = new spine.Skeleton(skeletonData);
    let state = new spine.AnimationState(new spine.AnimationStateData(skeletonData));
    let pmaOverride: boolean | null = null;
    const pma = atlas.pages.map(page => page.pma);
    return {
      animations: skeletonData.animations.map(animation => ({ name: animation.name, duration: animation.duration })),
      skins: skeletonData.skins.map(skin => skin.name), runtime: 'spine-webgl 4.2.120',
      reset(animation, skin, loop) {
        skeleton.setToSetupPose();
        if (skin) skeleton.setSkinByName(skin);
        skeleton.setSlotsToSetupPose();
        skeleton.time = 0;
        state = new spine.AnimationState(new spine.AnimationStateData(skeletonData));
        if (animation) state.setAnimation(0, animation, loop);
        state.apply(skeleton);
        skeleton.updateWorldTransform(spine.Physics.reset);
      },
      step(delta) {
        skeleton.update(delta); state.update(delta); state.apply(skeleton); skeleton.updateWorldTransform(spine.Physics.update);
      },
      bounds: () => { const bounds = skeleton.getBoundsRect(); return { ...bounds, y: -bounds.y - bounds.height }; },
      draw(view) {
        const ratio = Math.min(devicePixelRatio, 2);
        const width = Math.max(1, Math.round(view.width * ratio));
        const height = Math.max(1, Math.round(view.height * ratio));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        scene.camera.viewportWidth = view.width / view.scale;
        scene.camera.viewportHeight = view.height / view.scale;
        scene.camera.position.set(view.x, -view.y, 0); scene.camera.update();
        if (view.pma !== pmaOverride) { atlas.pages.forEach((page, index) => { page.pma = view.pma ?? pma[index]; }); pmaOverride = view.pma; }
        scene.begin(); scene.drawSkeleton(skeleton, view.pma ?? pma[0] ?? false);
        if (view.bones) { scene.skeletonDebugRenderer.drawBones = true; scene.drawSkeletonDebug(skeleton); }
        scene.end();
      },
      dispose() { atlas.dispose(); scene.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  } catch (error) { atlas.dispose(); scene.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
}
