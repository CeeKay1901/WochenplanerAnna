# Design Spec: Wochenplaner Anna

**Datum:** 2026-03-22
**Status:** In Review

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

### Kategorie-Keys (kanonisches Mapping)

Interne String-Keys, konsistent in `db.js`, `data.js` und `render.js` verwendet:

| Key | Anzeigename |
|---|---|
| `"complex"` | Komplexe Illustration |
| `"moderate"` | Moderate Illustration |
| `"quick"` | Schnellzeichnung |
| `"orga"` | Orga & Verwaltung |
| `"buffer"` | Flexibler Puffer |
| `"event"` | Fester Termin (spezieller Block-Typ, keine Arbeitskategorie) |

### Tag-Nummerierung

`day: 0` = Montag, `day: 1` = Dienstag, …, `day: 6` = Sonntag.
(Abweichend von `Date.getDay()` wo 0 = Sonntag — hier bewusst Montag-first.)

### Datenstrukturen

```js
// Checklisten-Template-Schema
checklistTemplate: {
  id: "deliver-illustration",          // eindeutiger Key
  title: "Illustration abliefern",
  items: [
    { text: "Datei exportieren", checked: false },
    { text: "Rechnung stellen",  checked: false },
    { text: "Portfolio updaten", checked: false },
  ]
}

// Basis-Template (Annas "ideale Woche")
template: {
  blocks: [
    // day: 0 = Montag, duration in Minuten
    { day: 0, startTime: "09:00", duration: 30,  category: "event",    title: "Akquise-Gruppe" },
    { day: 0, startTime: "09:30", duration: 150, category: "complex",  title: "Komplexe Illustration" },
    { day: 0, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    { day: 0, startTime: "13:00", duration: 60,  category: "quick",    title: "Schnellzeichnung" },
    { day: 0, startTime: "14:00", duration: 60,  category: "buffer",   title: "Puffer" },

    { day: 1, startTime: "09:00", duration: 180, category: "moderate", title: "Moderate Illustration" },
    { day: 1, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    { day: 1, startTime: "13:00", duration: 60,  category: "quick",    title: "Schnellzeichnung" },
    { day: 1, startTime: "14:00", duration: 60,  category: "buffer",   title: "Puffer" },

    { day: 2, startTime: "09:00", duration: 180, category: "complex",  title: "Komplexe Illustration" },
    { day: 2, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    { day: 2, startTime: "13:00", duration: 60,  category: "quick",    title: "Schnellzeichnung" },
    { day: 2, startTime: "14:00", duration: 60,  category: "buffer",   title: "Puffer" },

    { day: 3, startTime: "09:00", duration: 180, category: "moderate", title: "Moderate Illustration" },
    { day: 3, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    { day: 3, startTime: "13:00", duration: 60,  category: "quick",    title: "Schnellzeichnung" },
    { day: 3, startTime: "14:00", duration: 60,  category: "buffer",   title: "Puffer" },

    { day: 4, startTime: "09:00", duration: 60,  category: "quick",    title: "Schnellzeichnung" },
    { day: 4, startTime: "10:00", duration: 120, category: "orga",     title: "Orga & Verwaltung" },
    { day: 4, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    { day: 4, startTime: "13:00", duration: 120, category: "buffer",   title: "Puffer / Abschluss" },

    { day: 5, startTime: "10:00", duration: 120, category: "moderate", title: "Moderate Illustration (optional)" },
    { day: 5, startTime: "12:00", duration: 60,  category: "event",    title: "Mittagspause" },
    // day: 6 (Sonntag) — leer, freier Tag
  ],
  checklistTemplates: {
    "deliver-illustration": {
      id: "deliver-illustration",
      title: "Illustration abliefern",
      items: [
        { text: "Datei exportieren (300dpi, CMYK)", checked: false },
        { text: "Rechnung stellen", checked: false },
        { text: "Portfolio-Seite updaten", checked: false },
        { text: "Social Media Post vorbereiten", checked: false },
      ]
    }
  }
}

// Konkrete Woche (ISO-KW als Key, z.B. "2026-W13")
weeks["2026-W13"]: {
  goal: "NZZ-Titelseite finalisieren, Instagram-Post vorbereiten",
  dayGoals: {
    "2026-03-23": "Skizzenphase abschließen",
    "2026-03-24": "Farben finalisieren",
  },
  blocks: [
    // Kopie der Template-Blöcke, plus individuelle Anpassungen dieser Woche
    // Jeder Block bekommt zusätzlich:
    {
      id: "block-uuid",              // eindeutige ID pro Block-Instanz
      day: 0,
      startTime: "09:00",
      duration: 30,
      category: "event",
      title: "Akquise-Gruppe",
      fromTemplate: true,            // wurde vom Template übernommen
      tasks: [{ text: "Aufgabe", done: false }],     // Aufgabenliste (Freitext)
      checklist: [{ text: "Schritt", checked: false }], // Checkliste (Checkbox)
      timerState: "idle",            // "idle" | "running" | "paused" | "overtime" | "done"
                                     // "warning" ist KEIN gespeicherter State — wird render-only
                                     // berechnet: timerElapsed >= (duration*60 - 900) && timerState === "running"
      timerElapsed: 0,               // vergangene Sekunden (für Pause/Resume)
    }
  ]
}

// Monatsziele (YYYY-MM als Key)
goals["2026-04"]: {
  monthly: "3 Editorial-Illustrationen fertigstellen, 2 Verlage anschreiben"
}

// App-Metadaten (in IndexedDB store "meta", key-value)
meta["lastBackupDate"]: "2026-03-15T10:30:00Z"  // ISO-String, gesetzt beim Export
```

