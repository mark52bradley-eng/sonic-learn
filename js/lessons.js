/* =========================================================
   SONIC LEARN — Lessons Page
   File: js/lessons.js
   Loaded by: lessons.html

   Responsibilities:
     - Fetch lessons.json via SonicLearn.loadLessonData()
     - Populate the topic filter (#lessons-topic)
     - Render lesson cards into #lessons-list
     - Wire search (#lessons-search), topic filter, reset (#lessons-reset)
     - Update the live count (#lessons-count)
     - Open an inline lesson reader (#lesson-reader)
     - Mark lesson complete → SonicLearn.recordLesson()

   Depends on: js/app.js → window.SonicLearn
   ========================================================= */

(() => {
  'use strict';

  const S = window.SonicLearn;
  if (!S) {
    console.error('[SonicLearn] lessons.js: app.js not loaded.');
    return;
  }

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Guard: only run on lessons.html
  const listEl = $('#lessons-list');
  if (!listEl) return;

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  const state = {
    all: [],           // full lesson array from lessons.json
    filtered: [],      // currently visible lessons
    search: '',        // search query
    topic: '',         // selected topic
    openId: null,      // id of currently open lesson in reader
  };

  const completedIds = () =>
    new Set(S.readJSON(S.STORAGE.lessons, []).map((l) => l.id));

  /* ---------------------------------------------------------
     Boot: load data, populate filter, render
     --------------------------------------------------------- */
  async function init() {
    listEl.setAttribute('aria-busy', 'true');

    const json = await S.loadLessonData();
    state.all = Array.isArray(json.lessons) ? json.lessons : [];
    state.filtered = [...state.all];

    populateTopicFilter();
    wireToolbar();
    renderLessons();
  }

  /* ---------------------------------------------------------
     Topic filter dropdown
     --------------------------------------------------------- */
  function populateTopicFilter() {
    const select = $('#lessons-topic');
    if (!select) return;

    const topics = Array.from(
      new Set(state.all.map((l) => (l.topic || 'General').trim()))
    ).sort();

    // Keep the "All topics" option, replace the rest
    select.innerHTML =
      `<option value="">All topics</option>` +
      topics
        .map(
          (t) =>
            `<option value="${S.escapeHTML(t)}">${S.escapeHTML(t)}</option>`
        )
        .join('');
  }

  /* ---------------------------------------------------------
     Toolbar wiring
     --------------------------------------------------------- */
  function wireToolbar() {
    const searchInput = $('#lessons-search');
    const topicSelect = $('#lessons-topic');
    const resetBtn    = $('#lessons-reset');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.search = e.target.value.trim().toLowerCase();
        applyFilters();
      });
    }

    if (topicSelect) {
      topicSelect.addEventListener('change', (e) => {
        state.topic = e.target.value;
        applyFilters();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (topicSelect) topicSelect.value = '';
        state.search = '';
        state.topic = '';
        applyFilters();
        S.announce('Filters reset.');
      });
    }
  }

  /* ---------------------------------------------------------
     Filtering
     --------------------------------------------------------- */
  function applyFilters() {
    state.filtered = state.all.filter((lesson) => {
      const topicMatch =
        !state.topic ||
        (lesson.topic || 'General').trim() === state.topic;

      if (!topicMatch) return false;
      if (!state.search) return true;

      const haystack = [
        lesson.title,
        lesson.summary,
        lesson.topic,
        ...(lesson.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(state.search);
    });

    renderLessons();
  }

  /* ---------------------------------------------------------
     Render the grid
     --------------------------------------------------------- */
  function renderLessons() {
    listEl.setAttribute('aria-busy', 'false');
    const countEl = $('#lessons-count');
    const completed = completedIds();

    if (!state.filtered.length) {
      if (countEl) countEl.textContent = 'No lessons found';
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">▤</span>
          <h3>No lessons match your filters</h3>
          <p>Try a different topic or clear your search.</p>
          <button class="button button-secondary" id="lessons-empty-reset" type="button">
            Reset filters
          </button>
        </div>`;

      const reset = $('#lessons-empty-reset');
      if (reset) {
        reset.addEventListener('click', () => {
          const searchInput = $('#lessons-search');
          const topicSelect = $('#lessons-topic');
          if (searchInput) searchInput.value = '';
          if (topicSelect) topicSelect.value = '';
          state.search = '';
          state.topic = '';
          applyFilters();
        });
      }
      return;
    }

    if (countEl) {
      countEl.textContent = `Showing ${state.filtered.length} of ${state.all.length} lessons`;
    }

    listEl.innerHTML = state.filtered
      .map((lesson) => {
        const isDone = completed.has(lesson.id);
        const topic  = S.escapeHTML(lesson.topic || 'General');
        const level  = S.escapeHTML(lesson.level || 'Beginner');
        const mins   = Number(lesson.duration) || 0;

        return `
          <article class="lesson-card ${isDone ? 'lesson-card-done' : ''}" data-id="${S.escapeHTML(lesson.id)}">
            <span class="lesson-icon" aria-hidden="true">${isDone ? '✓' : '▤'}</span>

            <div class="lesson-meta">
              <span class="badge badge-blue">${topic}</span>
              <span class="badge">${level}</span>
              <span class="badge">${mins} min</span>
            </div>

            <h3>${S.escapeHTML(lesson.title)}</h3>
            <p>${S.escapeHTML(lesson.summary || '')}</p>

            <div class="lesson-footer">
              <button
                class="button button-primary lesson-open"
                type="button"
                data-id="${S.escapeHTML(lesson.id)}"
                aria-label="Open lesson: ${S.escapeHTML(lesson.title)}"
              >
                ${isDone ? 'Review lesson' : 'Open lesson'}
              </button>
              ${isDone ? '<span class="badge badge-green">Completed</span>' : ''}
            </div>
          </article>`;
      })
      .join('');

    // Wire "Open lesson" buttons via event delegation
    listEl.querySelectorAll('.lesson-open').forEach((btn) => {
      btn.addEventListener('click', () =>
        openLesson(btn.getAttribute('data-id'))
      );
    });
  }

  /* ---------------------------------------------------------
     In-page lesson reader
     --------------------------------------------------------- */
  function openLesson(id) {
    const lesson = state.all.find((l) => l.id === id);
    if (!lesson) return;

    const reader = $('#lesson-reader');
    if (!reader) {
      // Fallback: if the reader container is missing, do nothing but log
      console.warn('[SonicLearn] #lesson-reader not found in lessons.html');
      return;
    }

    state.openId = id;

    const isDone = completedIds().has(id);

    reader.hidden = false;
    reader.innerHTML = `
      <div class="lesson-reader-shell" role="region" aria-labelledby="lesson-reader-title">
        <div class="lesson-reader-head">
          <div>
            <p class="eyebrow">${S.escapeHTML(lesson.topic || 'General')}</p>
            <h2 id="lesson-reader-title">${S.escapeHTML(lesson.title)}</h2>
            <p class="section-description">${S.escapeHTML(lesson.summary || '')}</p>
          </div>
          <button class="icon-button lesson-reader-close" type="button" aria-label="Close lesson">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div class="lesson-body">
          ${(lesson.body || [])
            .map((p) => `<p>${S.escapeHTML(p)}</p>`)
            .join('')}
        </div>

        <div class="lesson-complete-bar">
          ${
            isDone
              ? `<span class="badge badge-green">Completed</span>
                 <a class="button button-secondary" href="quiz.html">Take the quiz</a>`
              : `<button class="button button-primary" id="lesson-mark-complete" type="button">
                   Mark as complete
                 </button>
                 <a class="button button-secondary" href="quiz.html">Skip to quiz</a>`
          }
        </div>
      </div>`;

    // Scroll into view for keyboard and screen-reader users
    reader.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const closeBtn = reader.querySelector('.lesson-reader-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLesson);
      closeBtn.focus({ preventScroll: true });
    }

    const doneBtn = reader.querySelector('#lesson-mark-complete');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => markComplete(lesson));
    }
  }

  function closeLesson() {
    const reader = $('#lesson-reader');
    if (!reader) return;
    reader.hidden = true;
    reader.innerHTML = '';
    state.openId = null;

    // Return focus to the lesson card's open button if it still exists
    if (state.openId) return;
  }

  function markComplete(lesson) {
    const record = S.recordLesson({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
    });

    if (record) {
      // Re-render the grid so the completed badge appears
      renderLessons();
      // Re-render the reader so its footer updates
      openLesson(lesson.id);
    }
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();