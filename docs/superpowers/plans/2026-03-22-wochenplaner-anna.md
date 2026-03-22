# Wochenplaner Anna — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based weekly planner for illustrator Anna with time-blocking, timer/nudging, template system, PDF export, and IndexedDB persistence.

**Architecture:** Vanilla HTML/CSS/JS, no framework, no build tool. Global `WP` namespace shared across files. IndexedDB via `idb` library. CDN libraries bundled locally in `libs/`.

**Tech Stack:** HTML5, CSS3 (custom properties, grid, absolute positioning), Vanilla JS (ES2020), IndexedDB (idb v8), jsPDF 2.5.1, html2canvas 1.4.1

**Spec:** `docs/superpowers/specs/2026-03-22-wochenplaner-anna-design.md`

---

### Task 1: index.html + CSS foundation
**Files:** Create `index.html`, `css/style.css`

### Task 2: data.js — constants, helpers, default template
**Files:** Create `js/data.js`

### Task 3: db.js — IndexedDB layer
**Files:** Create `js/db.js`

### Task 4: render.js — week grid, blocks, panels
**Files:** Create `js/render.js`

### Task 5: timer.js — timer state machine + notifications
**Files:** Create `js/timer.js`

### Task 6: app.js — main app logic, events, navigation
**Files:** Create `js/app.js`

### Task 7: GitHub Pages deployment
**Files:** `.gitignore`, push to GitHub, enable Pages