### `fixedEvents` vs. Template-Blöcke

Feste Termine (z.B. Akquise-Gruppe) werden **ausschließlich als Block im Template** gespeichert — es gibt kein separates `fixedEvents`-Array. Beim Anlegen einer neuen Woche werden Template-Blöcke mit `category: "event"` wie alle anderen übernommen, können aber nicht auf "Nur für diese Woche" geändert werden. Strukturänderungen an `event`-Blöcken propagieren immer ins Template.

---

## Die 5 Arbeitskategorien + Fester Termin

**5 Arbeitskategorien** (für Zeitplanung und Statistik):

| Kategorie | Key | Farbe | Hex |
|---|---|---|---|
| Komplexe Illustration | `"complex"` | Tieforange | `#c4622d` |
| Moderate Illustration | `"moderate"` | Warmes Ocker | `#d4956a` |
| Schnellzeichnung | `"quick"` | Hellbeige | `#e8c9a0` |
| Orga & Verwaltung | `"orga"` | Schieferblau | `#7a8fa6` |
| Flexibler Puffer | `"buffer"` | Olivgrün | `#a8b89a` |

**Spezieller Block-Typ** (kein Arbeitsblock, kein Timer):

| Typ | Key | Farbe | Hex |
|---|---|---|---|
| Fester Termin | `"event"` | Dunkelbraun | `#4a3728` |

`event`-Blöcke haben keinen Timer, keine Aufgabenliste, keine Zeitschranke. Nur Titel und Notizfeld.

---

## Basis-Template — Wochensumme

Das Template ist ein **Startvorschlag** (nicht alle 8h pro Tag belegt — bewusst, um Luft zu lassen):

| Kategorie | Stunden/Woche |
|---|---|
| Komplexe Illustration | ~5h (Mo 2,5h + Mi 3h) |
| Moderate Illustration | ~8h (Di 3h + Do 3h + Sa 2h) |
| Schnellzeichnung | ~4h (4× 1h) |
| Orga & Verwaltung | ~2h (Fr 2h) |
| Flexibler Puffer | ~4h (verteilt) |
| Mittagspause | 6h (Mo–Sa je 1h, kein Arbeitsblock) |
| **Gesamt Arbeit** | **~23h** |

---

## UI-Struktur

### Kalender-Raster

