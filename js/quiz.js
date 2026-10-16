/* =========================================================
   SONIC LEARN — Quiz Page
   File: js/quiz.js
   Loaded by: quiz.html

   Responsibilities:
     - Fetch lessons.json via SonicLearn.loadLessonData()
     - Render the quiz picker (#quiz-picker) from lessons with quizzes
     - Run the question flow (prev / next / select answer)
     - Score the attempt and show the result panel
     - Record result via SonicLearn.recordQuiz()
     - Support retry

   Depends on: js/app.js → window.SonicLearn
   ========================================================= */

(() => {
  'use strict';

  const S = window.SonicLearn;
  if (!S) {
    console.error('[SonicLearn] quiz.js: app.js not loaded.');
    return;
  }

  const $ = (sel, root = document) => root.querySelector(sel);

  // Guard: only run on quiz.html
  const pickerEl = $('#quiz-picker');
  if (!pickerEl) return;

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  const state = {
    quizzes: [],        // [{ lesson, questions }]
    current: null,      // active quiz object
    index: 0,           // current question index
    answers: [],        // answers[i] = selected option index or null
  };

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  async function init() {
    pickerEl.setAttribute('aria-busy', 'true');

    const json = await S.loadLessonData();
    const lessons = Array.isArray(json.lessons) ? json.lessons : [];

    state.quizzes = lessons
      .filter((l) => Array.isArray(l.quiz) && l.quiz.length > 0)
      .map((l) => ({ lesson: l, questions: l.quiz }));

    pickerEl.setAttribute('aria-busy', 'false');
    renderPicker();
    wireShellButtons();
  }

  /* ---------------------------------------------------------
     Quiz picker
     --------------------------------------------------------- */
  function renderPicker() {
    if (!state.quizzes.length) {
      pickerEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">✓</span>
          <h3>No quizzes available</h3>
          <p>Add quizzes to lessons.json to see them here.</p>
        </div>`;
      return;
    }

    pickerEl.innerHTML = state.quizzes
      .map(({ lesson, questions }) => {
        const id    = S.escapeHTML(lesson.id);
        const title = S.escapeHTML(lesson.title);
        const topic = S.escapeHTML(lesson.topic || 'General');
        const count = questions.length;

        return `
          <article class="quiz-picker-card" data-id="${id}">
            <div class="quiz-picker-head">
              <span class="quiz-picker-icon" aria-hidden="true">✓</span>
              <span class="badge badge-blue">${topic}</span>
            </div>
            <h3>${title}</h3>
            <p class="text-small">${count} ${count === 1 ? 'question' : 'questions'}</p>
            <button
              class="button button-primary quiz-start"
              type="button"
              data-id="${id}"
              aria-label="Start quiz: ${title}"
            >
              Start quiz
            </button>
          </article>`;
      })
      .join('');

    pickerEl.querySelectorAll('.quiz-start').forEach((btn) => {
      btn.addEventListener('click', () =>
        startQuiz(btn.getAttribute('data-id'))
      );
    });
  }

  /* ---------------------------------------------------------
     Shell buttons (exit / prev / next / retry)
     --------------------------------------------------------- */
  function wireShellButtons() {
    const exitBtn  = $('#quiz-exit');
    const prevBtn  = $('#quiz-prev');
    const nextBtn  = $('#quiz-next');
    const retryBtn = $('#quiz-retry');

    if (exitBtn)  exitBtn.addEventListener('click', exitQuiz);
    if (prevBtn)  prevBtn.addEventListener('click', prevQuestion);
    if (nextBtn)  nextBtn.addEventListener('click', nextQuestion);
    if (retryBtn) retryBtn.addEventListener('click', () => {
      if (state.current) startQuiz(state.current.lesson.id);
    });
  }

  /* ---------------------------------------------------------
     Start / exit
     --------------------------------------------------------- */
  function startQuiz(lessonId) {
    const entry = state.quizzes.find((q) => q.lesson.id === lessonId);
    if (!entry) return;

    state.current = entry;
    state.index   = 0;
    state.answers = new Array(entry.questions.length).fill(null);

    // Show quiz area, hide picker + result
    showEl('#quiz-area', true);
    showEl('#quiz-picker-section', false);
    showEl('#quiz-result-section', false);

    // Set area title
    const titleEl = $('#quiz-area-title');
    if (titleEl) titleEl.textContent = entry.lesson.title;

    renderQuestion();
    announce(`Quiz started: ${entry.lesson.title}`);
  }

  function exitQuiz() {
    state.current = null;
    state.index   = 0;
    state.answers = [];

    showEl('#quiz-area', false);
    showEl('#quiz-result-section', false);
    showEl('#quiz-picker-section', true);

    // Scroll back to picker
    const pickerSection = $('#quiz-picker-section');
    if (pickerSection) pickerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    announce('Quiz closed.');
  }

  /* ---------------------------------------------------------
     Render current question
     --------------------------------------------------------- */
  function renderQuestion() {
    const q = state.current.questions[state.index];
    if (!q) return;

    const numberEl   = $('#question-number');
    const textEl     = $('#question-text');
    const listEl     = $('#answer-list');
    const progressEl = $('#quiz-progress-text');
    const prevBtn    = $('#quiz-prev');
    const nextBtn    = $('#quiz-next');

    const total = state.current.questions.length;

    if (numberEl) numberEl.textContent = `QUESTION ${state.index + 1}`;
    if (textEl)   textEl.textContent   = q.question;
    if (progressEl) {
      progressEl.textContent = `Question ${state.index + 1} of ${total}`;
    }

    const selected = state.answers[state.index];

    if (listEl) {
      listEl.innerHTML = (q.options || [])
        .map((opt, i) => {
          const checked = selected === i;
          return `
            <label class="answer-option ${checked ? 'selected' : ''}" data-index="${i}">
              <input
                type="radio"
                name="answer-${state.index}"
                value="${i}"
                ${checked ? 'checked' : ''}
              >
              <span>${S.escapeHTML(opt)}</span>
            </label>`;
        })
        .join('');

      // Wire option selection
      listEl.querySelectorAll('.answer-option').forEach((label) => {
        label.addEventListener('click', (e) => {
          e.preventDefault();
          selectAnswer(Number(label.getAttribute('data-index')));
        });
      });
    }

    if (prevBtn) prevBtn.disabled = state.index === 0;

    if (nextBtn) {
      const isLast = state.index === total - 1;
      nextBtn.textContent = isLast ? 'Submit' : 'Next';
      // Only disable on last question if no answer selected
      nextBtn.disabled = isLast && selected === null;
    }

    // Announce change of question for screen readers
    announce(`Question ${state.index + 1} of ${total}`);
  }

  /* ---------------------------------------------------------
     Answer selection
     --------------------------------------------------------- */
  function selectAnswer(i) {
    state.answers[state.index] = i;

    const listEl = $('#answer-list');
    if (listEl) {
      listEl.querySelectorAll('.answer-option').forEach((label) => {
        const idx = Number(label.getAttribute('data-index'));
        const isSelected = idx === i;
        label.classList.toggle('selected', isSelected);
        const input = label.querySelector('input');
        if (input) input.checked = isSelected;
      });
    }

    // Enable next on last question once an answer is chosen
    const nextBtn = $('#quiz-next');
    if (nextBtn) nextBtn.disabled = false;
  }

  /* ---------------------------------------------------------
     Navigation
     --------------------------------------------------------- */
  function prevQuestion() {
    if (state.index === 0) return;
    state.index -= 1;
    renderQuestion();
  }

  function nextQuestion() {
    const total = state.current.questions.length;

    // If last question → submit
    if (state.index === total - 1) {
      if (state.answers[state.index] === null) {
        S.announce('Please choose an answer before submitting.');
        return;
      }
      submitQuiz();
      return;
    }

    // Move forward
    state.index += 1;
    renderQuestion();
  }

  /* ---------------------------------------------------------
     Submit + result
     --------------------------------------------------------- */
  function submitQuiz() {
    const quiz = state.current;
    let score = 0;

    quiz.questions.forEach((q, i) => {
      if (state.answers[i] === q.answer) score += 1;
    });

    const total = quiz.questions.length;
    const pct   = total ? Math.round((score / total) * 100) : 0;

    // Show result section, hide quiz area
    showEl('#quiz-area', false);
    showEl('#quiz-result-section', true);

    const scoreEl   = $('#quiz-result-score');
    const summaryEl = $('#quiz-result-summary');
    const titleEl   = $('#quiz-result-title');

    if (scoreEl) scoreEl.textContent = `${pct}%`;
    if (summaryEl) {
      summaryEl.textContent = `You answered ${score} of ${total} correctly.`;
    }
    if (titleEl) {
      if (pct >= 80)      titleEl.textContent = 'Excellent work.';
      else if (pct >= 60) titleEl.textContent = 'Well done.';
      else if (pct >= 40) titleEl.textContent = 'Good start.';
      else                titleEl.textContent = 'Keep practising.';
    }

    // Record the attempt
    S.recordQuiz({
      id:    quiz.lesson.id,
      title: quiz.lesson.title,
      topic: quiz.lesson.topic,
      score,
      total,
    });

    // Scroll to result
    const resultSection = $('#quiz-result-section');
    if (resultSection) {
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    announce(`Quiz complete. Score: ${score} of ${total}.`);
  }

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
  function showEl(sel, visible) {
    const el = $(sel);
    if (!el) return;
    if (visible) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  function announce(msg) {
    S.announce(msg);
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