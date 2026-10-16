/* =========================================================
   SONIC LEARN — Lessons Page
   File: js/lessons.js
   Loaded by: lessons.html

   Responsibilities:
     - Fetch lessons.json via SonicLearn.loadLessonData()
     - Populate the topic filter (#lessons-topic)
     - Render lesson cards into #lessons-list
     - Interactive search (#lessons-search):
         · debounced input
         · match highlighting
         · clear button (#lessons-search-clear)
         · Enter clears and resets
         · Escape blurs
     - Topic filter + Reset button
     - Live result count (#lessons-count)
     - Inline reader (#lesson-reader) that keeps the grid visible
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
    search: '',        // current search query (raw)
    topic: '',         // selected topic
    openId: null,      // id of currently open lesson in the reader
  };

  const SEARCH_DEBOUNCE = 120; // ms
  let searchTimer = null;

  const completedIds = () =>
    new Set(S.readJSON(S.STORAGE.lessons, []).map((l) => l.id));

  /* ---------------------------------------------------------
     Boot
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
    const clearBtn    = $('#lessons-search-clear');
    const topicSelect = $('#lessons-topic');
    const resetBtn    = $('#lessons-reset');

    if (searchInput) {
      // Debounced live filtering
      searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        toggleClearButton();
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
          applyFilters();
        }, SEARCH_DEBOUNCE);
      });

      // Enter clears the search (quick escape hatch)
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearSearch({ focus: true });
        } else if (e.key === 'Escape') {
          if (searchInput.value) {
            clearSearch({ focus: true });
          } else {
            searchInput.blur();
          }
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => clearSearch({ focus: true }));
    }

    if (topicSelect) {
      topicSelect.addEventListener('change', (e) => {
        state.topic = e.target.value;
        applyFilters();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', resetFilters);
    }
  }

  /* ---------------------------------------------------------
     Search helpers
     --------------------------------------------------------- */
  function toggleClearButton() {
    const clearBtn = $('#lessons-search-clear');
    const searchInput = $('#lessons-search');
    if (!clearBtn || !searchInput) return;
    clearBtn.hidden = searchInput.value.length === 0;
  }

  function clearSearch({ focus = false } = {}) {
    const input = $('#lessons-search');
    if (input) input.value = '';
    state.search = '';
    toggleClearButton();
    applyFilters();
    if (focus && input) input.focus();
    S.announce('Search cleared.');
  }

  function resetFilters() {
    const searchInput = $('#lessons-search');
    const topicSelect = $('#lessons-topic');
    if (searchInput) searchInput.value = '';
    if (topicSelect) topicSelect.value = '';
    state.search = '';
    state.topic = '';
    toggleClearButton();
    applyFilters();
    S.announce('Filters reset.');
  }

  /* ---------------------------------------------------------
     Filtering
     --------------------------------------------------------- */
  function applyFilters() {
    const query = state.search.trim().toLowerCase();

    state.filtered = state.all.filter((lesson) => {
      const topicMatch =
        !state.topic ||
        (lesson.topic || 'General').trim() === state.topic;

      if (!topicMatch) return false;
      if (!query) return true;

      const haystack = [
        lesson.title,
        lesson.summary,
        lesson.topic,
        ...(lesson.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    renderLessons();
  }

  /* ---------------------------------------------------------
     Highlight matched text in a string
     --------------------------------------------------------- */
  function highlight(text, query) {
    const safe = S.escapeHTML(text || '');
    if (!query) return safe;

    // Escape regex special chars in query
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'ig');

    return safe.replace(re, '<mark>$1</mark>');
  }

  /* ---------------------------------------------------------
     Render the grid
     --------------------------------------------------------- */
  function renderLessons() {
    listEl.setAttribute('aria-busy', 'false');
    const countEl = $('#lessons-count');
    const completed = completedIds();
    const query = state.search.trim();

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
      if (reset) reset.addEventListener('click', resetFilters);
      return;
    }

    if (countEl) {
      countEl.textContent = `Showing ${state.filtered.length} of ${state.all.length} lessons`;
    }

    listEl.innerHTML = state.filtered
      .map((lesson) => {
        const isDone = completed.has(lesson.id);
        const isOpen = state.openId === lesson.id;

        const titleHtml   = highlight(lesson.title, query);
        const summaryHtml = highlight(lesson.summary || '', query);
        const topic       = S.escapeHTML(lesson.topic || 'General');
        const level       = S.escapeHTML(lesson.level || 'Beginner');
        const mins        = Number(lesson.duration) || 0;

        return `
          <article class="lesson-card ${isDone ? 'lesson-card-done' : ''} ${isOpen ? 'is-open' : ''}" data-id="${S.escapeHTML(lesson.id)}">
            <span class="lesson-icon" aria-hidden="true">${isDone ? '✓' : '▤'}</span>

            <div class="lesson-meta">
              <span class="badge badge-blue">${topic}</span>
              <span class="badge">${level}</span>
              <span class="badge">${mins} min</span>
            </div>

            <h3>${titleHtml}</h3>
            <p>${summaryHtml}</p>

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

    // Wire "Open lesson" buttons
    $$('.lesson-open', listEl).forEach((btn) => {
      btn.addEventListener('click', () => openLesson(btn.getAttribute('data-id')));
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

    // Refresh the grid so the open card gets .is-open state
    renderLessons();

    // Scroll reader into view
    reader.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Close button
    const closeBtn = reader.querySelector('.lesson-reader-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLesson);
      closeBtn.focus({ preventScroll: true });
    }

    // Mark complete button
    const doneBtn = reader.querySelector('#lesson-mark-complete');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => markComplete(lesson));
    }
  }

  function closeLesson() {
    const reader = $('#lesson-reader');
    const previousId = state.openId;
    if (!reader) return;

    reader.hidden = true;
    reader.innerHTML = '';
    state.openId = null;

    // Re-render grid to remove the .is-open class
    renderLessons();

    // Return focus to the card's open button
    if (previousId) {
      const btn = listEl.querySelector(
        `.lesson-open[data-id="${CSS.escape(previousId)}"]`
      );
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  function markComplete(lesson) {
    const record = S.recordLesson({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
    });

    if (record) {
      // Re-render grid so completed state appears
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