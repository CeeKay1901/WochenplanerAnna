'use strict';
window.WP = window.WP || {};

WP.render = {

  // ─── Format seconds → "MM:SS" or "H:MM:SS" ──────────────────────────────────
  formatSeconds(s) {
    const abs = Math.abs(s);
    const h   = Math.floor(abs / 3600);
    const m   = Math.floor((abs % 3600) / 60);
    const sec = abs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },

  // ─── Time axis (08:00–20:00) ─────────────────────────────────────────────────
  timeAxis() {
    let html = '<div class="time-axis">';
    for (let h = 8; h <= 20; h++) {
      const top = (h * 60 - WP.CALENDAR_START);
      html += `<div class="hour-mark" style="top:${top}px">${String(h).padStart(2, '0')}:00</div>`;
    }
    html += '</div>';
    return html;
  },

  // ─── Single block ────────────────────────────────────────────────────────────
  block(block, isTemplate = false) {
    const cat      = WP.CATEGORIES[block.category] || WP.CATEGORIES.buffer;
    const startMin = WP.timeToMinutes(block.startTime);
    const top      = startMin - WP.CALENDAR_START;
    const height   = Math.max(block.duration, 15);
    const elapsed  = WP.timer ? WP.timer.getCurrentElapsed(block) : (block.timerElapsed || 0);
    const durSec   = block.duration * 60;
    const remaining = durSec - elapsed;
    const isEvent   = block.category === 'event';

    // Timer state classes
    let timerClass = '';
    if (!isTemplate && !isEvent) {
      if (block.timerState === 'running') {
        timerClass = remaining < 15 * 60 ? ' block--warning' : ' block--running';
      } else if (block.timerState === 'paused')   timerClass = ' block--paused';
      else if (block.timerState === 'overtime')   timerClass = ' block--overtime';
      else if (block.timerState === 'done')       timerClass = ' block--done';
    }

    // Progress bar fill (0–100%)
    let progressPct = 0;
    if (!isTemplate && !isEvent && block.timerState !== 'idle') {
      progressPct = Math.max(0, Math.min(100, (elapsed / durSec) * 100));
    }

    // Countdown text
    let countdownHtml = '';
    if (!isTemplate && !isEvent && block.timerState !== 'idle') {
      const sign = elapsed > durSec ? '+' : '';
      const dispSec = elapsed > durSec ? elapsed - durSec : remaining;
      countdownHtml = `<div class="block-countdown">${sign}${this.formatSeconds(dispSec)}</div>`;
    }

    // Timer icon overlay (done) or quick-action button (running / paused)
    let iconHtml = '';
    let quickTimerBtn = '';
    if (!isTemplate && !isEvent) {
      if (block.timerState === 'running' || block.timerState === 'overtime') {
        quickTimerBtn = `<button class="block-quick-timer" data-quick-action="pause" title="Pause">⏸</button>`;
      } else if (block.timerState === 'paused') {
        quickTimerBtn = `<button class="block-quick-timer" data-quick-action="resume" title="Weiter">▶</button>`;
      } else if (block.timerState === 'done') {
        iconHtml = '<div class="block-icon">✓</div>';
      }
    }

    // Task count badge
    const tasksDone  = (block.tasks || []).filter(t => t.done).length;
    const tasksTotal = (block.tasks || []).length;
    const taskBadge  = tasksTotal > 0
      ? `<div class="block-tasks-badge">${tasksDone}/${tasksTotal}</div>`
      : '';

    const shortTitle = block.title || cat.label;

    return `
      <div class="block${timerClass}"
           data-block-id="${block.id}"
           data-day="${block.day}"
           style="top:${top}px; height:${height}px; background:${cat.color}; color:${cat.textColor};"
           title="${WP.escHtml(block.title)}">
        <div class="block-inner">
          <div class="block-title">${WP.escHtml(shortTitle)}</div>
          ${taskBadge}
          ${countdownHtml}
          ${iconHtml}
        </div>
        ${quickTimerBtn}
        <div class="block-progress">
          <div class="block-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>`;
  },

  // ─── Full week grid ──────────────────────────────────────────────────────────
  weekGrid(weekData, weekKey, isTemplate = false) {
    const blocks     = weekData?.blocks || [];
    const dayGoals   = weekData?.dayGoals || {};

    let headerCols = '<div class="time-corner"></div>';
    let bodyCols   = this.timeAxis();

    for (let d = 0; d < 7; d++) {
      const dayName  = WP.DAY_NAMES[d];
      const dateStr  = isTemplate ? '' : WP.formatDate(WP.getDayDate(weekKey, d));
      const goalText = WP.escHtml(dayGoals[d] || '');

      // Check if today
      const todayClass = (!isTemplate && WP.isToday(weekKey, d)) ? ' day-header--today' : '';

      headerCols += `
        <div class="day-header${todayClass}" data-day="${d}">
          <div class="day-name-date">
            <span class="day-name">${dayName}</span>
            ${dateStr ? `<span class="day-date">${dateStr}</span>` : ''}
          </div>
          <div class="day-goal" contenteditable="true" data-day="${d}"
               placeholder="Tagesziel …">${goalText}</div>
        </div>`;

      // Day column blocks
      const dayBlocks = blocks.filter(b => b.day === d);
      let blockHtml = '';
      for (let h = 0; h < 12; h++) {
        const lineTop = h * 60;
        blockHtml += `<div class="hour-line" style="top:${lineTop}px"></div>`;
      }
      for (const b of dayBlocks) {
        blockHtml += this.block(b, isTemplate);
      }

      bodyCols += `<div class="day-col" data-day="${d}" title="Doppelklick: neuer Block">${blockHtml}</div>`;
    }

    return `
      <div class="calendar-header">${headerCols}</div>
      <div class="calendar-body-scroll">
        <div class="calendar-body" id="week-grid">${bodyCols}</div>
      </div>`;
  },

  // ─── Single day grid ─────────────────────────────────────────────────────────
  dayGrid(weekData, weekKey, dayIndex) {
    const blocks   = (weekData?.blocks || []).filter(b => b.day === dayIndex);
    const dayGoals = weekData?.dayGoals || {};

    const dayNameLong = WP.DAY_NAMES_LONG[dayIndex];
    const dateStr  = WP.formatDate(WP.getDayDate(weekKey, dayIndex));
    const goalText = WP.escHtml(dayGoals[dayIndex] || '');
    const todayClass = WP.isToday(weekKey, dayIndex) ? ' day-header--today' : '';

    let blockHtml = '';
    for (let h = 0; h < 12; h++) {
      blockHtml += `<div class="hour-line" style="top:${h * 60}px"></div>`;
    }
    for (const b of blocks) {
      blockHtml += this.block(b, false);
    }

    return `
      <div class="calendar-header day-view-header">
        <div class="time-corner"></div>
        <div class="day-header${todayClass}" data-day="${dayIndex}">
          <div class="day-name-date">
            <span class="day-name">${dayNameLong}</span>
            <span class="day-date">${dateStr}</span>
          </div>
          <div class="day-goal" contenteditable="true" data-day="${dayIndex}"
               placeholder="Tagesziel …">${goalText}</div>
        </div>
      </div>
      <div class="calendar-body-scroll">
        <div class="calendar-body day-view-body" id="week-grid">
          ${this.timeAxis()}
          <div class="day-col" data-day="${dayIndex}" title="Doppelklick: neuer Block">${blockHtml}</div>
        </div>
      </div>`;
  },

  // ─── Detail Panel ────────────────────────────────────────────────────────────
  panel(block, checklistTemplates = {}) {
    const cat    = WP.CATEGORIES[block.category] || WP.CATEGORIES.buffer;
    const isEvent = block.category === 'event';
    const elapsed = WP.timer ? WP.timer.getCurrentElapsed(block) : block.timerElapsed;
    const durSec  = block.duration * 60;
    const remaining = Math.max(0, durSec - elapsed);

    // Category options
    let catOptions = '';
    for (const [key, val] of Object.entries(WP.CATEGORIES)) {
      catOptions += `<option value="${key}"${block.category === key ? ' selected' : ''}>${val.label}</option>`;
    }

    // Start time options (08:00–19:45, 15min steps)
    let timeOptions = '';
    for (let m = WP.CALENDAR_START; m < WP.CALENDAR_END; m += 15) {
      const t = WP.minutesToTime(m);
      timeOptions += `<option value="${t}"${block.startTime === t ? ' selected' : ''}>${t}</option>`;
    }

    // End time options: startTime+15 up to CALENDAR_END, 15min steps
    const startMin = WP.timeToMinutes(block.startTime);
    const endMin   = startMin + block.duration;
    let endTimeOptions = '';
    for (let m = startMin + 15; m <= WP.CALENDAR_END; m += 15) {
      const t = WP.minutesToTime(m);
      endTimeOptions += `<option value="${t}"${m === endMin ? ' selected' : ''}>${t}</option>`;
    }

    // Tasks list
    let tasksHtml = '';
    (block.tasks || []).forEach((task, i) => {
      tasksHtml += `
        <div class="task-item" data-task-index="${i}">
          <input type="checkbox" class="task-check" data-task-index="${i}" ${task.done ? 'checked' : ''}>
          <span class="task-text${task.done ? ' task-done' : ''}">${WP.escHtml(task.text)}</span>
          <button class="task-delete-btn" data-task-index="${i}" title="Aufgabe löschen">×</button>
        </div>`;
    });

    // Checklist
    let checklistHtml = '';
    (block.checklist || []).forEach((item, i) => {
      checklistHtml += `
        <div class="checklist-item" data-checklist-index="${i}">
          <input type="checkbox" class="checklist-check" data-checklist-index="${i}" ${item.checked ? 'checked' : ''}>
          <span class="checklist-text${item.checked ? ' task-done' : ''}">${WP.escHtml(item.text)}</span>
          <button class="checklist-delete-btn" data-checklist-index="${i}" title="Eintrag löschen">×</button>
        </div>`;
    });

    // Checklist template options
    let clTemplateOptions = '<option value="">— Vorlage laden —</option>';
    for (const [key, val] of Object.entries(checklistTemplates)) {
      clTemplateOptions += `<option value="${key}">${WP.escHtml(val.title)}</option>`;
    }

    // Timer section (not for event)
    let timerSection = '';
    if (!isEvent) {
      const state = block.timerState;
      const showStart   = state === 'idle' || state === 'paused';
      const showPause   = state === 'running' || state === 'overtime';
      const showResume  = state === 'paused';
      const showDone    = state === 'running' || state === 'overtime' || state === 'paused';
      const showReset   = state !== 'idle';

      timerSection = `
        <div class="panel-section panel-timer">
          <div class="timer-display">
            <div class="timer-elapsed">${this.formatSeconds(elapsed)}</div>
            <div class="timer-remaining">/ ${this.formatSeconds(durSec)} (noch ${this.formatSeconds(remaining)})</div>
          </div>
          <div class="timer-buttons">
            ${showStart && !showResume ? `<button class="btn btn--primary" data-action="timer-start">▶ Start</button>` : ''}
            ${showResume ? `<button class="btn btn--primary" data-action="timer-resume">▶ Weiter</button>` : ''}
            ${showPause ? `<button class="btn btn--secondary" data-action="timer-pause">⏸ Pause</button>` : ''}
            ${showDone  ? `<button class="btn btn--success" data-action="timer-done">✓ Fertig</button>` : ''}
            ${showReset ? `<button class="btn btn--ghost" data-action="timer-reset">↺ Reset</button>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="panel-body-inner" data-block-id="${block.id}">

        <div class="panel-section">
          <label class="panel-label">Titel</label>
          <input type="text" class="panel-input" data-field="title" value="${WP.escHtml(block.title)}">
        </div>

        <div class="panel-section panel-row">
          <div>
            <label class="panel-label">Kategorie</label>
            <select class="panel-select" data-field="category">${catOptions}</select>
          </div>
          <div>
            <label class="panel-label">Start</label>
            <select class="panel-select" data-field="startTime">${timeOptions}</select>
          </div>
          <div>
            <label class="panel-label">Ende</label>
            <select class="panel-select" data-field="endTime">${endTimeOptions}</select>
          </div>
        </div>

        ${timerSection}

        ${!isEvent ? `
        <div class="panel-section">
          <label class="panel-label">Aufgaben</label>
          <div class="tasks-list" id="panel-tasks">${tasksHtml}</div>
          <div class="add-task-row">
            <input type="text" class="panel-input" id="new-task-input" placeholder="Neue Aufgabe …">
            <button class="btn btn--small" id="add-task-btn">+</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="checklist-header-row">
            <label class="panel-label">Checkliste</label>
            <select class="panel-select panel-select--small" id="checklist-template-select">${clTemplateOptions}</select>
          </div>
          <div class="tasks-list" id="panel-checklist">${checklistHtml}</div>
          <div class="add-task-row">
            <input type="text" class="panel-input" id="new-checklist-input" placeholder="Neuer Eintrag …">
            <button class="btn btn--small" id="add-checklist-btn">+</button>
          </div>
        </div>` : ''}

        <div class="panel-section">
          <label class="panel-label">Notizen</label>
          <textarea class="panel-textarea" data-field="notes" rows="4">${WP.escHtml(block.notes || '')}</textarea>
        </div>

      </div>`;
  },

};

// ─── Utility ────────────────────────────────────────────────────────────────────
WP.escHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

WP.isToday = (weekKey, dayIndex) => {
  const d = WP.getDayDate(weekKey, dayIndex);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth()    === today.getMonth()    &&
         d.getDate()     === today.getDate();
};