- **Sichtbarer Zeitbereich:** 08:00–20:00 (scrollbar bei Bedarf)
- **Zeitachse:** Links, Stundenmarken alle 60min, Halbstundenmarken dezent
- **Mindesthöhe pro Stunde:** 60px (1px pro Minute)

### Header-Bereich

```
[Monatsziel: April — 3 Editorial-Illustrationen fertigstellen...]
[KW 13  ←  →]  [Wochenansicht | Tagesansicht]  [Template]  [PDF ↓]  [Backup ↓]
[Wochenziel: NZZ-Titelseite finalisieren...]
```

### Wochenansicht (Default)

- Spalten: Mo–So (7 Spalten + Zeitachse links)
- Über jeder Spalte: editierbares Tagesziel-Feld (Klick → inline edit)
- Blöcke: farbige Kacheln, positioniert nach `startTime` und `duration`
- Klick auf Block → Detailpanel (rechts oder als Overlay)

### Tagesansicht

- Aktiver Tag als breite Hauptspalte (links)
- Restliche 6 Tage als schmale nicht-interaktive Mini-Streifen (rechts, nur zur Orientierung)
- Beim Wechsel in Tagesansicht: der angeklickte Tag oder der heutige Tag wird gezeigt
- Mini-Streifen sind klickbar zum Wechsel des angezeigten Tages
- Detailpanel, Timer und Block-Interaktion identisch zur Wochenansicht

### Block-Detailpanel

Öffnet sich seitlich (Slide-in) bei Klick auf einen Block. Felder:

- **Titel** (inline editierbar)
- **Kategorie** (Dropdown mit den 5 Kategorien + "event")
- **Startzeit / Dauer** (editierbare Felder — kein Drag-to-Resize, nur per Panel)
- **Aufgabenliste** — Freitext-Items mit Abhak-Funktion (kein Template, schnelle Notizen)
- **Checkliste** — Checkbox-Items, via gespeichertem Checklisten-Template ladbar oder manuell befüllt
- **Timer-Steuerung** — Start / Pause / Zurücksetzen / Als erledigt markieren
- **Notiz** — Freitextfeld (nur für `event`-Blöcke relevant)

**Unterschied Aufgabenliste vs. Checkliste:**
- *Aufgabenliste*: schnelle Freitext-To-dos, nicht wiederverwendbar, kein Template
- *Checkliste*: strukturierte Checkbox-Liste, aus gespeichertem Template ladbar, für wiederkehrende Workflows

### Block-Interaktion

- **Klick** → Detailpanel öffnen
- **Doppelklick auf leeren Slot** → neuer Block wird mit Standardwerten erstellt (Kategorie: "buffer", Dauer: 60min, Snap auf 15-Minuten-Raster), Detailpanel öffnet sich sofort
- **Drag** → Block verschieben (Snap auf 15-Minuten-Raster, nur innerhalb der aktuellen Woche)
- **Drag-to-Resize** → nicht implementiert (Dauer nur über Detailpanel ändern)
- **Rechtsklick** → Schnellmenü: Duplizieren, Löschen, Checklisten-Template laden
- **Block-Überlappung** → wird verhindert: beim Ablegen eines Blocks auf einem besetzten Slot springt er zurück zur Ausgangsposition und zeigt einen kurzen Toast-Fehler (*"Dieser Zeitraum ist bereits belegt"*)
- **Löschen (normale Arbeitsblöcke):** Bestätigungsdialog *"Block löschen?"*. Template-Blöcke (`fromTemplate: true`, Kategorie ≠ `"event"`) zeigen: *"Nur in dieser Woche löschen"* (Standard) oder *"Aus Template entfernen"*. Löschen in einer Woche beeinflusst keine anderen Wochen.
- **Löschen (`event`-Blöcke):** Kein Dialog-Choice — `event`-Blöcke propagieren immer. Einfacher Bestätigungsdialog: *"Festen Termin aus Template entfernen? Er wird auch in künftigen Wochen nicht mehr erscheinen."*

### Snap-Raster

