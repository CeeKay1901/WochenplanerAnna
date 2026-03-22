'use strict';
window.WP = window.WP || {};

WP.db = (() => {
  let _db = null;
  const DB_NAME = 'wochenplaner-anna';
  const DB_VERSION = 1;

  // Open (or create) the IndexedDB database
  async function open() {
    _db = await idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // One record per key "current"
        if (!db.objectStoreNames.contains('template')) {
          db.createObjectStore('template');
        }
        // Keyed by "2026-W13"
        if (!db.objectStoreNames.contains('weeks')) {
          db.createObjectStore('weeks');
        }
        // Keyed by "2026-04"
        if (!db.objectStoreNames.contains('goals')) {
          db.createObjectStore('goals');
        }
        // Generic key-value store
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }

  // Return the current template, or seed from DEFAULT_TEMPLATE
  async function getTemplate() {
    let t = await _db.get('template', 'current');
    if (!t) {
      // Deep-clone the default so IDs are unique on first use
      t = JSON.parse(JSON.stringify(WP.DEFAULT_TEMPLATE));
      // Regenerate IDs for the default template blocks
      t.blocks = t.blocks.map(b => ({ ...b, id: WP.generateId() }));
      await _db.put('template', t, 'current');
    }
    return t;
  }

  async function saveTemplate(t) {
    await _db.put('template', t, 'current');
  }

  async function getWeek(key) {
    return _db.get('weeks', key) || null;
  }

  async function saveWeek(key, data) {
    await _db.put('weeks', data, key);
  }

  async function getGoal(key) {
    return _db.get('goals', key) || null;
  }

  async function saveGoal(key, data) {
    await _db.put('goals', data, key);
  }

  async function getMeta(key) {
    return _db.get('meta', key);
  }

  async function setMeta(key, val) {
    await _db.put('meta', val, key);
  }

  // Categories: stored as object {key: {label, color, textColor}}
  async function getCategories() {
    return _db.get('meta', 'categories') || null;
  }

  async function saveCategories(cats) {
    await _db.put('meta', cats, 'categories');
  }

  // Export ALL data from all stores as one JSON object
  async function exportAll() {
    const template = await _db.get('template', 'current');

    // Get all weeks
    const weekKeys = await _db.getAllKeys('weeks');
    const weeksObj = {};
    for (const k of weekKeys) {
      weeksObj[k] = await _db.get('weeks', k);
    }

    // Get all goals
    const goalKeys = await _db.getAllKeys('goals');
    const goalsObj = {};
    for (const k of goalKeys) {
      goalsObj[k] = await _db.get('goals', k);
    }

    // Get meta
    const metaKeys = await _db.getAllKeys('meta');
    const metaObj = {};
    for (const k of metaKeys) {
      metaObj[k] = await _db.get('meta', k);
    }

    return {
      exportedAt: new Date().toISOString(),
      version: DB_VERSION,
      template,
      weeks: weeksObj,
      goals: goalsObj,
      meta: metaObj,
    };
  }

  // Overwrite all stores with imported data
  async function importAll(data) {
    if (data.template) {
      await _db.put('template', data.template, 'current');
    }
    if (data.weeks) {
      const tx = _db.transaction('weeks', 'readwrite');
      await tx.store.clear();
      for (const [k, v] of Object.entries(data.weeks)) {
        await tx.store.put(v, k);
      }
      await tx.done;
    }
    if (data.goals) {
      const tx = _db.transaction('goals', 'readwrite');
      await tx.store.clear();
      for (const [k, v] of Object.entries(data.goals)) {
        await tx.store.put(v, k);
      }
      await tx.done;
    }
    if (data.meta) {
      const tx = _db.transaction('meta', 'readwrite');
      await tx.store.clear();
      for (const [k, v] of Object.entries(data.meta)) {
        await tx.store.put(v, k);
      }
      await tx.done;
    }
  }

  return { open, getTemplate, saveTemplate, getWeek, saveWeek, getGoal, saveGoal, getMeta, setMeta, getCategories, saveCategories, exportAll, importAll };
})();
