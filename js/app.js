/* =========================================================
   SONIC LEARN — Application Logic
   File: js/app.js

   Responsibilities:
   - Mobile sidebar open/close + backdrop
   - Live "today" date in the topbar
   - Populate dashboard stats from localStorage
   - Render recent learning list (with empty state)
   - Daily study goal progress bar
   - Progress summary + topic performance
   - Footer year
   - Screen-reader announcements

   Storage keys (localStorage):
     sonic.lessons        → array of completed lesson records
     sonic.quizzes        → array of completed quiz records
     sonic.goal           → { date, target, completed }
     sonic.streak         → { count, lastDate }

   Record shapes:
     lesson: { id, title, topic, completedAt }
     quiz:   { id, title, topic, score, total, completedAt }
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     Constants & helpers
     --------------------------------------------------------- */
  const STORAGE = {
    lessons: 'sonic.lessons',
    quizzes: 'sonic.quizzes',
    goal:    'sonic.goal',
    streak:  'sonic.streak',
  };

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const todayKey = () => new Date().toISOString().slice(0, 10);

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
    } catch {
      /* storage may be disabled — fail silently */
    }
  }

  function formatNumber(n) {
    return Number.isFinite(n) ? n.toLocaleString() : '0';
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${Math.round(value)}` : '—';
  }

  function formatRelativeDate(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    const now = new Date();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hr ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------------------------------------------------------
     Accessibility announcer
     --------------------------------------------------------- */
  const announcer = $('#app-announcer');
  function announce(message) {
    if (!announcer || !message) return;
    announcer.textContent = '';
    // Yield to next tick so repeated messages are picked up by screen readers
    window.setTimeout(() => { announcer.textContent = message; }, 30);
  }

  /* ---------------------------------------------------------
     Mobile sidebar
     --------------------------------------------------------- */
  function initSidebar() {
    const sidebar    = $('#sidebar');
    const backdrop   = $('#sidebar-backdrop');
    const openBtn    = $('#menu-toggle');
    const closeBtn   = $('#sidebar-close');
    if (!sidebar || !openBtn) return;

    const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

    function openSidebar() {
      sidebar.classList.add('open');
      if (backdrop) backdrop.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      // Focus first nav link for keyboard users
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

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });

    // Close when resizing back to desktop
    window.addEventListener('resize', () => {
      if (!isMobile() && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.hidden = true;
        openBtn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });

    // In-page anchor links should close the sidebar on mobile
    sidebar.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (link && isMobile()) closeSidebar();
    });
  }

  /* ---------------------------------------------------------
     Today's date in the topbar
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
     Footer year
     --------------------------------------------------------- */
  function initFooterYear() {
    const el = $('#footer-year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------------------------------------------------------
     Stats — lessons, quizzes, average, streak
     --------------------------------------------------------- */
  function computeStats() {
    const lessons = readJSON(STORAGE.lessons, []);
    const quizzes = readJSON(STORAGE.quizzes, []);

    const totalScores = quizzes
      .map(q => (q.total ? (q.score / q.total) * 100 : null))
      .filter(v => Number.isFinite(v));

    const average = totalScores.length
      ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
      : null;

    const streak = readJSON(STORAGE.streak, { count: 0, lastDate: null });

    return {
      lessonsCount: lessons.length,
      quizzesCount: quizzes.length,
      average,
      streak: streak.count || 0,
    };
  }

  function renderStats() {
    const stats = computeStats();

    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };

    setText('#lessons-completed', formatNumber(stats.lessonsCount));
    setText('#quizzes-completed', formatNumber(stats.quizzesCount));
    setText('#average-score',     formatPercent(stats.average));
    setText('#study-streak',      formatNumber(stats.streak));
  }

  /* ---------------------------------------------------------
     Recent learning
     --------------------------------------------------------- */
  function renderRecentLearning() {
    const container = $('#recent-lessons');
    if (!container) return;

    const lessons = readJSON(STORAGE.lessons, []);
    const quizzes = readJSON(STORAGE.quizzes, []);

    // Merge and sort by completedAt desc
    const combined = [
      ...lessons.map(l => ({ ...l, kind: 'lesson' })),
      ...quizzes.map(q => ({ ...q, kind: 'quiz'  })),
    ]
      .filter(item => item.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 4);

    container.setAttribute('aria-busy', 'false');

    if (combined.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">▤</span>
          <h3>Your next lesson starts here</h3>
          <p>Open the lessons page to explore available learning material.</p>
          <a class="button button-secondary" href="lessons.html">Browse lessons</a>
        </div>
      `;
      return;
    }

    const items = combined.map(item => {
      const title = item.title || (item.kind === 'quiz' ? 'Quiz attempt' : 'Lesson');
      const topic = item.topic ? ` · ${item.topic}` : '';
      const when  = formatRelativeDate(item.completedAt);
      const meta  = item.kind === 'quiz' && item.total
        ? `Score: ${item.score}/${item.total} · ${when}`
        : when;

      const href = item.kind === 'quiz' ? 'quiz.html' : 'lessons.html';
      return `
        <a class="lesson-item" href="${href}">
          <h3>${escapeHTML(title)}${escapeHTML(topic)}</h3>
          <p class="text-small">${escapeHTML(meta)}</p>
        </a>
      `;
    }).join('');

    container.innerHTML = items;
  }

  /* ---------------------------------------------------------
     Daily goal
     --------------------------------------------------------- */
  function loadGoal() {
    const stored = readJSON(STORAGE.goal, null);
    const today  = todayKey();

    if (!stored || stored.date !== today) {
      const fresh = { date: today, target: 1, completed: 0 };
      writeJSON(STORAGE.goal, fresh);
      return fresh;
    }
    // Ensure target at least 1
    if (!stored.target || stored.target < 1) stored.target = 1;
    if (!Number.isFinite(stored.completed)) stored.completed = 0;
    return stored;
  }

  function renderGoal() {
    const goal = loadGoal();

    const completedEl = $('#goal-completed');
    const targetEl    = $('#goal-target');
    const barEl       = $('#goal-progressbar');
    const fillEl      = $('#goal-progress-fill');
    const messageEl   = $('#goal-message');

    if (completedEl) completedEl.textContent = formatNumber(goal.completed);
    if (targetEl)    targetEl.textContent    = formatNumber(goal.target);

    const ratio = goal.target > 0
      ? Math.min(goal.completed / goal.target, 1)
      : 0;
    const percent = Math.round(ratio * 100);

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (barEl) {
      barEl.setAttribute('aria-valuemin', '0');
      barEl.setAttribute('aria-valuemax', String(goal.target));
      barEl.setAttribute('aria-valuenow', String(goal.completed));
      barEl.setAttribute('aria-valuetext', `${goal.completed} of ${goal.target} activities completed`);
    }

    if (messageEl) {
      if (goal.completed === 0) {
        messageEl.textContent = 'Start a lesson or quiz to make progress toward your goal.';
      } else if (goal.completed < goal.target) {
        const left = goal.target - goal.completed;
        messageEl.textContent = `${left} more ${left === 1 ? 'activity' : 'activities'} to reach today's goal.`;
      } else {
        messageEl.textContent = 'Goal complete — well done. Anything extra is a bonus.';
      }
    }
  }

  /* ---------------------------------------------------------
     Progress summary + topic performance
     --------------------------------------------------------- */
  function renderProgressSummary() {
    const stats = computeStats();
    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    setText('#progress-lessons-value', formatNumber(stats.lessonsCount));
    setText('#progress-quizzes-value', formatNumber(stats.quizzesCount));
    setText('#progress-average-value', formatPercent(stats.average));
  }

  function renderTopicPerformance() {
    const container = $('#topic-performance');
    if (!container) return;

    const lessons = readJSON(STORAGE.lessons, []);
    const quizzes = readJSON(STORAGE.quizzes, []);

    // Aggregate per topic
    const topics = new Map();

    function ensure(topic) {
      if (!topics.has(topic)) {
        topics.set(topic, { topic, lessons: 0, quizzes: 0, scoreSum: 0, scoreTotal: 0 });
      }
      return topics.get(topic);
    }

    lessons.forEach(l => {
      const t = (l.topic || 'General').trim();
      ensure(t).lessons += 1;
    });

    quizzes.forEach(q => {
      const t = (q.topic || 'General').trim();
      const entry = ensure(t);
      entry.quizzes += 1;
      if (q.total) {
        entry.scoreSum   += q.score || 0;
        entry.scoreTotal += q.total;
      }
    });

    if (topics.size === 0) {
      container.innerHTML = `
        <div class="empty-state empty-state-compact">
          <span class="empty-state-icon" aria-hidden="true">↗</span>
          <h3>Your progress will appear here</h3>
          <p>Complete lessons and quizzes to build your learning history.</p>
        </div>
      `;
      return;
    }

    const rows = Array.from(topics.values()).map(t => {
      const avg = t.scoreTotal
        ? Math.round((t.scoreSum / t.scoreTotal) * 100)
        : null;
      return { ...t, avg };
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

    container.innerHTML = rows.map(row => {
      const label = escapeHTML(row.topic);
      const percent = row.avg ?? 0;
      const scoreText = row.avg === null ? 'No quiz data yet' : `${row.avg}% average`;
      return `
        <div class="topic-row">
          <div class="topic-row-head">
            <span class="topic-row-name">${label}</span>
            <span class="topic-row-score text-small">${escapeHTML(scoreText)}</span>
          </div>
          <div class="progress-track" role="progressbar"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"
               aria-label="${label} performance">
            <div class="progress-fill" style="--progress:${percent}%"></div>
          </div>
          <div class="topic-row-meta text-small">
            ${row.lessons} ${row.lessons === 1 ? 'lesson' : 'lessons'} ·
            ${row.quizzes} ${row.quizzes === 1 ? 'quiz' : 'quizzes'}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------------------------------------------------------
     Streak maintenance (called on each activity)
     --------------------------------------------------------- */
  function bumpStreakIfNeeded() {
    const today = todayKey();
    const streak = readJSON(STORAGE.streak, { count: 0, lastDate: null });
    if (streak.lastDate === today) return;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak.count = streak.lastDate === yesterday ? (streak.count || 0) + 1 : 1;
    streak.lastDate = today;
    writeJSON(STORAGE.streak, streak);
  }

  /* ---------------------------------------------------------
     Small HTML escape helper for safe interpolation
     --------------------------------------------------------- */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------
     Public helper: register an activity
     Other pages (lessons.html, quiz.html) can call:
       window.SonicLearn.recordLesson({ id, title, topic })
       window.SonicLearn.recordQuiz({ id, title, topic, score, total })
     --------------------------------------------------------- */
  function recordLesson(data) {
    const lessons = readJSON(STORAGE.lessons, []);
    lessons.push({
      id: data.id || `lesson-${Date.now()}`,
      title: data.title || 'Lesson',
      topic: data.topic || 'General',
      completedAt: new Date().toISOString(),
    });
    writeJSON(STORAGE.lessons, lessons);
    bumpStreakIfNeeded();
    incrementGoal();
    refreshDashboard();
    announce(`Lesson recorded: ${data.title || 'Lesson'}`);
  }

  function recordQuiz(data) {
    const quizzes = readJSON(STORAGE.quizzes, []);
    quizzes.push({
      id: data.id || `quiz-${Date.now()}`,
      title: data.title || 'Quiz',
      topic: data.topic || 'General',
      score: Number(data.score) || 0,
      total: Number(data.total) || 0,
      completedAt: new Date().toISOString(),
    });
    writeJSON(STORAGE.quizzes, quizzes);
    bumpStreakIfNeeded();
    incrementGoal();
    refreshDashboard();
    announce(`Quiz recorded: ${data.title || 'Quiz'}`);
  }

  function incrementGoal() {
    const goal = loadGoal();
    goal.completed = (goal.completed || 0) + 1;
    writeJSON(STORAGE.goal, goal);
  }

  /* ---------------------------------------------------------
     Refresh every visible widget
     --------------------------------------------------------- */
  function refreshDashboard() {
    renderStats();
    renderRecentLearning();
    renderGoal();
    renderProgressSummary();
    renderTopicPerformance();
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function init() {
    initSidebar();
    initToday();
    initFooterYear();
    refreshDashboard();

    // Optional: refresh when the tab regains focus (in case another tab
    // recorded activity)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshDashboard();
    });

    // Cross-tab sync
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('sonic.')) refreshDashboard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ---------------------------------------------------------
     Expose a small public API for other pages
     --------------------------------------------------------- */
  window.SonicLearn = {
    recordLesson,
    recordQuiz,
    refresh: refreshDashboard,
    storageKeys: { ...STORAGE },
  };
})();