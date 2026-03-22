# Design Spec: Wochenplaner Anna

**Datum:** 2026-03-22
**Status:** Approved

---

## Überblick

Ein browser-basierter Wochenplaner für Illustratorin Anna, die ihr Portfolio im Bereich Editorial Illustration aufbaut. Der Planer hilft ihr dabei, strukturiert zu arbeiten und verhindert aktiv, dass sie bei einzelnen Zeichnungen zu viel Zeit investiert — durch Zeitschranken pro Block und aktives Nudging.

---

## Nutzerprofil

- **Nutzerin:** Anna, Illustratorin (MA Editorial Illustration, davor Grafische Erzählung)
- **Ziel:** Portfolio für Selbstständigkeit aufbauen, Fokus auf Editorial Illustration
- **Kernproblem:** Zu detailverliebt — investiert in einzelne Zeichnungen zu viel Zeit
- **Arbeitszeiten:** Bis zu 8h/Tag (Werktage), bis zu 4h/Tag (Wochenende)
- **Fester Termin:** Akquise-Gruppe, montags 09:00–09:30

---

## Tech-Stack

- **Frontend:** Vanilla HTML/CSS/JS — keine Frameworks, kein Build-Tool
- **Datenspeicherung:** IndexedDB via `idb`-Wrapper-Bibliothek (kein Datenverlust durch Cache-Clearing)
- **PDF-Export:** `html2canvas` + `jsPDF`
- **Deployment:** Lokale HTML-Datei, direkt im Browser öffnen — kein Server nötig
- **Bibliotheken (lokal gebundelt):** `idb.min.js`, `jspdf.min.js`, `html2canvas.min.js`

---

## Dateistruktur

```
WochenplanerAnna/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── db.js        ← IndexedDB / Datenpersistenz
│   ├── data.js      ← Datenmodell, Defaults & Basis-Template
│   ├── render.js    ← HTML-Generierung (Woche, Tag, Blöcke)
│   ├── timer.js     ← Timer-Logik & Nudging
│   └── app.js       ← Navigation, Events, alles zusammenführen
└── libs/
    ├── idb.min.js
    ├── jspdf.min.js
    └── html2canvas.min.js
```

---

## Datenmodell

```js
// Basis-Template (Annas "ideale Woche" — Ausgangspunkt jeder neuen Woche)
template: {
  blocks: [
    { day: 0, startTime: "09:00", duration: 30, category: "event", title: "Akquise-Gruppe" },
    { day: 0, startTime: "09:30", duration: 210, category: "complex", title: "Komplexe Illustration" },
    // ...
  ],
  checklistTemplates: { /* wiederverwendbare Checklisten */ }
}

// Konkrete Woche (ISO-KW als Key)
weeks["2026-W13"]: {
  goal: "NZZ-Titelseite finalisieren, Instagram-Post vorbereiten",
  dayGoals: { "2026-03-23": "Skizzenphase abschließen", ... },
  blocks: [ /* Kopie des Templates, individuell angepasst */ ]
}

// Monatsziele
goals["2026-04"]: {
  monthly: "3 Editorial-Illustrationen fertigstellen, 2 Verlage anschreiben"
}

// Feste Termine (werden beim Template-Laden automatisch eingefügt)
fixedEvents: [
  { day: 0, startTime: "09:00", duration: 30, title: "Akquise-Gruppe", recurring: "weekly" }
]
```

---

## Die 5 Arbeitskategorien

| Kategorie | Farbe | Hex |
|---|---|---|
| Komplexe Illustration | Tieforange | `#c4622d` |
| Moderate Illustration | Warmes Ocker | `#d4956a` |
| Schnellzeichnung | Hellbeige | `#e8c9a0` |
| Orga & Verwaltung | Schieferblau | `#7a8fa6` |
| Flexibler Puffer | Olivgrün | `#a8b89a` |
| Fester Termin | Dunkelbraun | `#4a3728` |

---

## Basis-Template (Vorschlag beim ersten Start)

| Zeit | Montag | Dienstag | Mittwoch | Donnerstag | Freitag | Samstag | Sonntag |
|---|---|---|---|---|---|---|---|
| 09:00–09:30 | Akquise-Gruppe | — | — | — | — | — | Frei |
| 09:30–13:00 | Komplexe Illus. (3,5h) | Moderate Illus. (3h) | Komplexe Illus. (4h) | Moderate Illus. (3h) | Schnellzeichnung (1h) + Orga (2h) | Moderate Illus. (2h, optional) | Frei |
| 13:00–15:00 | Schnellzeichnung (1h) + Puffer (1h) | Schnellzeichnung (1h) + Puffer (1h) | Fester Termin (Platzhalter) | Schnellzeichnung (1h) + Puffer (1h) | Puffer / Abschluss (2h) | Puffer (1h, optional) | Frei |

**Wochensumme:** ~30h aktive Arbeit · Komplexe Blöcke morgens (höchste Energie) · So frei

**Prinzip:** Deep Work zuerst (Cal Newport), kreative Varianz über die Woche, bewusste Erholung eingebaut.

---

## UI-Struktur

### Header-Bereich
```
[Monatsziel: April — 3 Editorial-Illustrationen fertigstellen...]
[KW 13  ←  →]  [Wochenansicht | Tagesansicht]  [Template]  [PDF]  [Backup]
[Wochenziel: NZZ-Titelseite finalisieren...]
```

