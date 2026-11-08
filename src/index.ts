import { BioBlitzGameEngine } from './engine/BioBlitzGameEngine';
import { GameUIManager } from './ui/GameUI';

function bootstrapBioBlitz(): void {
  const rootEl = document.getElementById('root') || document.body;

  // Instantiate the 3D Bloodstream Arena Survival Game Engine
  const engine = new BioBlitzGameEngine(rootEl);

  // Mount the Android Mobile Game Shell, Touchscreen Controls & Menus
  new GameUIManager(engine, rootEl);

  // Software-WebGL guard frame pacing vs Hardware GPU 60fps loop
  const gl = engine.renderer.getContext() as WebGL2RenderingContext;
  let frameId = 0;

  function afterDraw(cb: () => void): void {
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick(): void {
    engine.stepSimulation();
    engine.renderer.render(engine.scene, engine.camera);
    if (engine.isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  tick();

  window.addEventListener('unload', () => {
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapBioBlitz);
} else {
  bootstrapBioBlitz();
}
