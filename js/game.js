/* =========================================================
   SONIC LEARN — Orb Collector
   File: js/game.js
   Loaded by: index.html (only if the game section is present)

   A small 3D game built with Three.js (loaded from CDN).
   Move a glowing cube around a dark arena and collect orbs
   before the timer runs out.

   Depends on: nothing (uses its own Three.js import).
   ========================================================= */
   (() =>{
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);

    //Guard: only run when the game section is on the page
    const shell = $('#game-shell');
    const launch = $('#game-launch');
    const canvas = $('game-canvas');
    if (!shell || !launch || !canvas) return;

    /* -----------------------------------------------
    Config
    */
   const GAME_DURATION = 30; // 30 seconds for every game
   const ARENA_SIZE = 18; // world units
   const PLAYER_SPEED = 8; // units per second
   const ORB_COUNT = 12;
   const ORB_RADIUS = 0.55;
   const PLAYER_RADIUS = 0.6;
   const THREE_CDN =  'https://unpkg.com/three@0.160.0/build/three.module.js';

   /* -------------------------------------------------
   State
   ---------------------------------------------------- */
   const state = {
      ready: false, // Three.js module loaded and scene built
      running: false, // game loop active
      score: 0,
      timeLeft: GAME_DURATION,
      lastFrame: 0,
      keys: new Set(),
      orbs: [],
      player: null,
      scene: null,
      camera: null,
      renderer: null,
      rafTd: null,
   };

   /*--------------------------------------------------
   UI helpers
   ---------------------------------------------------- */
   const scoreEl = $('#game-score');
   const timeEl = $('#game-time');
   const overlay = $('#game-overlay');
   const overlayEyebrow = $('#game-overlay-eyebrow');
   const overlayTitle = $('#game-overlay-title');
   const startBtn = $('#game-start');
   const closeBtn = $('#game-close');

   function updatedHud(){
      if (scoreEl) scoreEl.textContent = String(state.score);
      if (timeEl) timeEl.textContent = String(Math.max(0, Math.ceil(state.timeLeft)));
   }

   function showOverlay({ eyebrow, title, text, startLabel})
   })