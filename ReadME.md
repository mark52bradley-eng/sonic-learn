# Sonic Learn

> An offline-first learning platform for students — built with plain HTML, CSS, and JavaScript.

Sonic Learn helps learners **study lessons, take interactive quizzes, track progress, and identify weak topics** through smart revision suggestions. It works even with limited or no internet, thanks to a service worker that caches the app shell and lesson data.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Data Format](#data-format)
- [Offline Support](#offline-support)
- [Accessibility](#accessibility)
- [Browser Support](#browser-support)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Dashboard (`index.html`)
- **At-a-glance stats** — lessons completed, quizzes taken, average score, study streak
- **Quick actions** — jump straight to lessons, quizzes, or your daily goal
- **Recent learning** — the last few activities you worked on
- **Daily study goal** — a simple target that resets each day
- **Topic performance** — see which topics you're strong in, and which need revision

### Lessons (`lessons.html`)
- Browse **15 built-in lessons** across Maths, Biology, Physics, Geography, Computing, and Study Skills
- Filter by **topic** or **keyword search**
- Read any lesson **inline** without leaving the page
- Mark lessons as **complete** — progress is saved locally

### Quizzes (`quiz.html`)
- Every lesson ships with its own **quiz**
- Take an attempt, review each question, and see your score
- Attempts are **saved to your dashboard automatically**
- Retry any quiz as many times as you like

### Offline-first
- A service worker caches the app shell, lesson data, and styles
- Once visited, Sonic Learn keeps working **without an internet connection**
- Progress is stored in `localStorage` — no accounts, no servers

---

## Project Structure

```text
.
├── Css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── lessons.js
│   ├── progress.js
│   └── quiz.js
├── About
├── favicon.ico
├── index.html
├── lessons.html
├── lessons.json
├── LICENSE
├── manifest.json
├── quiz.html
├── Readme.md
├── screenshot.png
└── sw.js
```
