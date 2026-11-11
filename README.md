# J.A.R.V.I.S.

Eigene KI-Plattform – läuft auf Cloudflare Workers (kostenloser Einstieg).

## Stand: Phase 1

| Funktion | Status |
|---|---|
| Startseite mit animiertem Reaktorkern | ✅ fertig |
| KI-Chat mit live geschriebenen Antworten (Workers AI) | ✅ fertig |
| Antwort stoppen, neu generieren, kopieren | ✅ fertig |
| Markdown und Codeblöcke mit Kopierfunktion | ✅ fertig |
| Chatverlauf, umbenennen, löschen, durchsuchen | ✅ fertig (vorerst nur auf dem Gerät gespeichert) |
| Als App zum Home-Bildschirm hinzufügen (PWA) | ✅ fertig |
| Basisschutz: Eingabeprüfung, Längenlimits, Anfragen pro Minute | ✅ fertig |
| Benutzerkonten, Gedächtnis | 🔜 geplant (Phase 2) |
| Spracheingabe, Websuche, Dateien | 🔜 geplant (Phase 3) |
| Tarife Free / Go / Plus / Pro | 🔜 geplant (Phase 4) |
| Zahlungen (Stripe) | 🔜 geplant (Phase 5) |
| Admin-Dashboard | 🔜 geplant (Phase 6) |

## Ordner

```
src/index.js     Backend (API)
src/lib.js       Prüfungen und Hilfsfunktionen
public/          Oberfläche (HTML, CSS, JavaScript, Icons)
tests/           automatische Tests (npm test)
wrangler.jsonc   Cloudflare-Konfiguration
alt/             älterer Entwurf (nicht in Benutzung)
```

## Kosten

Phase 1 nutzt nur kostenlose Kontingente: Workers Free (100.000 Anfragen/Tag) und
Workers AI (10.000 Neurons/Tag). Ist das KI-Kontingent aufgebraucht, zeigt die App
eine verständliche Meldung, bis es nachts zurückgesetzt wird. Es entstehen keine Kosten,
solange kein kostenpflichtiger Tarif bei Cloudflare gebucht wird.