### Wochenansicht (Default)
- Spalten: Mo–So
- Zeilen: Stunden (scrollbar)
- Über jeder Spalte: editierbares Tagesziel-Feld
- Blöcke: farbige Kacheln mit Titel, Dauer, Timer-Status
- Klick auf Block → Detailpanel

### Tagesansicht
- Eine Spalte groß + restliche Woche als Mini-Streifen rechts
- Wechsel via Tab oben

### Block-Detailpanel
- Titel (editierbar)
- Zeitschranke (editierbar)
- Optionale Aufgabenliste (Freitext-Items)
- Checkliste (via Template ladbar oder manuell)
- Timer starten/stoppen
- Kategorie ändern

### Block-Interaktion
- Klick → Detailpanel öffnen
- Drag → Block verschieben (innerhalb der Woche)
- Rechtsklick → Schnellmenü: duplizieren, löschen, Checklisten-Template laden

---

## Timer & Nudging-System

### Block-Zustände
```
[bereit] → [läuft ⏱] → [fast vorbei 🟡 <15min] → [Zeit um 🔴] → [abgeschlossen ✓]
```

### Visuelles Feedback
- Laufender Block zeigt Fortschrittsbalken + Countdown (`3:42:15`) direkt im Block
- Farbwechsel: Orange → Gelb (15min verbleibend) → Rot (Zeit abgelaufen)
- Tages-Gesamtzähler im Header: *"Heute: 3h 20min / 8h geplant"*

### Browser-Notifications
- **Warnung:** 15 Minuten vor Ablauf → *"Noch 15 Minuten für 'Komplexe Illustration'"*
- **Zeit um:** Beim Ablauf → *"Deine Zeit für 'Komplexe Illustration' ist um. Gut gemacht!"*
- **Nachkick:** 15 Minuten nach Ablauf (falls Block noch läuft) → *"Du arbeitest 15min über die Zeit — bewusste Entscheidung?"*

### Einschränkung
Timer läuft nur bei geöffnetem Tab — kein Background-Service. Bewusst: aktive Nutzung, keine passive Überwachung.

---

## Template-System & Wochenübernahme

### Neue Woche starten
Beim ersten Öffnen einer neuen Kalenderwoche erscheint ein Dialog:
- **A — Frisches Template** (Basis-Vorlage)
- **B — Vorwoche kopieren** (mit allen individuellen Anpassungen)
- **C — Manuell** (leere Woche, selbst befüllen)

### Änderungen propagieren
Beim Bearbeiten eines Template-Blocks:
- *"Nur für diese Woche"* — lokale Änderung
- *"Ab jetzt immer so"* — aktualisiert das Basis-Template

### Checklisten-Templates
- Wiederverwendbare Checklisten (z.B. "Illustration abliefern": Datei exportieren, Rechnung stellen, Portfolio updaten)
- Per Rechtsklick auf jeden Block ladbar
- Im Template-Editor verwaltbar

---

## Ziele-System

### Drei Ebenen
| Ebene | Wo | Wann setzen |
|---|---|---|
| Monatsziel | Header oben, immer sichtbar | Einmal pro Monat |
| Wochenziel | Unter KW-Navigation | Beim Wochenstart |
| Tagesziel | Über jeder Tagesspalte | Täglich / beim Wochenstart |

- Alle Felder inline editierbar — kein Modal, kein separates Menü
- Monatsziel bleibt über Wochenwechsel sichtbar

---

## PDF-Export

- **Inhalt:** Aktuelle Wochenansicht inkl. Ziele, ohne Timer/interaktive Elemente
- **Format:** A4 Querformat (Landscape) — eine Woche pro Seite
- **Technik:** `html2canvas` rendert Wochenansicht → `jsPDF` bettet als Bild ein
- **Trigger:** Klick auf PDF-Button → sofortiger Download
- **Optional:** Tagesansicht als A4 Hochformat exportieren

---

## Datensicherung

- **Primärspeicher:** IndexedDB (wird nicht durch Browser-Cache-Clearing gelöscht)
- **Backup:** JSON-Export per Button ("Backup speichern") → Datei auf Festplatte
- **Restore:** JSON-Import per Button ("Backup laden")
- **Erinnerung:** Hinweis wenn >7 Tage kein Backup erstellt wurde

---

## Visuelles Design

### Stil
"Warm & Atelierisch" — cremefarbene Töne, warme Akzente, handwerkliches Gefühl. Wie ein hochwertiges Skizzenbuch für Kreative. Einladend, nicht klinisch.

### Farbpalette
| Rolle | Farbe | Hex |
|---|---|---|
| Hintergrund | Cremeweiß | `#fffdf9` |
| Fläche | Warmes Beige | `#f5f0ea` |
| Border | Warmes Grau | `#e8e0d5` |
| Text Haupt | Dunkelbraun | `#4a3728` |
| Text Sekundär | Warmgrau | `#b09080` |
| Akzent | Warmes Terra | `#d4956a` |

### Typografie
- Serif-Schrift für Überschriften und Labels (Georgia als Fallback)
- System-Sans für kleine UI-Elemente

---

## Nicht im Scope (bewusst ausgelassen)

- Keine Multi-User-Funktion
- Kein Backend / keine Cloud-Sync
- Kein Mobile-first (Desktop-Planer, Responsive ist nice-to-have)
- Keine Zeiterfassung rückwirkend / Reports
