'use strict';
window.WP = window.WP || {};

// ─── Categories ────────────────────────────────────────────────────────────────
WP.CATEGORIES = {
  complex:  { label: 'Komplexe Illustration', color: '#c4622d', textColor: '#ffffff' },
  moderate: { label: 'Moderate Illustration', color: '#d4956a', textColor: '#4a3728' },
  quick:    { label: 'Schnellzeichnung',       color: '#e8c9a0', textColor: '#4a3728' },
  orga:     { label: 'Orga & Verwaltung',      color: '#7a8fa6', textColor: '#ffffff' },
  buffer:   { label: 'Flexibler Puffer',       color: '#a8b89a', textColor: '#4a3728' },
  event:    { label: 'Fester Termin',          color: '#4a3728', textColor: '#ffffff' },
};

WP.DAY_NAMES      = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
WP.DAY_NAMES_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
WP.CALENDAR_START = 8 * 60;   // 480 minutes
WP.CALENDAR_END   = 20 * 60;  // 1200 minutes
WP.CALENDAR_HEIGHT = WP.CALENDAR_END - WP.CALENDAR_START; // 720px (1px/min)

// ─── Helpers ───────────────────────────────────────────────────────────────────
WP.generateId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

WP.snapTo15 = (min) => Math.round(min / 15) * 15;

WP.timeToMinutes = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

WP.minutesToTime = (m) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

// ISO week key: "2026-W13"
WP.getWeekKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // ISO week: week containing Thursday
  const dayOfWeek = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + 4 - (dayOfWeek || 7)); // Nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const year = d.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
};

// Get Monday Date for a given week key
WP.getWeekMonday = (weekKey) => {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(week1Mon);
  monday.setDate(week1Mon.getDate() + (week - 1) * 7);
  return monday;
};

// Get Date for a specific day (0=Mon) within a week
WP.getDayDate = (weekKey, dayIndex) => {
  const monday = WP.getWeekMonday(weekKey);
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayIndex);
  return d;
};

WP.formatDate = (date) => date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

WP.getMonthKey = (date) => date.toISOString().slice(0, 7);

// Navigate to prev/next week
WP.prevWeekKey = (weekKey) => {
  const monday = WP.getWeekMonday(weekKey);
  monday.setDate(monday.getDate() - 7);
  return WP.getWeekKey(monday);
};

WP.nextWeekKey = (weekKey) => {
  const monday = WP.getWeekMonday(weekKey);
  monday.setDate(monday.getDate() + 7);
  return WP.getWeekKey(monday);
};

// Create a new blank block
WP.createBlock = (day, startTime, duration = 60, category = 'buffer', title = null) => ({
  id: WP.generateId(),
  day,
  startTime,
  duration,
  category,
  title: title || WP.CATEGORIES[category]?.label || 'Block',
  fromTemplate: false,
  tasks: [],
  checklist: [],
  timerState: 'idle',
  timerElapsed: 0,
  timerStartedAt: null,
  notes: '',
});

// Clone a template block into a week block (fresh id, fromTemplate flag)
WP.templateBlockToWeekBlock = (tBlock) => ({
  ...tBlock,
  id: WP.generateId(),
  fromTemplate: true,
  timerState: 'idle',
  timerElapsed: 0,
  timerStartedAt: null,
  tasks: (tBlock.tasks || []).map(t => ({ ...t })),
  checklist: (tBlock.checklist || []).map(c => ({ ...c })),
});

// ─── Default Template ──────────────────────────────────────────────────────────
// Helper to build template blocks (no timer state needed)
const _tb = (day, startTime, duration, cat, title) => ({
  id: WP.generateId(),
  day,
  startTime,
  duration,
  category: cat,
  title,
  fromTemplate: true,
  tasks: [],
  checklist: [],
  timerState: 'idle',
  timerElapsed: 0,
  timerStartedAt: null,
  notes: '',
});

WP.DEFAULT_TEMPLATE = {
  blocks: [
    // MONTAG (day:0)
    _tb(0, '09:00', 30,  'event',    'Akquise-Gruppe'),
    _tb(0, '09:30', 150, 'complex',  'Komplexe Illustration'),
    _tb(0, '12:00', 60,  'event',    'Mittagspause'),
    _tb(0, '13:00', 180, 'moderate', 'Moderate Illustration'),
    _tb(0, '16:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(0, '17:00', 60,  'buffer',   'Puffer'),

    // DIENSTAG (day:1)
    _tb(1, '09:00', 180, 'complex',  'Komplexe Illustration'),
    _tb(1, '12:00', 60,  'event',    'Mittagspause'),
    _tb(1, '13:00', 180, 'moderate', 'Moderate Illustration'),
    _tb(1, '16:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(1, '17:00', 60,  'buffer',   'Puffer'),

    // MITTWOCH (day:2)
    _tb(2, '09:00', 180, 'complex',  'Komplexe Illustration'),
    _tb(2, '12:00', 60,  'event',    'Mittagspause'),
    _tb(2, '13:00', 180, 'moderate', 'Moderate Illustration'),
    _tb(2, '16:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(2, '17:00', 60,  'buffer',   'Puffer'),

    // DONNERSTAG (day:3)
    _tb(3, '09:00', 180, 'moderate', 'Moderate Illustration'),
    _tb(3, '12:00', 60,  'event',    'Mittagspause'),
    _tb(3, '13:00', 120, 'complex',  'Komplexe Illustration'),
    _tb(3, '15:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(3, '16:00', 90,  'orga',     'Orga & Verwaltung'),
    _tb(3, '17:30', 30,  'buffer',   'Puffer'),

    // FREITAG (day:4)
    _tb(4, '09:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(4, '10:00', 120, 'orga',     'Orga & Verwaltung'),
    _tb(4, '12:00', 60,  'event',    'Mittagspause'),
    _tb(4, '13:00', 180, 'moderate', 'Moderate Illustration'),
    _tb(4, '16:00', 120, 'buffer',   'Puffer / Wochenabschluss'),

    // SAMSTAG (day:5)
    _tb(5, '10:00', 120, 'moderate', 'Moderate Illustration'),
    _tb(5, '12:00', 60,  'event',    'Mittagspause'),
    _tb(5, '13:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(5, '14:00', 60,  'buffer',   'Puffer'),

    // SONNTAG (day:6)
    _tb(6, '10:00', 120, 'moderate', 'Moderate Illustration'),
    _tb(6, '12:00', 60,  'event',    'Mittagspause'),
    _tb(6, '13:00', 60,  'quick',    'Schnellzeichnung'),
    _tb(6, '14:00', 60,  'buffer',   'Puffer'),
  ],
  checklistTemplates: {
    'deliver-illustration': {
      id: 'deliver-illustration',
      title: 'Illustration abliefern',
      items: [
        { text: 'Datei exportieren (300dpi, CMYK)', checked: false },
        { text: 'Rechnung stellen', checked: false },
        { text: 'Portfolio-Seite updaten', checked: false },
        { text: 'Social Media Post vorbereiten', checked: false },
      ],
    },
    'week-prep': {
      id: 'week-prep',
      title: 'Wochenvorbereitung',
      items: [
        { text: 'Auftragsübersicht prüfen', checked: false },
        { text: 'Materialien vorbereiten', checked: false },
        { text: 'E-Mails beantworten', checked: false },
        { text: 'Deadlines prüfen', checked: false },
      ],
    },
  },
};
