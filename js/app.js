
/*
 * SONIC LEARN — Dashboard Application
 * File: js/app.js
 *
 * Features:
 * - Dashboard statistics
 * - Persistent lesson and quiz progress
 * - Daily study goals
 * - Study streaks
 * - Topic performance
 * - Mobile sidebar
 * - Progress view
 * - Offline service worker registration
 */

"use strict";

(() => {
  const STORAGE_KEY = "sonicLearnProgress";
  const DAILY_GOAL = 3;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // ---------- Storage ----------

  function loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        return {
          completedLessons: Array.isArray(parsed.completedLessons)
            ? parsed.completedLessons
            : [],
          quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
          studyDays: Array.isArray(parsed.studyDays) ? parsed.studyDays : [],
          activities: Array.isArray(parsed.activities)
            ? parsed.activities
            : []
        };
      }
    } catch (error) {
      console.warn("Could not load saved progress:", error);
    }

    return {
      completedLessons: [],
      quizzes: [],
      studyDays: [],
      activities: []
    };
  }

  let progress = loadProgress();

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      return true;
    } catch (error) {
      console.error("Could not save learning progress:", error);
      return false;
    }
  }

  // Use local calendar dates rather than UTC dates.
  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function yesterdayKey() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return todayKey(date);
  }

  // ---------- Activity tracking ----------

  function recordActivity(type, details = {}) {
    const now = new Date();
    const today = todayKey(now);

    progress.activities.push({
      type,
      date: today,
      timestamp: now.toISOString(),
      ...details
    });

    // Keep recent activity history bounded.
    progress.activities = progress.activities.slice(-500);

    if (!progress.studyDays.includes(today)) {
      progress.studyDays.push(today);
    }

    // Keep enough history for a long study streak.
    progress.studyDays = [...new Set(progress.studyDays)].sort().slice(-400);

    saveProgress();
    renderDashboard();
  }

  /**
   * Mark a lesson complete.
   *
   * Example:
   * SonicLearn.completeLesson("math-algebra", "Algebra");
   */
  function completeLesson(id, title = "Lesson") {
    if (id === undefined || id === null || String(id).trim() === "") {
      console.warn("A lesson ID is required.");
      return;
    }

    const lessonId = String(id);

    const alreadyCompleted = progress.completedLessons.some(
      (lesson) => lesson.id === lessonId
    );

    // Don't count the same lesson twice.
    if (alreadyCompleted) {
      return;
    }

    progress.completedLessons.push({
      id: lessonId,
      title: String(title),
      completedAt: new Date().toISOString(),
      date: todayKey()
    });

    recordActivity("lesson", {
      id: lessonId,
      title: String(title)
    });
  }

  /**
   * Save a quiz result.
   *
   * Example:
   * SonicLearn.recordQuizAttempt({
   *   score: 8,
   *   total: 10,
   *   topic: "Mathematics"
   * });
   */
  function recordQuizAttempt({
    score,
    total,
    topic = "General",
    title = "Practice quiz"
  } = {}) {
    const numericScore = Number(score);
    const numericTotal = Number(total);

    if (
      !Number.isFinite(numericScore) ||
      !Number.isFinite(numericTotal) ||
      numericTotal <= 0 ||
      numericScore < 0 ||
      numericScore > numericTotal
    ) {
      console.warn("Invalid quiz score. Provide a valid score and total.");
      return;
    }

    const percentage = Math.round(
      (numericScore / numericTotal) * 100
    );

    progress.quizzes.push({
      score: numericScore,
      total: numericTotal,
      percentage,
      topic: String(topic),
      title: String(title),
      date: todayKey(),
      completedAt: new Date().toISOString()
    });

    recordActivity("quiz", {
      title: String(title),
      topic: String(topic),
      percentage
    });
  }

  // ---------- Statistics ----------

  function getStudyStreak() {
    const days = new Set(progress.studyDays);
    let cursor = todayKey();

    // A streak can still be active if the learner hasn't studied today yet.
    if (!days.has(cursor)) {
      cursor = yesterdayKey();

      if (!days.has(cursor)) {
        return 0;
      }
    }

    let streak = 0;

    while (days.has(cursor)) {
      streak++;

      const date = new Date(`${cursor}T12:00:00`);
      date.setDate(date.getDate() - 1);
      cursor = todayKey(date);
    }

    return streak;
  }

  function getTodayActivities() {
    const today = todayKey();

    return progress.activities.filter(
      (activity) => activity.date === today
    ).length;
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = String(value);
    }
  }

  // ---------- Dashboard rendering ----------

  function renderDate() {
    const element = $("#today-date");

    if (!element) return;

    element.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date());
  }

  function renderStatistics() {
    setText("lessons-completed", progress.completedLessons.length);
    setText("quizzes-completed", progress.quizzes.length);
    setText("study-streak", getStudyStreak());

    const scoreElement = $("#average-score");

    if (scoreElement) {
      if (progress.quizzes.length === 0) {
        scoreElement.textContent = "—";
      } else {
        const average =
          progress.quizzes.reduce(
            (sum, quiz) => sum + quiz.percentage,
            0
          ) / progress.quizzes.length;

        scoreElement.textContent = `${Math.round(average)}%`;
      }
    }
  }

  function renderGoal() {
    const completed = getTodayActivities();
    const goal = DAILY_GOAL;
    const percentage = Math.min(100, (completed / goal) * 100);

    setText("goal-completed", Math.min(completed, goal));
    setText("goal-target", goal);

    const bar = $("#goal-progressbar");
    const fill = $("#goal-progress-fill");
    const message = $("#goal-message");

    if (bar) {
      bar.setAttribute("aria-valuemax", String(goal));
      bar.setAttribute("aria-valuenow", String(Math.min(completed, goal)));
    }

    if (fill) {
      fill.style.width = `${percentage}%`;
    }

    if (message) {
      if (completed === 0) {
        message.textContent =
          "Complete a lesson or quiz to get started.";
      } else if (completed < goal) {
        message.textContent =
          `${goal - completed} more ${goal - completed === 1 ? "activity" : "activities"} to reach today's goal.`;
      } else {
        message.textContent =
          "Daily goal achieved! Excellent work. Keep learning.";
      }
    }
  }

  function renderRecentLessons() {
    const container = $("#recent-lessons");

    if (!container || progress.completedLessons.length === 0) {
      return;
    }

    const recent = [...progress.completedLessons]
      .reverse()
      .slice(0, 3);

    container.replaceChildren();

    recent.forEach((lesson) => {
      const item = document.createElement("article");
      item.className = "lesson-item";

      const symbol = document.createElement("div");
      symbol.className = "lesson-symbol";
      symbol.textContent = "✓";
      symbol.setAttribute("aria-hidden", "true");

      const info = document.createElement("div");
      info.className = "lesson-info";

      const title = document.createElement("h3");
      title.textContent = lesson.title;

      const description = document.createElement("p");
      description.textContent = "Completed lesson";

      info.append(title, description);
      item.append(symbol, info);
      container.append(item);
    });
  }

  function renderProgressDetails() {
    const summary = $("#progress-summary");
    const topicContainer = $("#topic-performance");

    if (summary) {
      summary.textContent =
        `You have completed ${progress.completedLessons.length} lessons ` +
        `and attempted ${progress.quizzes.length} quizzes. ` +
        `Your current study streak is ${getStudyStreak()} days.`;
    }

    if (!topicContainer) return;

    topicContainer.replaceChildren();

    if (progress.quizzes.length === 0) {
      const message = document.createElement("p");
      message.textContent =
        "Complete a quiz to see your performance by topic.";
      topicContainer.append(message);
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Topic performance";
    topicContainer.append(heading);

    const topics = new Map();

    progress.quizzes.forEach((quiz) => {
      const topic = quiz.topic || "General";

      if (!topics.has(topic)) {
        topics.set(topic, []);
      }

      topics.get(topic).push(quiz.percentage);
    });

    topics.forEach((scores, topic) => {
      const average = Math.round(
        scores.reduce((sum, score) => sum + score, 0) / scores.length
      );

      const row = document.createElement("div");
      row.className = "topic-progress";
      row.style.marginTop = "18px";

      const label = document.createElement("div");
      label.className = "progress-label";

      const topicName = document.createElement("span");
      topicName.textContent = topic;

      const value = document.createElement("strong");
      value.textContent = `${average}%`;

      label.append(topicName, value);

      const track = document.createElement("div");
      track.className = "progress-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${topic} average score`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(average));

      const fill = document.createElement("div");
      fill.className = "progress-fill";
      fill.style.width = `${average}%`;

      track.append(fill);
      row.append(label, track);
      topicContainer.append(row);
    });
  }

  function renderDashboard() {
    renderStatistics();
    renderGoal();
    renderRecentLessons();
    renderProgressDetails();
  }

  // ---------- Progress navigation ----------

  function showProgress() {
    const section = $("#progress-section");

    if (!section) return;

    section.hidden = false;
    renderProgressDetails();

    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start"
    });
  }

  $("#progress-nav")?.addEventListener("click", showProgress);
  $("#view-progress")?.addEventListener("click", showProgress);

  // ---------- Mobile sidebar ----------

  const menuToggle = $("#menu-toggle");
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebar-backdrop");

  function setMenuOpen(open) {
    sidebar?.classList.toggle("sidebar-open", open);

    if (backdrop) {
      backdrop.hidden = !open;
    }

    menuToggle?.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = sidebar?.classList.contains("sidebar-open");
    setMenuOpen(!isOpen);
  });

  backdrop?.addEventListener("click", () => setMenuOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
    }
  });

  $$(".navigation a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setMenuOpen(false);
    }
  });

  // ---------- Service worker ----------

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    });
  }

  // ---------- Public API for other pages ----------

  window.SonicLearn = Object.freeze({
    completeLesson,
    recordQuizAttempt,
    getProgress: () => JSON.parse(JSON.stringify(progress)),
    refresh: renderDashboard
  });

  // Update this tab if another tab changes progress.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      progress = loadProgress();
      renderDashboard();
    }
  });

  // ---------- Start application ----------

  renderDate();
  renderDashboard();
})();
