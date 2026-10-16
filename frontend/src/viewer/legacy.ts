import { Application, BaseTexture, ALPHA_MODES } from 'pixi.js';
import { TextureAtlas, SpineDebugRenderer, Vector2 } from '@pixi-spine/base';
import type { Renderer } from './model';

export async function create(canvas: HTMLCanvasElement, text: string, images: Map<string, ImageBitmap>, data: Uint8Array, binary: boolean, version: string): Promise<Renderer> {
  const runtimeVersion = version === '3.8' ? '3.8' : '4.1';
  const runtime = (runtimeVersion === '3.8' ? await import('@pixi-spine/runtime-3.8') : await import('@pixi-spine/runtime-4.1')) as unknown as typeof import('@pixi-spine/runtime-3.8');
  const app = new Application({ view: canvas, backgroundAlpha: 0, antialias: true, autoStart: false, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  const textures = new Map<string, BaseTexture>();
  let atlas: TextureAtlas | undefined;
  try {
    atlas = new TextureAtlas(text, (name, ready) => {
      const texture = BaseTexture.from(images.get(name)!);
      textures.set(name, texture); ready(texture);
    });
    for (const page of atlas.pages) page.baseTexture.alphaMode = page.pma ? ALPHA_MODES.PMA : ALPHA_MODES.NPM;
    const loader = new runtime.AtlasAttachmentLoader(atlas);
    const skeletonData = binary ? new runtime.SkeletonBinary(loader).readSkeletonData(data) : new runtime.SkeletonJson(loader).readSkeletonData(JSON.parse(new TextDecoder().decode(data)));
    const display = new runtime.Spine(skeletonData);
    display.autoUpdate = false;
    app.stage.addChild(display);
    const debug = new SpineDebugRenderer();
    debug.drawBones = true; debug.drawMeshHull = false; debug.drawMeshTriangles = false; debug.drawPaths = false; debug.drawBoundingBoxes = false; debug.drawRegionAttachments = false; debug.drawClipping = false;
    const debugTarget = display as unknown as { debug: SpineDebugRenderer | undefined };
    const pma = atlas.pages.map(page => page.pma);
    let pmaOverride: boolean | null = null;
    return {
      animations: skeletonData.animations.map(animation => ({ name: animation.name, duration: animation.duration })),
      skins: skeletonData.skins.map(skin => skin.name), runtime: `pixi-spine ${runtimeVersion} / 4.0.6${version === '4.0' ? ' (Spine 4.0)' : ''}`,
      reset(animation, skin, loop) {
        display.state = new runtime.AnimationState(new runtime.AnimationStateData(skeletonData));
        display.skeleton.time = 0;
        display.skeleton.setToSetupPose();
        if (skin) display.skeleton.setSkinByName(skin);
        display.skeleton.setSlotsToSetupPose();
        if (animation) display.state.setAnimation(0, animation, loop);
        display.update(0);
      },
      step(delta) { display.update(delta); },
      bounds() { const offset = new Vector2(); const size = new Vector2(); display.skeleton.getBounds(offset, size); return { x: offset.x, y: offset.y, width: size.x, height: size.y }; },
      draw(view) {
        if (app.screen.width !== view.width || app.screen.height !== view.height) app.renderer.resize(view.width, view.height);
        display.scale.set(view.scale); display.position.set(view.width / 2 - view.x * view.scale, view.height / 2 - view.y * view.scale);
        if (view.pma !== pmaOverride) { atlas!.pages.forEach((page, index) => { page.baseTexture.alphaMode = (view.pma ?? pma[index]) ? ALPHA_MODES.PMA : ALPHA_MODES.NPM; }); pmaOverride = view.pma; }
        debugTarget.debug = view.bones ? debug : undefined;
        if (view.bones) debug.renderDebug(display);
        app.render();
      },
      dispose() { app.destroy(false, { children: true, texture: false, baseTexture: false }); atlas!.dispose(); },
    };
  } catch (error) { app.destroy(false, { children: true }); textures.forEach(texture => texture.destroy()); throw error; }
}
