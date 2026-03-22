'use strict';
window.WP = window.WP || {};

WP.app = (() => {

  // ─── State ────────────────────────────────────────────────────────────────────
  const state = {
    weekKey:        null,
    view:           'week',   // 'week' | 'day'
    dayIndex:       0,
    weekData:       null,
    template:       null,
    isTemplateMode: false,
    openBlockId:    null,
    dragState:      null,
    ctxBlockId:     null,
    monthKey:       null,
    monthGoal:      '',
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  // Access the active block list (template or week)
  function _blocks() {
    if (state.isTemplateMode) return state.template.blocks;
    return state.weekData ? state.weekData.blocks : [];
  }

  function _findBlock(id) {
    return _blocks().find(b => b.id === id) || null;
  }

  function _removeBlock(id) {
    if (state.isTemplateMode) {
      state.template.blocks = state.template.blocks.filter(b => b.id !== id);
    } else {
      state.weekData.blocks = state.weekData.blocks.filter(b => b.id !== id);
    }
  }

  function hasOverlap(blocks, day, startTime, duration, excludeId = null) {
    const startMin = WP.timeToMinutes(startTime);
    const endMin   = startMin + duration;
    return blocks.some(b => {
      if (b.id === excludeId || b.day !== day) return false;
      const bStart = WP.timeToMinutes(b.startTime);
      const bEnd   = bStart + b.duration;
      return startMin < bEnd && endMin > bStart;
    });
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.classList.add('toast--show'), 10);
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ─── Modal helpers ────────────────────────────────────────────────────────────
  function showModal(html, onClose = null) {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    overlay.classList.add('modal--open');
    overlay._onClose = onClose;
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('modal--open');
    if (overlay._onClose) { overlay._onClose(); overlay._onClose = null; }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    await WP.db.open();
    state.template = await WP.db.getTemplate();
    state.weekKey  = WP.getWeekKey(new Date());
    state.monthKey = WP.getMonthKey(new Date());

    const mg = await WP.db.getGoal(state.monthKey);
    state.monthGoal = mg?.monthly || '';

    await loadWeek(state.weekKey);
    renderAll();
    bindGlobalEvents();
    checkBackupReminder();
  }

  // ─── Load week (creates new if missing) ──────────────────────────────────────
  async function loadWeek(weekKey) {
    let weekData = await WP.db.getWeek(weekKey);
    if (!weekData) {
      weekData = await showNewWeekDialog(weekKey);
    }
    state.weekData = weekData;
    state.weekKey  = weekKey;
    // Update month key when navigating
    const monday = WP.getWeekMonday(weekKey);
    state.monthKey = WP.getMonthKey(monday);
    const mg = await WP.db.getGoal(state.monthKey);
    state.monthGoal = mg?.monthly || '';
  }

  // ─── New Week Dialog ──────────────────────────────────────────────────────────
  async function showNewWeekDialog(weekKey) {
    return new Promise((resolve) => {
      const [, weekNum] = weekKey.split('-W');
      const monday = WP.getWeekMonday(weekKey);
      const dateStr = WP.formatDate(monday);

      showModal(`
        <h2 class="modal-title">KW ${weekNum} — ${dateStr}</h2>
        <p class="modal-text">Diese Woche hat noch keine Planung. Wie möchtest du beginnen?</p>
        <div class="modal-choices">
          <button class="btn btn--choice" data-choice="template">
            <span class="choice-icon">📋</span>
            <strong>Standard-Template</strong>
            <small>Wie immer starten</small>
          </button>
          <button class="btn btn--choice" data-choice="prev">
            <span class="choice-icon">⬅</span>
            <strong>Vorwoche kopieren</strong>
            <small>Blöcke der letzten Woche übernehmen</small>
          </button>
          <button class="btn btn--choice" data-choice="empty">
            <span class="choice-icon">✏</span>
            <strong>Leer starten</strong>
            <small>Manuell planen</small>
          </button>
        </div>
      `);

      document.getElementById('modal-overlay').addEventListener('click', async function handler(e) {
        const btn = e.target.closest('[data-choice]');
        if (!btn) return;
        const choice = btn.dataset.choice;
        document.getElementById('modal-overlay').removeEventListener('click', handler);
        closeModal();

        let weekData;
        if (choice === 'template') {
          weekData = _newWeekFromTemplate(weekKey);
        } else if (choice === 'prev') {
          weekData = await _newWeekFromPrev(weekKey);
        } else {
          weekData = _newWeekEmpty(weekKey);
        }

        await WP.db.saveWeek(weekKey, weekData);
        resolve(weekData);
      }, { once: false });
    });
  }

  function _newWeekFromTemplate(weekKey) {
    return {
      goal: '',
      dayGoals: {},
      blocks: state.template.blocks.map(b => WP.templateBlockToWeekBlock(b)),
    };
  }

  async function _newWeekFromPrev(weekKey) {
    const prevKey  = WP.prevWeekKey(weekKey);
    const prevWeek = await WP.db.getWeek(prevKey);
    if (!prevWeek) {
      showToast('Keine Vorwoche gefunden — leere Woche erstellt.', 'info');
      return _newWeekEmpty(weekKey);
    }
    return {
      goal: '',
      dayGoals: {},
      blocks: prevWeek.blocks.map(b => ({
        ...WP.templateBlockToWeekBlock(b),
        timerState: 'idle',
        timerElapsed: 0,
        timerStartedAt: null,
      })),
    };
  }

  function _newWeekEmpty(weekKey) {
    return { goal: '', dayGoals: {}, blocks: [] };
  }

  // ─── Save helpers ─────────────────────────────────────────────────────────────
  async function saveCurrentWeek() {
    if (state.isTemplateMode) {
      await WP.db.saveTemplate(state.template);
    } else if (state.weekData) {
      await WP.db.saveWeek(state.weekKey, state.weekData);
    }
  }

  // Expose for timer.js
  function getWeekBlocks() {
    return _blocks();
  }

  // ─── Render everything ────────────────────────────────────────────────────────
  function renderAll() {
    renderHeader();
    renderGrid();
  }

  function renderHeader() {
    const [, weekNum] = state.weekKey.split('-W');
    const isTemplate  = state.isTemplateMode;

    document.getElementById('header-week-num').textContent = isTemplate
      ? 'Template-Modus'
      : `KW ${weekNum}`;

    const monthGoalEl = document.getElementById('month-goal');
    if (monthGoalEl) {
      monthGoalEl.textContent = state.monthGoal;
      monthGoalEl.dataset.month = state.monthKey;
    }

    const weekGoalEl = document.getElementById('week-goal');
    if (weekGoalEl && !isTemplate) {
      weekGoalEl.textContent = state.weekData?.goal || '';
    }

    // Show/hide nav buttons in template mode
    document.getElementById('btn-prev-week').style.visibility   = isTemplate ? 'hidden' : '';
    document.getElementById('btn-next-week').style.visibility   = isTemplate ? 'hidden' : '';
    document.getElementById('btn-template').textContent          = isTemplate ? '← Woche' : 'Template';
    document.getElementById('btn-template').classList.toggle('btn--active', isTemplate);
  }

  function renderGrid() {
    const container  = document.getElementById('calendar-container');
    const data       = state.isTemplateMode ? { blocks: state.template.blocks, dayGoals: {} } : state.weekData;
    container.innerHTML = WP.render.weekGrid(data, state.weekKey, state.isTemplateMode);
    bindCalendarEvents();
    updateHeaderCounter();
  }

  // Refresh just one block's card without full re-render
  function refreshBlockDisplay(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;
    const el = document.querySelector(`.block[data-block-id="${blockId}"]`);
    if (!el) return;
    const newHtml = WP.render.block(block, state.isTemplateMode);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newEl = tmp.firstElementChild;
    el.replaceWith(newEl);
    bindBlockEvents(newEl);
  }

  // ─── Update header "Heute: Xh Ymin / Zh geplant" ────────────────────────────
  function updateHeaderCounter() {
    const el = document.getElementById('header-day-counter');
    if (!el || state.isTemplateMode) { if (el) el.textContent = ''; return; }

    const today = new Date();
    const todayKey = WP.getWeekKey(today);
    if (todayKey !== state.weekKey) { el.textContent = ''; return; }

    const dayIndex = ((today.getDay() + 6) % 7); // Mon=0
    const dayBlocks = _blocks().filter(b => b.day === dayIndex && b.category !== 'event');

    const plannedMin = dayBlocks.reduce((acc, b) => acc + b.duration, 0);
    const workedSec  = dayBlocks.reduce((acc, b) => acc + WP.timer.getCurrentElapsed(b), 0);
    const workedMin  = Math.floor(workedSec / 60);

    const fmtMin = (m) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return h > 0 ? (min > 0 ? `${h}h ${min}min` : `${h}h`) : `${min}min`;
    };

    el.textContent = `Heute: ${fmtMin(workedMin)} / ${fmtMin(plannedMin)} geplant`;
  }

  // ─── Bind calendar events (after each render) ─────────────────────────────────
  function bindCalendarEvents() {
    // Click on empty space → create block
    document.querySelectorAll('.day-col').forEach(col => {
      col.addEventListener('dblclick', (e) => {
        if (e.target.closest('.block')) return;
        const day = parseInt(col.dataset.day, 10);
        const rect = col.getBoundingClientRect();
        const relY = e.clientY - rect.top; // getBoundingClientRect already accounts for scroll
        const rawMin = WP.CALENDAR_START + relY;
        const snapped = Math.min(
          WP.snapTo15(rawMin),
          WP.CALENDAR_END - 15
        );
        createNewBlock(day, WP.minutesToTime(snapped));
      });
    });

    // Bind individual block events
    document.querySelectorAll('.block').forEach(el => bindBlockEvents(el));

    // Day goal inputs
    document.querySelectorAll('.day-goal').forEach(el => {
      el.addEventListener('input', debounce(async () => {
        const day = parseInt(el.dataset.day, 10);
        if (!state.weekData) return;
        if (!state.weekData.dayGoals) state.weekData.dayGoals = {};
        state.weekData.dayGoals[day] = el.textContent.trim();
        await saveCurrentWeek();
      }, 600));
    });
  }

  function bindBlockEvents(el) {
    // Left-click → open panel
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openPanel(el.dataset.blockId);
    });

    // Right-click → context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, el.dataset.blockId);
    });

    // Drag start
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(e, el.dataset.blockId);
    });
  }

  // ─── Open detail panel ────────────────────────────────────────────────────────
  function openPanel(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;
    state.openBlockId = blockId;

    const panel = document.getElementById('detail-panel');
    const clTemplates = state.isTemplateMode
      ? state.template.checklistTemplates
      : state.template.checklistTemplates;

    const titleEl = panel.querySelector('.panel-title');
    const bodyEl  = panel.querySelector('.panel-body');
    if (titleEl) {
      const cat = WP.CATEGORIES[block.category];
      titleEl.textContent = block.title || cat?.label || 'Block';
      titleEl.style.borderLeftColor = cat?.color || '#ccc';
    }
    bodyEl.innerHTML = WP.render.panel(block, clTemplates);
    panel.classList.add('panel--open');

    bindPanelEvents(block);
  }

  function closePanel() {
    document.getElementById('detail-panel').classList.remove('panel--open');
    state.openBlockId = null;
  }

  // ─── Panel events ─────────────────────────────────────────────────────────────
  function bindPanelEvents(block) {
    const panel   = document.getElementById('detail-panel');
    const bodyEl  = panel.querySelector('.panel-body');
    const isEvent = block.category === 'event';

    // Structural fields (category, startTime, duration) → propagation dialog
    const structuralFields = ['category', 'startTime', 'duration'];

    bodyEl.querySelectorAll('[data-field]').forEach(el => {
      const field = el.dataset.field;
      const isStructural = structuralFields.includes(field);

      const handler = async () => {
        let value = el.tagName === 'SELECT' ? el.value : el.value;
        if (field === 'duration') value = parseInt(value, 10);

        if (isStructural && !state.isTemplateMode) {
          await handleStructuralChange(block, field, value);
        } else {
          block[field] = value;
          await saveCurrentWeek();
          // Update panel title if title changed
          if (field === 'title' || field === 'category') {
            const titleEl = panel.querySelector('.panel-title');
            if (titleEl) {
              if (field === 'title') titleEl.textContent = value;
              if (field === 'category') {
                const cat = WP.CATEGORIES[value];
                if (cat) {
                  titleEl.style.borderLeftColor = cat.color;
                }
              }
            }
            refreshBlockDisplay(block.id);
          }
          if (isStructural) refreshBlockDisplay(block.id);
        }
      };

      if (el.tagName === 'SELECT') {
        el.addEventListener('change', handler);
      } else {
        el.addEventListener('change', handler);
        el.addEventListener('blur', handler);
      }
    });

    // Tasks
    if (!isEvent) {
      _bindTaskEvents(bodyEl, block);
      _bindChecklistEvents(bodyEl, block);
    }

    // Timer buttons
    bodyEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'timer-start')  { await WP.timer.start(block.id);   refreshPanelTimer(block); }
        if (action === 'timer-pause')  { await WP.timer.pause(block.id);   refreshPanelTimer(block); }
        if (action === 'timer-resume') { await WP.timer.resume(block.id);  refreshPanelTimer(block); }
        if (action === 'timer-reset')  { await WP.timer.reset(block.id);   refreshPanelTimer(block); }
        if (action === 'timer-done')   { await WP.timer.markDone(block.id); refreshPanelTimer(block); }
      });
    });
  }

  // Refresh timer controls in panel after state change
  function refreshPanelTimer(block) {
    const panel  = document.getElementById('detail-panel');
    if (!panel || !panel.classList.contains('panel--open')) return;
    const bodyEl = panel.querySelector('.panel-body');
    const fresh  = _findBlock(block.id);
    if (!fresh) return;
    // Re-render only the timer section
    const timerSection = bodyEl.querySelector('.panel-timer');
    if (!timerSection) return;
    const elapsed   = WP.timer.getCurrentElapsed(fresh);
    const durSec    = fresh.duration * 60;
    const remaining = Math.max(0, durSec - elapsed);
    const state2    = fresh.timerState;

    const showStart  = state2 === 'idle' || state2 === 'paused';
    const showPause  = state2 === 'running' || state2 === 'overtime';
    const showResume = state2 === 'paused';
    const showDone   = state2 === 'running' || state2 === 'overtime' || state2 === 'paused';
    const showReset  = state2 !== 'idle';

    timerSection.innerHTML = `
      <div class="timer-display">
        <div class="timer-elapsed">${WP.render.formatSeconds(elapsed)}</div>
        <div class="timer-remaining">/ ${WP.render.formatSeconds(durSec)} (noch ${WP.render.formatSeconds(remaining)})</div>
      </div>
      <div class="timer-buttons">
        ${showStart && !showResume ? `<button class="btn btn--primary" data-action="timer-start">▶ Start</button>` : ''}
        ${showResume ? `<button class="btn btn--primary" data-action="timer-resume">▶ Weiter</button>` : ''}
        ${showPause ? `<button class="btn btn--secondary" data-action="timer-pause">⏸ Pause</button>` : ''}
        ${showDone  ? `<button class="btn btn--success" data-action="timer-done">✓ Fertig</button>` : ''}
        ${showReset ? `<button class="btn btn--ghost" data-action="timer-reset">↺ Reset</button>` : ''}
      </div>`;

    timerSection.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'timer-start')  { await WP.timer.start(fresh.id);   refreshPanelTimer(fresh); }
        if (action === 'timer-pause')  { await WP.timer.pause(fresh.id);   refreshPanelTimer(fresh); }
        if (action === 'timer-resume') { await WP.timer.resume(fresh.id);  refreshPanelTimer(fresh); }
        if (action === 'timer-reset')  { await WP.timer.reset(fresh.id);   refreshPanelTimer(fresh); }
        if (action === 'timer-done')   { await WP.timer.markDone(fresh.id); refreshPanelTimer(fresh); }
      });
    });
  }

  // ─── Task binding ─────────────────────────────────────────────────────────────
  function _bindTaskEvents(container, block) {
    const tasksList = container.querySelector('#panel-tasks');

    // Toggle done
    tasksList && tasksList.addEventListener('change', async (e) => {
      const cb = e.target.closest('.task-check');
      if (!cb) return;
      const i = parseInt(cb.dataset.taskIndex, 10);
      block.tasks[i].done = cb.checked;
      cb.closest('.task-item').querySelector('.task-text').classList.toggle('task-done', cb.checked);
      await saveCurrentWeek();
      refreshBlockDisplay(block.id);
    });

    // Delete task
    tasksList && tasksList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.task-delete-btn');
      if (!btn) return;
      const i = parseInt(btn.dataset.taskIndex, 10);
      block.tasks.splice(i, 1);
      await saveCurrentWeek();
      openPanel(block.id); // re-render panel
    });

    // Add task
    const addBtn   = container.querySelector('#add-task-btn');
    const addInput = container.querySelector('#new-task-input');
    const addTask = async () => {
      const text = addInput?.value.trim();
      if (!text) return;
      block.tasks.push({ text, done: false });
      addInput.value = '';
      await saveCurrentWeek();
      openPanel(block.id);
    };
    addBtn  && addBtn.addEventListener('click', addTask);
    addInput && addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  }

  function _bindChecklistEvents(container, block) {
    const list = container.querySelector('#panel-checklist');

    list && list.addEventListener('change', async (e) => {
      const cb = e.target.closest('.checklist-check');
      if (!cb) return;
      const i = parseInt(cb.dataset.checklistIndex, 10);
      block.checklist[i].checked = cb.checked;
      cb.closest('.checklist-item').querySelector('.checklist-text').classList.toggle('task-done', cb.checked);
      await saveCurrentWeek();
    });

    list && list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.checklist-delete-btn');
      if (!btn) return;
      const i = parseInt(btn.dataset.checklistIndex, 10);
      block.checklist.splice(i, 1);
      await saveCurrentWeek();
      openPanel(block.id);
    });

    const addBtn   = container.querySelector('#add-checklist-btn');
    const addInput = container.querySelector('#new-checklist-input');
    const addItem = async () => {
      const text = addInput?.value.trim();
      if (!text) return;
      block.checklist.push({ text, checked: false });
      addInput.value = '';
      await saveCurrentWeek();
      openPanel(block.id);
    };
    addBtn  && addBtn.addEventListener('click', addItem);
    addInput && addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });

    // Load checklist from template
    const sel = container.querySelector('#checklist-template-select');
    sel && sel.addEventListener('change', async () => {
      const key = sel.value;
      if (!key) return;
      const clTemplate = state.template.checklistTemplates[key];
      if (!clTemplate) return;
      block.checklist = clTemplate.items.map(item => ({ ...item, checked: false }));
      await saveCurrentWeek();
      openPanel(block.id);
    });
  }

  // ─── Structural change propagation ───────────────────────────────────────────
  async function handleStructuralChange(block, field, value) {
    // Validate: no overlap after change
    if (field === 'startTime' || field === 'duration') {
      const newStart = field === 'startTime' ? value : block.startTime;
      const newDur   = field === 'duration'  ? value : block.duration;
      if (hasOverlap(_blocks(), block.day, newStart, newDur, block.id)) {
        showToast('Dieser Zeitraum ist bereits belegt.', 'warning');
        openPanel(block.id); // revert by re-rendering panel
        return;
      }
    }

    if (!block.fromTemplate) {
      // Non-template block: just save
      block[field] = value;
      await saveCurrentWeek();
      refreshBlockDisplay(block.id);
      openPanel(block.id);
      return;
    }

    // Template block: ask about propagation
    return new Promise((resolve) => {
      showModal(`
        <h2 class="modal-title">Änderung übernehmen?</h2>
        <p class="modal-text">Soll diese Änderung nur für diese Woche gelten, oder auch im Template (ab jetzt immer so)?</p>
        <div class="modal-actions">
          <button class="btn btn--secondary" data-scope="week">Nur diese Woche</button>
          <button class="btn btn--primary" data-scope="template">Ab jetzt immer so</button>
          <button class="btn btn--ghost" data-scope="cancel">Abbrechen</button>
        </div>
      `);

      document.getElementById('modal-overlay').addEventListener('click', async function handler(e) {
        const btn = e.target.closest('[data-scope]');
        if (!btn) return;
        document.getElementById('modal-overlay').removeEventListener('click', handler);
        closeModal();
        const scope = btn.dataset.scope;

        if (scope === 'cancel') { openPanel(block.id); resolve(); return; }

        // Apply to this week's block
        block[field] = value;
        await saveCurrentWeek();

        if (scope === 'template') {
          // Find and update matching template block
          const tBlock = state.template.blocks.find(t => t.id === block.id) ||
                         state.template.blocks.find(t =>
                           t.day === block.day && t.startTime === block.startTime);
          if (tBlock) {
            tBlock[field] = value;
            await WP.db.saveTemplate(state.template);
          }
        }

        refreshBlockDisplay(block.id);
        openPanel(block.id);
        resolve();
      }, { once: false });
    });
  }

  // ─── Create new block ─────────────────────────────────────────────────────────
  async function createNewBlock(day, startTime) {
    const snapped = WP.snapTo15(WP.timeToMinutes(startTime));
    const timeStr = WP.minutesToTime(Math.max(WP.CALENDAR_START, Math.min(snapped, WP.CALENDAR_END - 15)));

    if (hasOverlap(_blocks(), day, timeStr, 60)) {
      // Try 30min
      if (hasOverlap(_blocks(), day, timeStr, 30)) {
        showToast('Dieser Zeitraum ist bereits belegt.', 'warning');
        return;
      }
    }

    const block = WP.createBlock(day, timeStr, 60, 'buffer');
    if (state.isTemplateMode) {
      state.template.blocks.push(block);
      await WP.db.saveTemplate(state.template);
    } else {
      state.weekData.blocks.push(block);
      await saveCurrentWeek();
    }

    renderGrid();
    openPanel(block.id);
  }

  // ─── Delete block ─────────────────────────────────────────────────────────────
  async function deleteBlock(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;

    if (block.category === 'event') {
      // Event blocks always affect template
      return new Promise((resolve) => {
        showModal(`
          <h2 class="modal-title">Festen Termin löschen?</h2>
          <p class="modal-text">„${WP.escHtml(block.title)}" ist ein fester Termin aus dem Template. Er erscheint auch in künftigen Wochen nicht mehr, wenn du ihn aus dem Template entfernst.</p>
          <div class="modal-actions">
            <button class="btn btn--danger" data-choice="template">Aus Template entfernen</button>
            <button class="btn btn--secondary" data-choice="week">Nur diese Woche</button>
            <button class="btn btn--ghost" data-choice="cancel">Abbrechen</button>
          </div>
        `);
        document.getElementById('modal-overlay').addEventListener('click', async function handler(e) {
          const btn = e.target.closest('[data-choice]');
          if (!btn) return;
          document.getElementById('modal-overlay').removeEventListener('click', handler);
          closeModal();
          const choice = btn.dataset.choice;
          if (choice === 'cancel') { resolve(); return; }
          if (choice === 'template' || choice === 'week') {
            _removeBlock(blockId);
            if (choice === 'template') {
              state.template.blocks = state.template.blocks.filter(b => b.id !== blockId);
              await WP.db.saveTemplate(state.template);
            }
            await saveCurrentWeek();
          }
          closePanel();
          renderGrid();
          resolve();
        }, { once: false });
      });
    }

    if (block.fromTemplate) {
      return new Promise((resolve) => {
        showModal(`
          <h2 class="modal-title">Block löschen</h2>
          <p class="modal-text">„${WP.escHtml(block.title)}" stammt aus dem Template.</p>
          <div class="modal-actions">
            <button class="btn btn--danger" data-choice="week">Nur diese Woche löschen</button>
            <button class="btn btn--danger btn--ghost-danger" data-choice="template">Aus Template entfernen</button>
            <button class="btn btn--ghost" data-choice="cancel">Abbrechen</button>
          </div>
        `);
        document.getElementById('modal-overlay').addEventListener('click', async function handler(e) {
          const btn = e.target.closest('[data-choice]');
          if (!btn) return;
          document.getElementById('modal-overlay').removeEventListener('click', handler);
          closeModal();
          const choice = btn.dataset.choice;
          if (choice === 'cancel') { resolve(); return; }
          _removeBlock(blockId);
          if (choice === 'template') {
            state.template.blocks = state.template.blocks.filter(b => b.id !== blockId);
            await WP.db.saveTemplate(state.template);
          }
          await saveCurrentWeek();
          closePanel();
          renderGrid();
          resolve();
        }, { once: false });
      });
    }

    // Plain block: simple confirm
    if (!confirm(`Block „${block.title}" löschen?`)) return;
    _removeBlock(blockId);
    await saveCurrentWeek();
    closePanel();
    renderGrid();
  }

  // ─── Context menu ─────────────────────────────────────────────────────────────
  function showContextMenu(x, y, blockId) {
    hideContextMenu();
    state.ctxBlockId = blockId;
    const block = _findBlock(blockId);
    if (!block) return;

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'context-menu';
    menu.innerHTML = `
      <button class="ctx-item" data-ctx="open">Block öffnen</button>
      <button class="ctx-item" data-ctx="duplicate">Duplizieren</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item ctx-item--danger" data-ctx="delete">Löschen …</button>
    `;

    // Add load checklist options if templates exist
    const clTemplates = state.template.checklistTemplates;
    if (block.category !== 'event' && Object.keys(clTemplates).length > 0) {
      const sep = document.createElement('div');
      sep.className = 'ctx-divider';
      menu.insertBefore(sep, menu.querySelector('.ctx-divider'));
      for (const [key, val] of Object.entries(clTemplates)) {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        btn.dataset.ctx = 'checklist';
        btn.dataset.clKey = key;
        btn.textContent = `Checkliste: ${val.title}`;
        menu.insertBefore(btn, sep);
      }
    }

    document.body.appendChild(menu);

    // Position menu (keep within viewport)
    const mx = Math.min(x, window.innerWidth  - 180);
    const my = Math.min(y, window.innerHeight - 200);
    menu.style.left = mx + 'px';
    menu.style.top  = my + 'px';

    menu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-ctx]');
      if (!btn) return;
      hideContextMenu();
      const action = btn.dataset.ctx;
      const freshBlock = _findBlock(blockId);
      if (!freshBlock) return;

      if (action === 'open')      { openPanel(blockId); }
      if (action === 'duplicate') { await duplicateBlock(blockId); }
      if (action === 'delete')    { await deleteBlock(blockId); }
      if (action === 'checklist') {
        const clKey = btn.dataset.clKey;
        const tmpl  = clTemplates[clKey];
        if (tmpl && freshBlock) {
          freshBlock.checklist = tmpl.items.map(item => ({ ...item, checked: false }));
          await saveCurrentWeek();
          if (state.openBlockId === blockId) openPanel(blockId);
          showToast(`Checkliste „${tmpl.title}" geladen`, 'success');
        }
      }
    });
  }

  function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.remove();
  }

  // ─── Duplicate block ──────────────────────────────────────────────────────────
  async function duplicateBlock(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;
    const newBlock = {
      ...JSON.parse(JSON.stringify(block)),
      id:              WP.generateId(),
      fromTemplate:    false,
      timerState:      'idle',
      timerElapsed:    0,
      timerStartedAt:  null,
    };
    // Try to place it right after original
    const endMin    = WP.timeToMinutes(block.startTime) + block.duration;
    const newStart  = WP.minutesToTime(Math.min(endMin, WP.CALENDAR_END - block.duration));
    if (!hasOverlap(_blocks(), block.day, newStart, block.duration)) {
      newBlock.startTime = newStart;
    } else {
      showToast('Kein freier Slot gefunden — Block ans Ende gestellt', 'info');
      newBlock.startTime = WP.minutesToTime(WP.CALENDAR_END - block.duration);
    }

    if (state.isTemplateMode) {
      state.template.blocks.push(newBlock);
      await WP.db.saveTemplate(state.template);
    } else {
      state.weekData.blocks.push(newBlock);
      await saveCurrentWeek();
    }
    renderGrid();
    showToast('Block dupliziert', 'success');
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────────
  function startDrag(e, blockId) {
    const block = _findBlock(blockId);
    if (!block) return;

    const blockEl  = document.querySelector(`.block[data-block-id="${blockId}"]`);
    const col      = blockEl.closest('.day-col');
    const colRect  = col.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    const offsetY  = e.clientY - blockRect.top;

    // Ghost element
    const ghost = blockEl.cloneNode(true);
    ghost.id = 'drag-ghost';
    ghost.style.cssText = `
      position:fixed; pointer-events:none; opacity:0.75; z-index:9999;
      width:${blockRect.width}px; height:${blockRect.height}px;
      left:${blockRect.left}px; top:${blockRect.top}px;
      transition: none;
    `;
    document.body.appendChild(ghost);

    // Dim original
    blockEl.style.opacity = '0.3';

    state.dragState = {
      blockId,
      origDay:       block.day,
      origStartTime: block.startTime,
      offsetY,
      ghost,
      blockEl,
      active: true,
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
  }

  function onDragMove(e) {
    if (!state.dragState?.active) return;
    const { ghost } = state.dragState;
    ghost.style.left = (e.clientX - 20) + 'px';
    ghost.style.top  = (e.clientY - state.dragState.offsetY) + 'px';
  }

  async function onDragEnd(e) {
    if (!state.dragState?.active) return;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);

    const { blockId, origDay, origStartTime, offsetY, ghost, blockEl } = state.dragState;
    state.dragState = null;

    ghost.remove();
    blockEl.style.opacity = '';

    // Find which day column the mouse is over
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const dropCol = el ? el.closest('.day-col') : null;

    if (!dropCol) return; // dropped outside — revert

    const newDay   = parseInt(dropCol.dataset.day, 10);
    const colRect  = dropCol.getBoundingClientRect();
    const relY     = e.clientY - colRect.top - offsetY; // getBoundingClientRect accounts for scroll
    const rawMin   = WP.CALENDAR_START + relY;
    const snapped  = WP.snapTo15(rawMin);
    const block    = _findBlock(blockId);
    if (!block) return;

    const clampedStart = Math.max(WP.CALENDAR_START, Math.min(snapped, WP.CALENDAR_END - block.duration));
    const newStartTime = WP.minutesToTime(clampedStart);

    if (newDay === origDay && newStartTime === origStartTime) return; // no change

    if (hasOverlap(_blocks(), newDay, newStartTime, block.duration, blockId)) {
      showToast('Dieser Zeitraum ist bereits belegt', 'warning');
      return;
    }

    if (!state.isTemplateMode && block.fromTemplate) {
      // Structural change: ask propagation scope
      await new Promise((resolve) => {
        showModal(`
          <h2 class="modal-title">Block verschieben</h2>
          <p class="modal-text">Soll diese Änderung nur für diese Woche gelten, oder auch im Template?</p>
          <div class="modal-actions">
            <button class="btn btn--secondary" data-scope="week">Nur diese Woche</button>
            <button class="btn btn--primary" data-scope="template">Ab jetzt immer so</button>
            <button class="btn btn--ghost" data-scope="cancel">Abbrechen</button>
          </div>
        `);
        document.getElementById('modal-overlay').addEventListener('click', async function handler(e) {
          const btn = e.target.closest('[data-scope]');
          if (!btn) return;
          document.getElementById('modal-overlay').removeEventListener('click', handler);
          closeModal();
          const scope = btn.dataset.scope;
          if (scope === 'cancel') { resolve(); return; }

          block.day       = newDay;
          block.startTime = newStartTime;
          await saveCurrentWeek();

          if (scope === 'template') {
            const tBlock = state.template.blocks.find(t => t.id === block.id);
            if (tBlock) {
              tBlock.day       = newDay;
              tBlock.startTime = newStartTime;
              await WP.db.saveTemplate(state.template);
            }
          }
          resolve();
        }, { once: false });
      });
    } else {
      block.day       = newDay;
      block.startTime = newStartTime;
      await saveCurrentWeek();
    }

    renderGrid();
    if (state.openBlockId === blockId) openPanel(blockId);
  }

  // ─── Week navigation ──────────────────────────────────────────────────────────
  async function navigateWeek(direction) {
    if (state.isTemplateMode) return;
    closePanel();
    const newKey = direction === 'prev'
      ? WP.prevWeekKey(state.weekKey)
      : WP.nextWeekKey(state.weekKey);
    await loadWeek(newKey);
    renderAll();
  }

  // ─── Template mode ────────────────────────────────────────────────────────────
  async function toggleTemplateMode() {
    state.isTemplateMode = !state.isTemplateMode;
    closePanel();
    renderAll();
  }

  // ─── Goals ────────────────────────────────────────────────────────────────────
  async function saveMonthGoal(text) {
    state.monthGoal = text;
    const existing = await WP.db.getGoal(state.monthKey) || {};
    existing.monthly = text;
    await WP.db.saveGoal(state.monthKey, existing);
  }

  async function saveWeekGoal(text) {
    if (!state.weekData) return;
    state.weekData.goal = text;
    await saveCurrentWeek();
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────────
  async function exportPDF() {
    showToast('PDF wird erstellt …', 'info', 8000);
    try {
      const el = document.getElementById('week-grid');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fffdf9' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfW  = pdf.internal.pageSize.getWidth();
      const pdfH  = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * ratio, canvas.height * ratio);
      pdf.save(`wochenplaner-${state.weekKey}.pdf`);
      showToast('PDF exportiert!', 'success');
    } catch (err) {
      showToast('PDF-Export fehlgeschlagen: ' + err.message, 'error');
    }
  }

  // ─── Backup Export ────────────────────────────────────────────────────────────
  async function exportBackup() {
    try {
      const data    = await WP.db.exportAll();
      const json    = JSON.stringify(data, null, 2);
      const blob    = new Blob([json], { type: 'application/json' });
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      const today   = new Date().toISOString().slice(0, 10);
      a.href        = url;
      a.download    = `wochenplaner-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Record backup date
      await WP.db.setMeta('lastBackupDate', new Date().toISOString());
      showToast('Backup exportiert!', 'success');
    } catch (err) {
      showToast('Backup fehlgeschlagen: ' + err.message, 'error');
    }
  }

  // ─── Backup Import ────────────────────────────────────────────────────────────
  function importBackup() {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        showToast('Ungültige Backup-Datei.', 'error');
        return;
      }
      if (!confirm('Alle Daten werden überschrieben. Fortfahren?')) return;
      try {
        await WP.db.importAll(data);
        state.template = await WP.db.getTemplate();
        await loadWeek(state.weekKey);
        renderAll();
        showToast('Backup importiert!', 'success');
      } catch (err) {
        showToast('Import fehlgeschlagen: ' + err.message, 'error');
      }
    });
    input.click();
  }

  // ─── Backup reminder ──────────────────────────────────────────────────────────
  async function checkBackupReminder() {
    const lastBackup = await WP.db.getMeta('lastBackupDate');
    if (!lastBackup) {
      showToast('Noch kein Backup erstellt — jetzt sichern?', 'warning', 6000);
    } else {
      const daysSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        showToast(`Letztes Backup vor ${Math.floor(daysSince)} Tagen — jetzt sichern?`, 'warning', 6000);
      }
    }
  }

  // ─── Global event bindings ────────────────────────────────────────────────────
  function bindGlobalEvents() {
    // Week navigation
    document.getElementById('btn-prev-week').addEventListener('click', () => navigateWeek('prev'));
    document.getElementById('btn-next-week').addEventListener('click', () => navigateWeek('next'));

    // Template mode
    document.getElementById('btn-template').addEventListener('click', toggleTemplateMode);

    // Export
    document.getElementById('btn-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-backup').addEventListener('click', exportBackup);
    document.getElementById('btn-import').addEventListener('click', importBackup);

    // Panel close
    document.getElementById('panel-close').addEventListener('click', closePanel);

    // Close panel on backdrop click
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('detail-panel');
      if (!panel.classList.contains('panel--open')) return;
      if (!panel.contains(e.target) && !e.target.closest('.block')) {
        closePanel();
      }
    });

    // Modal overlay close on backdrop click (but NOT on modal content)
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });

    // Context menu: close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#context-menu')) hideContextMenu();
    });

    // Month goal
    const monthGoalEl = document.getElementById('month-goal');
    if (monthGoalEl) {
      monthGoalEl.addEventListener('blur', () => saveMonthGoal(monthGoalEl.textContent.trim()));
      monthGoalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); monthGoalEl.blur(); }
      });
    }

    // Week goal
    const weekGoalEl = document.getElementById('week-goal');
    if (weekGoalEl) {
      weekGoalEl.addEventListener('blur', () => saveWeekGoal(weekGoalEl.textContent.trim()));
      weekGoalEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); weekGoalEl.blur(); }
      });
    }

    // Panel delete button
    document.getElementById('panel-delete-btn').addEventListener('click', () => {
      if (state.openBlockId) deleteBlock(state.openBlockId);
    });
  }

  // ─── Utility: debounce ────────────────────────────────────────────────────────
  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return {
    init,
    saveCurrentWeek,
    getWeekBlocks,
    refreshBlockDisplay,
    updateHeaderCounter,
    showToast,
  };

})();

document.addEventListener('DOMContentLoaded', () => WP.app.init());
