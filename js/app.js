/* =========================================================
   SONIC LEARN — Shared Application Core
   File: js/app.js

   Loaded by every page. Provides:
     - Safe localStorage helpers (get/set JSON)
     - Small formatting utilities
     - Screen-reader announcer
     - Mobile sidebar shell (open/close/backdrop/Escape)
     - Today's date in the topbar
     - Footer year
     - lessons.json loader with session cache
     - Activity recording: lessons, quizzes, goal, streak
     - Public API exposed as window.SonicLearn

   Page-specific logic lives in:
     js/progress.js  → index.html dashboard widgets
     js/lessons.js   → lessons.html grid, filters, reader
     js/quiz.js      → quiz.html picker, questions, result

   Storage keys (localStorage):
     sonic.lessons   → [ { id, title, topic, completedAt } ]
     sonic.quizzes   → [ { id, title, topic, score, total, completedAt } ]
     sonic.goal      → { date, target, completed }
     sonic.streak    → { count, lastDate }
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     Constants
     --------------------------------------------------------- */
  const STORAGE = {
    lessons: 'sonic.lessons',
    quizzes: 'sonic.quizzes',
    goal:    'sonic.goal',
    streak:  'sonic.streak',
    data:    'sonic.data.cache',
  };

  const DATA_URL = 'lessons.json';

  /* ---------------------------------------------------------
     DOM helpers
     --------------------------------------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------------------------------------------------
     Time helpers
     --------------------------------------------------------- */
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatRelativeDate(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    const now  = new Date();
    const diffMin = Math.floor((now - then) / 60000);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1)   return 'Just now';
    if (diffMin < 60)  return `${diffMin} min ago`;
    if (diffHr  < 24)  return `${diffHr} hr ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7)   return `${diffDay} days ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------------------------------------------------------
     Number / string helpers
     --------------------------------------------------------- */
  function formatNumber(n) {
    return Number.isFinite(n) ? n.toLocaleString() : '0';
  }

  function formatPercent(v) {
    return Number.isFinite(v) ? `${Math.round(v)}` : '—';
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------
     Safe localStorage JSON
     --------------------------------------------------------- */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------
     Accessibility announcer
     --------------------------------------------------------- */
  const announcer = $('#app-announcer');

  function announce(message) {
    if (!announcer || !message) return;
    announcer.textContent = '';
    window.setTimeout(() => { announcer.textContent = message; }, 30);
  }

  /* ---------------------------------------------------------
     Shell: mobile sidebar
     --------------------------------------------------------- */
  function initSidebar() {
    const sidebar  = $('#sidebar');
    const backdrop = $('#sidebar-backdrop');
    const openBtn  = $('#menu-toggle');
    const closeBtn = $('#sidebar-close');

    if (!sidebar || !openBtn) return;

    const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

    function openSidebar() {
      sidebar.classList.add('open');
      if (backdrop) backdrop.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      const firstLink = sidebar.querySelector('.nav-link');
      if (firstLink) firstLink.focus({ preventScroll: true });
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      openBtn.focus({ preventScroll: true });
    }

    openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });

    window.addEventListener('resize', () => {
      if (!isMobile() && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.hidden = true;
        openBtn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });

    // Close on in-page anchor click while on mobile
    sidebar.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (link && isMobile()) closeSidebar();
    });
  }

  /* ---------------------------------------------------------
     Shell: today's date in the topbar
     --------------------------------------------------------- */
  function initToday() {
    const el = $('#today-date');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    el.setAttribute('datetime', now.toISOString().slice(0, 10));
  }

  /* ---------------------------------------------------------
     Shell: footer year
     --------------------------------------------------------- */
  function initFooterYear() {
    const el = $('#footer-year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------------------------------------------------------
     Data: lessons.json loader with session cache
     --------------------------------------------------------- */
  let dataPromise = null;

  function loadLessonData() {
    if (dataPromise) return dataPromise;

    // sessionStorage cache is fast and resets per tab session
    const cached = (() => {
      try {
        const raw = sessionStorage.getItem(STORAGE.data);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();

    if (cached && Array.isArray(cached.lessons)) {
      dataPromise = Promise.resolve(cached);
      return dataPromise;
    }

    dataPromise = fetch(DATA_URL, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (!json || !Array.isArray(json.lessons)) {
          throw new Error('lessons.json is missing the "lessons" array');
        }
        try { sessionStorage.setItem(STORAGE.data, JSON.stringify(json)); } catch {}
        return json;
      })
      .catch((err) => {
        console.error('[SonicLearn] loadLessonData failed:', err);
        announce('Could not load lesson data. Please try again.');
        return { lessons: [] };
      });

    return dataPromise;
  }

  function getLessonById(id) {
    return loadLessonData().then((json) =>
      json.lessons.find((l) => l.id === id) || null
    );
  }

  /* ---------------------------------------------------------
     Goal + streak
     --------------------------------------------------------- */
  function loadGoal() {
    const stored = readJSON(STORAGE.goal, null);
    const today  = todayKey();

    if (!stored || stored.date !== today) {
      const fresh = { date: today, target: 1, completed: 0 };
      writeJSON(STORAGE.goal, fresh);
      return fresh;
    }
    if (!stored.target || stored.target < 1) stored.target = 1;
    if (!Number.isFinite(stored.completed)) stored.completed = 0;
    return stored;
  }

  function incrementGoal() {
    const goal = loadGoal();
    goal.completed = (goal.completed || 0) + 1;
    writeJSON(STORAGE.goal, goal);
    return goal;
  }

  function bumpStreakIfNeeded() {
    const today  = todayKey();
    const streak = readJSON(STORAGE.streak, { count: 0, lastDate: null });
    if (streak.lastDate === today) return streak;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak.count = streak.lastDate === yesterday ? (streak.count || 0) + 1 : 1;
    streak.lastDate = today;
    writeJSON(STORAGE.streak, streak);
    return streak;
  }

  /* ---------------------------------------------------------
     Activity recording
     --------------------------------------------------------- */
  function recordLesson(data) {
    if (!data || !data.id) return null;

    const lessons = readJSON(STORAGE.lessons, []);

    // Avoid duplicates: only record once per lesson id
    if (lessons.some((l) => l.id === data.id)) {
      announce('Lesson already recorded.');
      return null;
    }

    const record = {
      id:          data.id,
      title:       data.title || 'Lesson',
      topic:       data.topic || 'General',
      completedAt: new Date().toISOString(),
    };

    lessons.push(record);
    writeJSON(STORAGE.lessons, lessons);
    bumpStreakIfNeeded();
    incrementGoal();

    announce(`Lesson recorded: ${record.title}`);
    return record;
  }

  function recordQuiz(data) {
    if (!data || !data.id) return null;

    const quizzes = readJSON(STORAGE.quizzes, []);

    const record = {
      id:          data.id,
      title:       data.title || 'Quiz',
      topic:       data.topic || 'General',
      score:       Number(data.score) || 0,
      total:       Number(data.total) || 0,
      completedAt: new Date().toISOString(),
    };

    quizzes.push(record);
    writeJSON(STORAGE.quizzes, quizzes);
    bumpStreakIfNeeded();
    incrementGoal();

    announce(`Quiz recorded: ${record.title} (${record.score}/${record.total})`);
    return record;
  }

  /* ---------------------------------------------------------
     Public API consumed by progress.js / lessons.js / quiz.js
     --------------------------------------------------------- */
  window.SonicLearn = {
    // storage
    readJSON,
    writeJSON,
    STORAGE,

    // time / number / string
    todayKey,
    formatRelativeDate,
    formatNumber,
    formatPercent,
    escapeHTML,

    // a11y
    announce,

    // shell
    initSidebar,
    initToday,
    initFooterYear,

    // data
    loadLessonData,
    getLessonById,

    // goals + streak
    loadGoal,
    incrementGoal,
    bumpStreakIfNeeded,

    // activity
    recordLesson,
    recordQuiz,
  };

  /* ---------------------------------------------------------
     Boot shell on every page
     --------------------------------------------------------- */
  function initShell() {
    initSidebar();
    initToday();
    initFooterYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();