- Alle Zeiten (Startzeit, Drag, Doppelklick) rasten auf **15-Minuten-Intervalle** ein: 09:00, 09:15, 09:30, 09:45 …
- Minimale Block-Dauer: **15 Minuten**
- Eingaben im Detailpanel werden beim Speichern auf das nächste 15-Minuten-Intervall gerundet

### Template-Editor

Erreichbar über den "Template"-Button im Header. Öffnet sich als eigene Vollansicht (kein Modal). Inhalte:

- Wochenraster des Basis-Templates (identisches Layout wie Wochenansicht, aber mit "Template"-Kennzeichnung)
- Blöcke editierbar, hinzufügbar, löschbar
- Abschnitt "Checklisten-Templates": Liste aller gespeicherten Templates mit Erstellen / Umbenennen / Löschen / Items bearbeiten
- "Zurück zum Planer"-Button

---

## Timer & Nudging-System

### Block-Zustände

```
                    ┌─────────────────────────────────────┐
                    ↓                                     │
[idle] → [running ⏱] → [overtime 🔴] → [done ✓]        │ (pause/resume)
              │                                          │
              └──────────────── [paused ⏸] ─────────────┘
```

- `warning` (visuell: pulsierender Rahmen) ist **render-only**, kein gespeicherter State.
  Bedingung: `timerState === "running"` UND verbleibende Zeit < 15 Minuten.
- `paused` ist aus allen aktiven States erreichbar (`running`, `overtime`).
  Aus `paused` geht es immer zurück zu dem State, aus dem pausiert wurde.
- `done` ist ein Endstate — kein Übergang zurück (nur via explizitem Reset → `idle`).

### Visuelles Feedback (ohne Hintergrundfarbe zu überschreiben)

Der Timer-Status wird über einen **separaten visuellen Layer** kommuniziert, damit die Kategoriefarbe erhalten bleibt:

- **Laufend:** Fortschrittsbalken am unteren Rand des Blocks (wird kleiner), Countdown im Block sichtbar
- **Warnung (<15min):** Oranger pulsierender **Rahmen** um den Block, Countdown wird gelb
- **Overtime:** Roter pulsierender **Rahmen** + roter Countdown mit `+` Prefix (`+00:05:32`)
- **Erledigt:** Dezentes Häkchen-Icon, Opacity leicht reduziert

Tages-Gesamtzähler im Header: *"Heute: 3h 20min / 6h 30min geplant"*
Der **"geplant"**-Wert ist die **Summe aller Block-Dauern des heutigen Tages** (nur Arbeitskategorien, ohne `event`-Blöcke). Kein hardcoded 8h-Wert — der Wert ergibt sich aus dem tatsächlichen Plan.

### Browser-Notifications

Notification-Permission wird beim **ersten Timer-Start** angefragt (nicht beim App-Load). Falls der Nutzer ablehnt: ausschließlich visuelles In-App-Feedback (kein Fehler, kein erneutes Fragen).

| Zeitpunkt | Nachricht |
|---|---|
| 15min vor Ablauf | *"Noch 15 Minuten für '[Titel]'"* |
| Ablauf | *"Zeit für '[Titel]' ist um. Gut gemacht — mach kurz Pause!"* |
| 15min nach Ablauf (falls noch läuft) | *"Du arbeitest 15min über die Zeit — bewusste Entscheidung?"* |

**Gleichzeitige Timer:** Es kann immer nur **ein Timer gleichzeitig laufen**. Startet Anna einen zweiten Block, wird der erste automatisch pausiert (nicht gestoppt — `timerState` wechselt auf `"paused"`). Der Header zeigt immer den aktuell laufenden Block.

**Tab-Hintergrund:** Der Timer läuft weiter wenn der Tab im Hintergrund ist (Page Visibility API: kein Pause bei `hidden`). Die verstrichene Zeit wird via `Date.now()`-Delta berechnet, nicht via `setInterval`-Zähler — so gehen keine Sekunden verloren. Kein Background-Service Worker.

