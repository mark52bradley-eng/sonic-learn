/* =========================================================
   SONIC LEARN — Orb Collector
   File: js/game.js
   Loaded by: index.html (only if the game section is present)

   A small 3D game built with Three.js (loaded from CDN).
   Move a glowing cube around a dark arena and collect orbs
   before the timer runs out.

   Depends on: nothing (uses its own Three.js import).
   ========================================================= */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  // Guard: only run when the game section is on the page
  const shell = $('#game-shell');
  const launch = $('#game-launch');
  const canvas = $('#game-canvas');
  if (!shell || !launch || !canvas) return;

  /* ---------------------------------------------------------
     Config
     --------------------------------------------------------- */
  const GAME_DURATION = 30;   // seconds
  const ARENA_SIZE = 18;      // world units
  const PLAYER_SPEED = 8;     // units per second
  const ORB_COUNT = 12;
  const ORB_RADIUS = 0.55;
  const PLAYER_RADIUS = 0.6;
  const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js';

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  const state = {
    ready: false,       // Three.js loaded and scene built
    running: false,     // game loop active
    score: 0,
    timeLeft: GAME_DURATION,
    lastFrame: 0,
    keys: new Set(),
    orbs: [],
    player: null,
    scene: null,
    camera: null,
    renderer: null,
    rafId: null,
  };

  /* ---------------------------------------------------------
     UI helpers
     --------------------------------------------------------- */
  const scoreEl = $('#game-score');
  const timeEl = $('#game-time');
  const overlay = $('#game-overlay');
  const overlayEyebrow = $('#game-overlay-eyebrow');
  const overlayTitle = $('#game-overlay-title');
  const overlayText = $('#game-overlay-text');
  const startBtn = $('#game-start');
  const closeBtn = $('#game-close');

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(state.timeLeft)));
  }

  function showOverlay({ eyebrow, title, text, startLabel = 'Start', showClose = true }) {
    if (!overlay) return;
    overlay.hidden = false;
    if (overlayEyebrow) overlayEyebrow.textContent = eyebrow;
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.innerHTML = text;
    if (startBtn) startBtn.textContent = startLabel;
    if (closeBtn) closeBtn.hidden = !showClose;
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
  }

  /* ---------------------------------------------------------
     Load Three.js from CDN
     --------------------------------------------------------- */
  let threePromise = null;
  function loadThree() {
    if (threePromise) return threePromise;
    threePromise = import(THREE_CDN).catch((err) => {
      console.error('[game.js] Failed to load Three.js:', err);
      showOverlay({
        eyebrow: 'OFFLINE',
        title: 'Could not load the game engine',
        text: 'The 3D library could not be fetched. Check your connection and try again.',
        startLabel: 'Retry',
        showClose: true,
      });
      throw err;
    });
    return threePromise;
  }

  /* ---------------------------------------------------------
     Scene setup
     --------------------------------------------------------- */
  async function buildScene() {
    if (state.ready) return;

    const THREE = await loadThree();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.Fog(0x070b14, 22, 40);

    const camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight || 16 / 9,
      0.1,
      200
    );
    camera.position.set(0, 16, 18);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    // Lights
    scene.add(new THREE.AmbientLight(0x8899cc, 0.6));

    const keyLight = new THREE.DirectionalLight(0xbfdbfe, 1.4);
    keyLight.position.set(8, 14, 6);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x67e8f9, 40, 40);
    rimLight.position.set(-10, 8, -10);
    scene.add(rimLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f1626,
      roughness: 0.9,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Grid lines
    const grid = new THREE.GridHelper(
      ARENA_SIZE * 2,
      24,
      0x3b82f6,
      0x1e293b
    );
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    scene.add(grid);

    // Player
    const playerGeo = new THREE.BoxGeometry(1, 1, 1);
    const playerMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x2563eb,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.4,
    });
    const player = new THREE.Mesh(playerGeo, playerMat);
    player.position.set(0, 0.5, 0);
    scene.add(player);

    // Soft halo under player
    const haloGeo = new THREE.CircleGeometry(1.1, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.25,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    player.add(halo);

    // Orbs
    state.orbs = [];
    for (let i = 0; i < ORB_COUNT; i++) {
      const orb = makeOrb(THREE);
      scene.add(orb);
      state.orbs.push(orb);
    }

    // Handle resizing
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    // In case the canvas starts at zero size (hidden)
    setTimeout(resize, 60);

    state.scene = scene;
    state.camera = camera;
    state.renderer = renderer;
    state.player = player;
    state.ready = true;
  }

  function makeOrb(THREE) {
    const geo = new THREE.IcosahedronGeometry(ORB_RADIUS, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.2,
    });
    const orb = new THREE.Mesh(geo, mat);
    randomizeOrbPosition(orb);
    orb.userData.spin = 0.8 + Math.random() * 0.8;
    orb.userData.bob = Math.random() * Math.PI * 2;
    return orb;
  }

  function randomizeOrbPosition(orb) {
    const range = ARENA_SIZE - 1.5;
    orb.position.x = (Math.random() * 2 - 1) * range;
    orb.position.z = (Math.random() * 2 - 1) * range;
    orb.position.y = 0.9;
  }

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */
  function onKeyDown(e) {
    if (!state.running) return;
    const key = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
      state.keys.add(key);
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    state.keys.delete(e.key.toLowerCase());
  }

  function attachInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Click/tap to move toward a point on the floor
    canvas.addEventListener('pointerdown', (e) => {
      if (!state.running || !state.ready) return;
      const THREE = state._THREE;
      if (!THREE) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x, y }, state.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, point)) {
        state.tapTarget = { x: point.x, z: point.z };
      }
    });
  }

  /* ---------------------------------------------------------
     Game loop
     --------------------------------------------------------- */
  function startGame() {
    state.score = 0;
    state.timeLeft = GAME_DURATION;
    state.keys.clear();
    state.tapTarget = null;
    updateHud();
    hideOverlay();

    // Reset player
    if (state.player) state.player.position.set(0, 0.5, 0);

    // Scatter orbs
    state.orbs.forEach((orb) => {
      orb.visible = true;
      randomizeOrbPosition(orb);
    });

    state.running = true;
    state.lastFrame = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }

  function endGame() {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;

    const collected = state.score;
    showOverlay({
      eyebrow: 'TIME!',
      title: collected === 0
        ? 'Give it another go'
        : collected >= 10
          ? 'Sharp reflexes.'
          : 'Nice work.',
      text: `You collected <strong>${collected}</strong> orb${collected === 1 ? '' : 's'}.`,
      startLabel: 'Play again',
      showClose: true,
    });
  }

  function tick(now) {
    if (!state.running) return;

    const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
    state.lastFrame = now;

    update(dt);
    render();

    state.rafId = requestAnimationFrame(tick);
  }

  function update(dt) {
    if (!state.ready) return;

    // Timer
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      endGame();
      return;
    }
    updateHud();

    // Player movement
    const p = state.player.position;
    let dx = 0;
    let dz = 0;
    const k = state.keys;

    if (k.has('w') || k.has('arrowup'))    dz -= 1;
    if (k.has('s') || k.has('arrowdown'))  dz += 1;
    if (k.has('a') || k.has('arrowleft'))  dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;

    if (dx || dz) {
      state.tapTarget = null;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      p.x += dx * PLAYER_SPEED * dt;
      p.z += dz * PLAYER_SPEED * dt;
    } else if (state.tapTarget) {
      const tx = state.tapTarget.x - p.x;
      const tz = state.tapTarget.z - p.z;
      const dist = Math.hypot(tx, tz);
      if (dist > 0.15) {
        p.x += (tx / dist) * PLAYER_SPEED * dt;
        p.z += (tz / dist) * PLAYER_SPEED * dt;
      } else {
        state.tapTarget = null;
      }
    }

    // Clamp to arena
    const bound = ARENA_SIZE - PLAYER_RADIUS;
    p.x = Math.max(-bound, Math.min(bound, p.x));
    p.z = Math.max(-bound, Math.min(bound, p.z));

    // Orb animation + collision
    for (const orb of state.orbs) {
      if (!orb.visible) continue;
      orb.rotation.y += orb.userData.spin * dt;
      orb.userData.bob += dt * 2;
      orb.position.y = 0.9 + Math.sin(orb.userData.bob) * 0.15;

      const ox = orb.position.x - p.x;
      const oz = orb.position.z - p.z;
      const dist = Math.hypot(ox, oz);
      if (dist < PLAYER_RADIUS + ORB_RADIUS) {
        orb.visible = false;
        state.score += 1;

        // Respawn after a delay so the arena keeps filling
        window.setTimeout(() => {
          if (!state.running) return;
          randomizeOrbPosition(orb);
          orb.visible = true;
        }, 900 + Math.random() * 600);
      }
    }

    // Camera gently follows player
    const cam = state.camera;
    cam.position.x += (p.x * 0.35 - cam.position.x) * Math.min(1, dt * 2);
    cam.position.z += (18 + p.z * 0.35 - cam.position.z) * Math.min(1, dt * 2);
    cam.lookAt(p.x * 0.5, 0.5, p.z * 0.5);
  }

  function render() {
    if (!state.ready) return;
    state.renderer.render(state.scene, state.camera);
  }

  /* ---------------------------------------------------------
     Public controls
     --------------------------------------------------------- */
  launch.addEventListener('click', async () => {
    shell.hidden = false;
    try {
      await buildScene();
      // Cache THREE on state for pointer-to-world math
      state._THREE = await loadThree();
    } catch {
      return;
    }
    attachInput();
    showOverlay({
      eyebrow: 'READY?',
      title: 'Collect the glowing orbs',
      text: 'Use <strong>WASD</strong> or the <strong>arrow keys</strong> to move. Grab as many orbs as you can in 30 seconds.',
      startLabel: 'Start',
      showClose: true,
    });
  });

  startBtn?.addEventListener('click', () => {
    if (!state.ready) {
      buildScene().then(startGame);
    } else {
      startGame();
    }
  });

  closeBtn?.addEventListener('click', () => {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    shell.hidden = true;
  });

  // Auto-pause if user tabs away
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running) {
      state.running = false;
      if (state.rafId) cancelAnimationFrame(state.rafId);
      showOverlay({
        eyebrow: 'PAUSED',
        title: 'Paused',
        text: 'You left the tab. Press Start to resume.',
        startLabel: 'Resume',
        showClose: true,
      });
    }
  });
})();