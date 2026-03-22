'use strict';
window.WP = window.WP || {};

WP.timer = (() => {
  let _interval       = null;
  let _runningBlockId = null;
  let _notifPermission = 'default';

  // Track which notifications have been sent per block: { blockId: { at15: bool, atEnd: bool, at15over: bool } }
  let _notificationsSent = {};

  // ─── Elapsed calculation ─────────────────────────────────────────────────────
  // Returns total elapsed seconds for a block, accounting for live running time
  function getCurrentElapsed(block) {
    if (!block) return 0;
    if (block.timerState !== 'running') return block.timerElapsed || 0;
    return (block.timerElapsed || 0) + Math.floor((Date.now() - block.timerStartedAt) / 1000);
  }

  // ─── Find running block in app state ────────────────────────────────────────
  function _getBlocks() {
    if (!WP.app || !WP.app.getWeekBlocks) return [];
    return WP.app.getWeekBlocks();
  }

  function _findBlock(id) {
    return _getBlocks().find(b => b.id === id) || null;
  }

  // ─── Start timer ────────────────────────────────────────────────────────────
  async function start(blockId) {
    // Pause any currently running timer
    if (_runningBlockId && _runningBlockId !== blockId) {
      await pause(_runningBlockId);
    }

    const block = _findBlock(blockId);
    if (!block || block.category === 'event') return;

    // Request notification permission on first timer start
    if (_notifPermission === 'default') {
      await requestPermission();
    }

    block.timerState     = 'running';
    block.timerStartedAt = Date.now();
    _runningBlockId = blockId;

    // Ensure notification tracking for this block
    if (!_notificationsSent[blockId]) {
      _notificationsSent[blockId] = { at15: false, atEnd: false, at15over: false };
    }

    await WP.app.saveCurrentWeek();
    _ensureInterval();
    WP.app.refreshBlockDisplay(blockId);
  }

  // ─── Pause timer ────────────────────────────────────────────────────────────
  async function pause(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;
    if (block.timerState !== 'running' && block.timerState !== 'overtime') return;

    // Freeze elapsed time before pausing
    block.timerElapsed   = getCurrentElapsed(block);
    block.timerState     = 'paused';
    block.timerStartedAt = null;

    if (_runningBlockId === blockId) _runningBlockId = null;

    await WP.app.saveCurrentWeek();
    _ensureInterval(); // interval will stop itself if no running block
    WP.app.refreshBlockDisplay(blockId);
  }

  // ─── Resume timer ────────────────────────────────────────────────────────────
  async function resume(blockId) {
    // Pause any other running timer first
    if (_runningBlockId && _runningBlockId !== blockId) {
      await pause(_runningBlockId);
    }

    const block = _findBlock(blockId);
    if (!block) return;

    block.timerState     = 'running';
    block.timerStartedAt = Date.now();
    _runningBlockId = blockId;

    if (!_notificationsSent[blockId]) {
      _notificationsSent[blockId] = { at15: false, atEnd: false, at15over: false };
    }

    await WP.app.saveCurrentWeek();
    _ensureInterval();
    WP.app.refreshBlockDisplay(blockId);
  }

  // ─── Reset timer ────────────────────────────────────────────────────────────
  async function reset(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;

    block.timerState     = 'idle';
    block.timerElapsed   = 0;
    block.timerStartedAt = null;
    delete _notificationsSent[blockId];

    if (_runningBlockId === blockId) _runningBlockId = null;

    await WP.app.saveCurrentWeek();
    _ensureInterval();
    WP.app.refreshBlockDisplay(blockId);
  }

  // ─── Mark done ───────────────────────────────────────────────────────────────
  async function markDone(blockId) {
    const block = _findBlock(blockId);
    if (!block) return;

    // Capture elapsed before stopping
    if (block.timerState === 'running' || block.timerState === 'overtime') {
      block.timerElapsed = getCurrentElapsed(block);
    }
    block.timerState     = 'done';
    block.timerStartedAt = null;

    if (_runningBlockId === blockId) _runningBlockId = null;

    await WP.app.saveCurrentWeek();
    _ensureInterval();
    WP.app.refreshBlockDisplay(blockId);
  }

  // ─── Tick (called every second) ──────────────────────────────────────────────
  let _tickCount = 0;
  function tick() {
    if (!_runningBlockId) {
      _stopInterval();
      return;
    }

    const block = _findBlock(_runningBlockId);
    if (!block || (block.timerState !== 'running' && block.timerState !== 'overtime')) {
      _runningBlockId = null;
      _stopInterval();
      return;
    }

    const elapsed  = getCurrentElapsed(block);
    const durSec   = block.duration * 60;
    const remaining = durSec - elapsed;

    // Transition to overtime
    if (remaining <= 0 && block.timerState === 'running') {
      block.timerState = 'overtime';
    }

    // DOM update for the block card
    updateBlockDisplay(block, elapsed);

    // DOM update for open panel
    _updatePanelTimer(block, elapsed);

    // Notifications
    _checkNotifications(block, elapsed, durSec, remaining);

    // Every 10 ticks (10s): persist elapsed to DB silently
    _tickCount++;
    if (_tickCount % 10 === 0) {
      block.timerElapsed = elapsed;
      WP.app.saveCurrentWeek().catch(() => {}); // fire-and-forget
    }

    // Update header counter
    WP.app.updateHeaderCounter && WP.app.updateHeaderCounter();
  }

  // ─── Update block card DOM ────────────────────────────────────────────────────
  function updateBlockDisplay(block, elapsed) {
    const el = document.querySelector(`.block[data-block-id="${block.id}"]`);
    if (!el) return;

    const durSec    = block.duration * 60;
    const remaining = durSec - elapsed;

    // Update classes (warning = running + < 15min remaining, as render-only condition)
    el.classList.remove('block--running', 'block--warning', 'block--overtime', 'block--done', 'block--paused');
    if (block.timerState === 'running') {
      el.classList.add(remaining < 15 * 60 ? 'block--warning' : 'block--running');
    } else if (block.timerState === 'overtime') {
      el.classList.add('block--overtime');
    } else if (block.timerState === 'done') {
      el.classList.add('block--done');
    } else if (block.timerState === 'paused') {
      el.classList.add('block--paused');
    }

    // Countdown text
    const cdEl = el.querySelector('.block-countdown');
    if (cdEl) {
      if (block.timerState === 'idle') {
        cdEl.textContent = '';
      } else {
        const sign    = elapsed > durSec ? '+' : '';
        const dispSec = elapsed > durSec ? elapsed - durSec : remaining;
        cdEl.textContent = sign + WP.render.formatSeconds(dispSec);
      }
    } else if (block.timerState !== 'idle') {
      // Create countdown element if missing
      const inner = el.querySelector('.block-inner');
      if (inner) {
        const newCd = document.createElement('div');
        newCd.className = 'block-countdown';
        const sign    = elapsed > durSec ? '+' : '';
        const dispSec = elapsed > durSec ? elapsed - durSec : remaining;
        newCd.textContent = sign + WP.render.formatSeconds(dispSec);
        inner.appendChild(newCd);
      }
    }

    // Progress bar
    const fillEl = el.querySelector('.block-progress-fill');
    if (fillEl) {
      const pct = Math.max(0, Math.min(100, (elapsed / durSec) * 100));
      fillEl.style.width = pct + '%';
    }
  }

  // ─── Update panel timer display ──────────────────────────────────────────────
  function _updatePanelTimer(block, elapsed) {
    const panel = document.getElementById('detail-panel');
    if (!panel || !panel.classList.contains('panel--open')) return;
    const panelBody = panel.querySelector('[data-block-id]');
    if (!panelBody || panelBody.dataset.blockId !== block.id) return;

    const durSec    = block.duration * 60;
    const remaining = Math.max(0, durSec - elapsed);

    const elapsedEl   = panel.querySelector('.timer-elapsed');
    const remainingEl = panel.querySelector('.timer-remaining');
    if (elapsedEl)   elapsedEl.textContent = WP.render.formatSeconds(elapsed);
    if (remainingEl) remainingEl.textContent = `/ ${WP.render.formatSeconds(durSec)} (noch ${WP.render.formatSeconds(remaining)})`;
  }

  // ─── Notifications ────────────────────────────────────────────────────────────
  function _checkNotifications(block, elapsed, durSec, remaining) {
    const ns = _notificationsSent[block.id];
    if (!ns) return;

    // 15min warning before end
    if (!ns.at15 && remaining <= 15 * 60 && remaining > 0) {
      ns.at15 = true;
      sendNotif(`Noch 15 Minuten: ${block.title}`, `Noch 15 Minuten für '${block.title}'`);
    }

    // At end
    if (!ns.atEnd && elapsed >= durSec && remaining <= 0) {
      ns.atEnd = true;
      sendNotif(`Zeit um: ${block.title}`, `Zeit für '${block.title}' ist um. Gut gemacht — mach kurz Pause!`);
    }

    // 15min overtime
    if (!ns.at15over && elapsed >= durSec + 15 * 60) {
      ns.at15over = true;
      sendNotif(`Überstunden: ${block.title}`, `Du arbeitest 15min über die Zeit — bewusste Entscheidung?`);
    }
  }

  // ─── Notification permission ─────────────────────────────────────────────────
  async function requestPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      _notifPermission = await Notification.requestPermission();
    } else {
      _notifPermission = Notification.permission;
    }
  }

  function sendNotif(title, body) {
    if (_notifPermission === 'granted') {
      try { new Notification(title, { body }); } catch (e) { /* ignore */ }
    }
  }

  // ─── Interval management ──────────────────────────────────────────────────────
  function _ensureInterval() {
    if (_runningBlockId && !_interval) {
      _interval = setInterval(tick, 1000);
    } else if (!_runningBlockId && _interval) {
      _stopInterval();
    }
  }

  function _stopInterval() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
  }

  function getRunningBlockId() { return _runningBlockId; }

  return {
    start,
    pause,
    resume,
    reset,
    markDone,
    tick,
    getCurrentElapsed,
    getRunningBlockId,
    updateBlockDisplay,
    requestPermission,
  };
})();