Timer läuft nicht mehr wenn der Tab **geschlossen** wird. `timerElapsed` wird beim letzten Tick gespeichert.

---

## Template-System & Wochenübernahme

### Neue Woche starten

Beim ersten Öffnen einer noch nicht angelegten Kalenderwoche erscheint ein Dialog:

- **A — Frisches Template** (Basis-Vorlage unverändert übernehmen)
- **B — Vorwoche kopieren** (alle individuellen Anpassungen der letzten Woche)
- **C — Manuell** (leere Woche, selbst befüllen)

### Änderungen propagieren

**Trigger:** Die Propagations-Frage erscheint nur wenn der Nutzer an einem Block **strukturelle Änderungen** speichert (Startzeit, Dauer oder Kategorie) — nicht bei Inhaltsänderungen (Titel, Aufgabenliste, Checkliste, Notiz).

**Gilt nicht für `event`-Blöcke** — diese propagieren immer automatisch ins Template.

Dialog-Optionen:
- *"Nur für diese Woche"* — lokale Änderung, Template bleibt unberührt
- *"Ab jetzt immer so"* — aktualisiert das Basis-Template für alle künftigen Wochen

---

## Ziele-System

### Drei Ebenen

| Ebene | Wo | Wann setzen |
|---|---|---|
| Monatsziel | Header oben, immer sichtbar | Einmal pro Monat, bleibt über Wochenwechsel |
| Wochenziel | Unter KW-Navigation | Beim Wochenstart (oder beim Anlegen der Woche) |
| Tagesziel | Über jeder Tagesspalte | Täglich oder beim Wochenstart |

Alle Felder sind inline editierbar (Klick → Textcursor erscheint, Enter oder Blur zum Speichern). Kein Modal, kein separates Menü.

---

## PDF-Export

- **Inhalt:** Aktuelle Wochenansicht inkl. aller Ziele, ohne Timer/interaktive Elemente
- **Format:** A4 Querformat (Landscape) — eine Woche pro Seite
- **Technik:** `html2canvas` rendert die `#week-grid`-Komponente → `jsPDF` bettet als Bild ein
- **Trigger:** Klick auf "PDF ↓"-Button → sofortiger Download (`wochenplaner-KW13-2026.pdf`)
- **Optional:** Klick auf PDF-Button in der Tagesansicht → A4 Hochformat des aktuell angezeigten Tages

---

## Datensicherung

- **Primärspeicher:** IndexedDB (wird nicht durch Browser-Cache-Clearing gelöscht)
- **Backup exportieren:** Klick auf "Backup ↓"-Button → Download einer JSON-Datei (`wochenplaner-backup-2026-03-22.json`)
- **Backup laden:** "Backup laden"-Button → Dateiauswahl-Dialog → Daten werden importiert (bestehende Daten werden überschrieben, mit Bestätigungsdialog)
- **Backup-Erinnerung:** Bei jedem App-Start wird `meta["lastBackupDate"]` geprüft. Ist der Wert `null` (noch nie gesichert) oder liegt er >7 Tage zurück → Toast oben rechts: *"Letztes Backup vor X Tagen — jetzt sichern?"* bzw. bei `null`: *"Noch kein Backup erstellt — jetzt sichern?"*

---

## Visuelles Design

### Stil

"Warm & Atelierisch" — cremefarbene Töne, warme Akzente, handwerkliches Gefühl. Wie ein hochwertiges Skizzenbuch. Einladend, nicht klinisch.

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

- **Primär:** Georgia (Serif) — für Überschriften, Ziel-Felder, Block-Titel
- **UI-Elemente:** System-UI-Sans (system-ui, -apple-system, sans-serif) — für kleine Labels, Buttons, Zeitangaben

---

## Nicht im Scope (bewusst ausgelassen)

- Keine Multi-User-Funktion
- Kein Backend / keine Cloud-Sync
- Kein Mobile-first (Desktop-Planer, Responsive nice-to-have)
- Keine rückwirkende Zeiterfassung / Reports / Statistiken
- Kein Drag-to-Resize für Blöcke
