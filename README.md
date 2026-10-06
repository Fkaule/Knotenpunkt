# Knotenpunkt

Stabwerk-Minispiel, abgeleitet von [Knackpunkt](https://github.com/Fkaule/Knackpunkt): Sie bauen ein Tragwerk aus Stäben, wie im Bridge Builder, und eine FE-Rechnung im Browser zeigt, ob es hält. Gewertet wird die Masse in Kilogramm, wenn es hält; je leichter, desto besser.

Dasselbe Stabwerk lässt sich auf zwei Arten rechnen, im Ergebnis schalten Sie zwischen beiden um:

- **Fachwerk:** Knoten sind Gelenke, Stäbe tragen nur Normalkraft. Ohne Dreiecke ist es beweglich.
- **Rahmen:** Knoten sind biegesteif, Stäbe sind Balken. Felder ohne Diagonale tragen über Biegung, brauchen dafür aber dicke Profile; in Fachwerken zeigt diese Ansicht die Nebenspannungen.

Spielen: https://fkaule.github.io/Knotenpunkt/

## Bedienung

- Ziehen von Knoten zu Knoten zeichnet eine Linie aus Stäben (waagrecht, senkrecht, unter 45°) im gewählten Profil. Beginnt der Zug auf einem Stab, der schon in diesem Profil daliegt, nimmt er die Stäbe entlang der Linie weg.
- Antippen setzt einen Stab oder nimmt ihn weg; mit einem anderen Profil gewählt bekommt der Stab dieses Profil.
- Bei Live-Verformung zählt die sichtbare Lage: Gezogen und angetippt wird an den verformt gezeichneten Knoten und Stäben.
- Drei Profile (Tasten 1 bis 3). Gesperrte Stäbe (Fahrbahn, Stützen und Riegel des Tors) bleiben, ihr Profil ist wählbar.
- „Volles Raster“ als Vorlage, „Alles leeren“ zurück zum Start.
- Live beim Zeichnen, einzeln oder zusammen: Verformung (fester Maßstab je Bauteil: das volle Raster im mittleren Profil verschiebt sich um 0,3 % der größten Abmessung, ein weicher Entwurf entsprechend mehr, sanft begrenzt auf 5 %) und Auslastung (Übungsmodus). Dazu eine Probe-Rechnung mit Auslastung. Die Zeile unter der Zeichnung nennt die Überhöhung und die größte Knotenverschiebung in mm (echt, nicht überhöht); in der Zeichnung trägt dieser Knoten einen Ring mit dem Wert, auf der Seite, zu der er sich bewegt.
- **Werte** unter der Zeichnung, sobald Farben zu sehen sind (Übungsmodus, Probe-Rechnung, Ergebnis, Wettkampf): Auslastung, Kräfte (Stabkraft N in kN, Zug blau mit +, Druck rot mit −, Nullstäbe grau mit 0, im Rahmen Stäbe nur auf Biegung violett mit 0; kleine Kräfte stehen mit Wert da, ganz kleine mit Zehnerpotenz; Lagerkräfte als grüne Pfeile, eine Einspannung über mehrere Knoten als Resultierende mit Einspannmoment), Spannungen ($`|N|/A + |M|_\text{max}/W`$ in MPa) und Knicklasten (je Druckstab Druckkraft / Knicklast $`\pi^2 E I / L_k^2`$ in kN, Farbe: Druckkraft je Knicklast). Zahlen je Stab (ein gerader Stabzug ist ein Stab); wo sie sich überdecken würden, fallen die kleineren weg. Beschriftungen von Lasten weichen nach links oder über das Pfeilende aus, wenn sie einen anderen Pfeil überdecken würden.
- **Einstellungen** „Mit Eigengewicht“ (je tragendem Stab Masse mal $`g = 9{,}81\ \text{m/s}^2`$, auf seine Enden verteilt wie beim Einfeldträger; im Fachwerk ist ein gerader Stabzug ein Stab, sein Gewicht greift nicht quer an den Durchlaufstellen an) und „Mit Knicken“ (ausgeschaltet nur Fließen, ohne Knicken der Stäbe und ohne Stabilität des Ganzen; Knicklasten weiter zur Info). Allein im Entwurf umschaltbar, im Wettkampf je Runde von der Spielleitung; der Gegner rechnet mit denselben Einstellungen.

## Zufall und Baukasten

- **Zufall:** Aus einer Nummer (1 bis 99.999) entsteht auf jedem Gerät dasselbe Bauteil: Kragarm, Träger (mit Fahrbahn, Last oben oder unten, Kragende), Konsole, Winkel, Rahmen (wahlweise mit vorgegebenen Stützen und Riegel), Mast, Galgen, Hänger. Der Link `#nr-12345` hält es fest, `#zufall` zieht eine neue Nummer. Nach den festen Bauteilen führt „Nächstes Bauteil“ zum Zufall.
- **Baukasten** („Bauen“, Link `#bauen`): übernimmt das aktuelle Bauteil zum Abwandeln. Raster als Rechtecke aus Feldern (bis 12 × 8), Einspannung, Festlager und Loslager an Randknoten (die Seite ergibt sich aus der Lage des Zeigers, beim Ziehen einer Einspannung aus der Zugrichtung), Lasten an Knoten in 45°-Schritten, gesperrte Stäbe. „Beträge automatisch“ bemisst alle Lasten gleich; sonst gelten die eigenen Beträge (0,5 bis 200 kN), sofern das volle Raster im mittleren Profil sie als Fachwerk und als Rahmen trägt. „Spielen“ schreibt das Bauteil als Code in den Link (`#bau-…`).
- **Bemessung:** Die Lasten werden so skaliert, dass das volle Raster im mittleren Profil als Fachwerk zu etwa 55 % ausgelastet ist, gerundet auf glatte Beträge (0,5 bis 200 kN); so liegt die Auslastung zwischen 42 und 64 %. Ein Bauteil gilt nur, wenn das volle Raster in beiden Modellen hält; jedes ist damit lösbar.
- Ränder und Bemaßung ergeben sich bei diesen Bauteilen aus Lagern und Lasten, das Höhenmaß steht auf der freieren Seite.

## Kommilitonen herausfordern

- Nach einem Ergebnis, das hält und ohne Live-Auslastung entstanden ist, erzeugt „Kommilitonen herausfordern“ einen Link mit Bauteil, Regeln (Rechenmodell, Eigengewicht, Knicken), Masse und Namen: `#duell~<Bauteil>~<t|f>~<Eigengewicht 0|1><Knicken 0|1>~<Masse mal 10>~<Name>`, Bauteil `f0` bis `f3` (fest), `z<Nummer>` (Zufall) oder `b<Code>` (Baukasten).
- Wer den Link öffnet, spielt dasselbe Bauteil nach denselben Regeln, ohne Live-Auslastung, und versucht, leichter zu bauen. Oben im Bedienfeld steht das Ziel, nach dem Abgeben der Ausgang (gewonnen, Gleichstand, vorn liegt der andere); „Kommilitonen herausfordern“ schickt das eigene Ergebnis zurück.
- Ein anderes Bauteil, ein anderes Rechenmodell, andere Einstellungen oder der Wettkampf beenden die Herausforderung. Gespeichert wird nichts; die Links zeigen auf die öffentliche Seite (lokal auf die eigene).

## Wettkampf

- Läuft über einen eigenen Spielserver (`server.mjs`, Node und ws), der nur den Status aller Geräte verteilt (Presence); gerechnet wird in den Browsern. Auf GitHub Pages gibt es keinen Spielserver, dort ist der Wettkampf gesperrt.
- Die Spielleitung eröffnet einen Raum mit vierstelligem Code (Link mit `#CODE`), wählt Bauteil (fest, Zufallsbauteil oder das zuletzt im Baukasten gespielte), Rechenmodell (Fachwerk oder Rahmen) und Zeit (3 bis 10 Minuten) und kann selbst mitspielen. Nach den festen Bauteilen schlägt sie Zufall vor.
- Keine Probe-Rechnungen: Verformung und Auslastung sind die ganze Runde live zu sehen. Der Beamer zeigt dabei je Person die Masse des aktuellen Entwurfs, grün, wenn er gerade hält.
- Live-Rangliste für alle, die mitspielen: die fünf leichtesten Entwürfe, die gerade halten, mit Platz (gleiche Masse, gleicher Platz), die eigene Zeile immer, dazu wie viele Entwürfe gerade halten; auch nach dem Abgeben.
- Auflösung: Entwürfe nacheinander aufdecken, der leichteste zuletzt; große Ansicht je Entwurf, umschaltbar zwischen Fachwerk und Rahmen; der Algorithmus als Geisterzeile.
- Eigengewicht und Knicken stellt die Spielleitung je Runde ein (Standard: ohne Eigengewicht, mit Knicken); die Rundenüberschrift nennt die Einstellungen.
- Punkte nach Platz je Runde: Von n Entwürfen, die halten, bekommt der leichteste n Punkte, der schwerste 1; wer versagt, 0. Die Gesamtwertung zählt über alle Runden.
- Server: `npm start` (Port aus `PORT`, Standard 8080). Docker-Deploy: `KNOTENPUNKT_HOST=<ssh-name> scripts/deploy.sh` baut das Image auf dem Server und startet den Container `knotenpunkt` auf 127.0.0.1:8909; bricht ab, wenn gerade eine Runde läuft. nginx bindet ihn über `deploy/nginx-knotenpunkt-location.conf` unter `/knotenpunkt/` ein.

## Lokal starten

```bash
npm run build
python3 -m http.server 8913
```

Dann http://localhost:8913/ öffnen. `npm test` prüft FE-Kern und Bauteile, `node scripts/kalibrieren.js` zeigt je Bauteil die Auslastung des vollen Rasters und das Ergebnis des Algorithmus.

## Wie gerechnet wird

Raster 1 m, Stäbe aus Quadratrohr nach EN 10219-2 (Eckradien außen 2t, innen t), Stahl S235, $`E = 210\ \text{GPa}`$:

| Profil | A in mm² | I in cm⁴ | W in cm³ | Masse in kg/m |
|---|---|---|---|---|
| 40 × 40 × 3 | 420,8 | 9,32 | 4,66 | 3,30 |
| 60 × 60 × 4 | 854,8 | 43,55 | 14,52 | 6,71 |
| 80 × 80 × 5 | 1435,6 | 131,44 | 32,86 | 11,27 |

Jedes Rasterfeld hat vier Randstäbe und zwei Diagonalen (kreuzend, ohne Knoten in der Mitte).

**Fachwerkstab** (2 Freiheitsgrade je Knoten), Richtungskosinus $`c, s`$:

```math
K_e = \frac{EA}{L}\begin{bmatrix} cc & cs & -cc & -cs \\ cs & ss & -cs & -ss \\ -cc & -cs & cc & cs \\ -cs & -ss & cs & ss \end{bmatrix}, \qquad N = \frac{EA}{L}\left(c\,\Delta u + s\,\Delta v\right)
```

**Rahmenstab** (Euler-Bernoulli, 3 Freiheitsgrade je Knoten), lokal mit $`a = EA/L`$, $`k_1 = 12EI/L^3`$, $`k_2 = 6EI/L^2`$, $`k_3 = 4EI/L`$, $`k_4 = 2EI/L`$, global $`K_e = T^\mathsf{T} K_l\, T`$:

```math
K_l = \begin{bmatrix} a & 0 & 0 & -a & 0 & 0 \\ 0 & k_1 & k_2 & 0 & -k_1 & k_2 \\ 0 & k_2 & k_3 & 0 & -k_2 & k_4 \\ -a & 0 & 0 & a & 0 & 0 \\ 0 & -k_1 & -k_2 & 0 & k_1 & -k_2 \\ 0 & k_2 & k_4 & 0 & -k_2 & k_3 \end{bmatrix}
```

Lösung mit Band-Cholesky, Knoten entlang der kurzen Seite nummeriert.

**Beweglich oder nicht:** An jedem freien Freiheitsgrad sitzt eine sehr weiche Feder ($`10^{-11}\,EA/a`$ bzw. $`10^{-11}\,EI/a`$ des kleinsten Profils). Sie hält die Matrix regulär. Geprüft wird zweimal:

1. Regt die Last eine Bewegung an, nehmen die Federn einen spürbaren Teil ihrer Arbeit auf:

```math
\frac{\sum k_s u_i^2}{f^\mathsf{T} u} > 0{,}01
```

2. Unabhängig von der Last (Kinematik): Die Steifigkeitsmatrix ohne Last wird zerlegt; ein Pivot unter $`10^{-8}\,EA/a`$ heißt, es gibt eine Bewegung, die keinen Stab dehnt (im Rahmen auch keinen biegt). Im Fachwerk sind dabei die Durchlaufstellen quer gehalten, ihr Ausweichen deckt das Knicken des Stabzugs ab. Ein Querstab, der selbst nicht gehalten ist, hält nichts: Das Stabwerk ist beweglich.

Gezeigt wird dann die Bewegungsform (inverse Iteration auf der zerlegten Matrix).

**Stabilität des Ganzen:** Halten alle Stäbe für sich, wird die Matrix aus elastischer und geometrischer Steifigkeit zerlegt, mit den Normalkräften der linearen Lösung (Fachwerk: $`N/L`$ quer zum Stab; Rahmen: konsistente geometrische Steifigkeit des kubischen Ansatzes). Ist sie nicht positiv definit, weicht das Tragwerk unter den Druckkräften als Ganzes aus: instabil (etwa Seitwärtsknicken eines Rahmens ohne Diagonale, freie Kragstütze nach Euler-Fall 1, Druckstab an einem Querstab ohne Halt). Der kritische Lastfaktor $`\lambda`$ kommt aus

```math
\left(K + K_{G,\text{Zug}}\right)\varphi = \lambda\left(-K_{G,\text{Druck}}\right)\varphi
```

per inverser Iteration; die Knickform wird gezeigt.

**Nachweis je Stab:** Auslastung ist das Größere aus Fließen und Knicken,

```math
\eta = \max\left(\frac{|N|/A + \max(|M_1|, |M_2|)/W}{235\ \text{MPa}},\ \frac{-N}{\pi^2 EI / L_k^2}\right)
```

mit $`M = 0`$ im Fachwerk und dem Knickterm nur bei Druck. Knicklänge $`L_k`$: der gerade Stabzug bis zum nächsten Knoten, an dem ein Stab quer ansetzt oder ein Lager quer zum Stab hält (Euler-Fall 2); ob dieser Knoten wirklich hält, prüft die Stabilität des Ganzen. Hält, wenn $`\eta \le 1`$ in allen Stäben.

**Durchlaufende Stäbe:** Wo ein Stab ohne Querstab gerade weiterläuft und kein Lager quer hält, ist kein Knoten: Der Stabzug ist ein durchlaufendes Profil, wie ein Gurt, auch im Fachwerk. Gerechnet wird er weiter aus 1-m-Elementen; da dort keine Querkraft angreift, tragen sie nur Normalkraft, und geknickt wird über die ganze Länge. Gezählt wird er als ein Stab (im Schriftfeld, bei der Lösung des Algorithmus, auf den Karten im Wettkampf und bei „N Stäbe fließen“); die FE-Zeile nennt dazu die Zahl der Elemente. In der Zeichnung steht dort kein Gelenk, und im Fachwerk wird die Querverschiebung dieser Stellen fürs Zeichnen linear zwischen den Enden des Stabzugs eingesetzt, auch in der Bewegungsform: Die Stütze des leeren Tors dreht sich als Ganzes um ihr Fußgelenk. Greift dort eine Last quer an, ist das Fachwerk beweglich; dieser Stabzug bleibt in der Bewegungsform geknickt, weil er genau dort nachgibt.

**Nullstäbe:** Ein Stab ist Nullstab, wenn seine Normalkraft null ist (im Rahmen dazu ohne Biegung), nicht schon, wenn sie klein ist. Für die Anzeige gibt die Rechnung den winzigen Lastanteil der weichen Federn in zwei Korrekturschritten ans Tragwerk zurück; danach bleibt nur Rundung (im Fachwerk unter $`10^{-12}`$, im Rahmen unter $`10^{-9}`$ der größten Schnittgröße). Als null gilt, was unter $`10^{-8}`$ der größten Schnittgröße liegt (Normalkraft oder Moment je Rasterlänge). Echte kleine Kräfte beginnen im Fachwerk bei etwa $`10^{-5}`$; im Rahmen entstehen aus der Biegung beliebig kleine Normalkräfte, unter der Grenze zählen sie als null. Ein Rahmenstab ohne Normalkraft, aber mit Biegung, ist kein Nullstab (violett, „nur Biegung“).

**Lose Teile:** Stäbe ohne Verbindung zum Lager fallen ab. Teile, die nur über einen einzigen Knoten am Rest hängen und weder Lager noch Last enthalten, tragen nichts (am einzigen Anschluss kann keine Kraft wirken), dazu zählen lose Enden; ebenso Teile ohne Verbindung zu einer Last. Sie werden nicht gerechnet, zählen aber bei der Masse. Streng nach Technischer Mechanik gehören sie trotzdem zum Tragwerk: Im Fachwerk dreht sich ein solcher Teil um seinen Knoten, das Ganze ist dann verschieblich (geprüft wird die Kinematik deshalb mit allen Stäben, die am Lager hängen). Im Rahmen sind sie steif angeschlossen und stören nicht. Der Gegner lässt solche Teile beim Bemessen weg.

**Abzählkriterium:** Im Schriftfeld steht, was das Abzählen an der Zeichnung ergibt: $`k`$ Knoten (Durchlaufstellen zählen nicht), $`s`$ Stäbe (ein gerader Stabzug ist ein Stab), $`r`$ Lagerreaktionen (Festlager 2, Loslager 1, Einspannung je Knoten 2 im Fachwerk und 3 im Rahmen):

```math
f_\text{Fachwerk} = 2k - s - r, \qquad f_\text{Rahmen} = 3k - 3s - r
```

$`f > 0`$ heißt verschieblich, $`f = 0`$ statisch bestimmt, $`f < 0`$ so oft statisch unbestimmt. Das Kriterium ist notwendig, nicht hinreichend: Ist das Tragwerk trotz $`f \le 0`$ verschieblich (Ausnahmefall), findet das die Kinematikprüfung; der Hinweis beim Zeichnen sagt das dann dazu. Beispiel: das Tor als Fachwerk mit einem Untergurt zwischen den beiden Festlagern hat $`2 \cdot 4 - 4 - 4 = 0`$ und schwankt trotzdem. Ein Test prüft an Zufallsentwürfen aller festen Bauteile in beiden Modellen, dass $`f > 0`$ im Spiel immer „beweglich“ ergibt (vorab an 5954 Entwürfen geprüft, auch an Zufallsbauteilen, ohne Abweichung).

**Gegner:** beginnt mit dem vollen Raster im mittleren Profil und bemisst es (fully stressed design: jeder tragende Stab bekommt das kleinste Profil, das mit seinen Schnittgrößen hält; wiederholt, bis sich nichts mehr ändert, weil sich die Kräfte mit den Steifigkeiten umlagern; ist das Ganze instabil, werden die Druckstäbe vergrößert). Dann entfernt er immer den am geringsten ausgelasteten Stab, bemisst neu und behält das Ergebnis, wenn es hält und leichter ist. Was beim Entfernen beweglich wird oder nicht mehr hält, versucht er nicht noch einmal. Weil der Weg vom Start abhängt, rechnet er vier Läufe (eigenes Modell, anderes Modell mit Neubemessung, zwei mit zufällig gestörter Reihenfolge), nimmt den leichtesten und versucht zum Schluss je Stab ein Profil kleiner.

**Lasten:** Brücke 9 × 34 kN, Kragarm 90 kN, Kran 38 kN, so bemessen, dass das volle Raster im mittleren Profil als Fachwerk zu gut 50 % ausgelastet ist. Tor 4,5 kN Wind: Stützen und Riegel allein halten als Rahmen erst im dicksten Profil (89 %, 101 kg); mit einer durchgehenden Diagonale von Ecke zu Ecke (ein Stab über drei Felder) im dünnsten Profil halten sie in beiden Modellen (44 kg).

## Verifikation (`npm test`)

- Kragbalken aus vier Rahmenstäben: Durchbiegung $`FL^3/(3EI)`$ und Einspannmoment $`FL`$; als Fachwerk beweglich
- Zweistab: Stabkräfte aus dem Knotengleichgewicht, Auslastung aus Fließen und Knicken; Zugstab nur Fließen
- Feld ohne Diagonale: als Fachwerk beweglich, als Rahmen tragfähig, Kopfverschiebung zwischen eingespanntem und gelenkigem Riegel
- Abgetrennte Stäbe tragen nicht; Knicklänge über Knoten ohne Querstab, im Rahmen wie im Fachwerk
- Ausgabe: Lagerkräfte des Zweistabs im Gleichgewicht (je Lager $`F/2`$ senkrecht und waagrecht, Fachwerk und Rahmen), Spannung $`|N|/A`$, Knicklast nach Euler; mit Eigengewicht tragen die Lager zusätzlich Masse mal $`g`$
- Nullstäbe: Im Tor mit Diagonale ist die linke Stütze im Fachwerk Nullstab, im Rahmen trägt sie eine kleine Kraft und ist keiner; der Kragbalken im Rahmen hat keine Normalkraft, trägt aber auf Biegung (kein Nullstab)
- Eigengewicht im Fachwerk: Ein gerader Stabzug mit gemischten Profilen gibt sein Gewicht wie ein Einfeldträger an seine Enden ab (Lagerkräfte nach dem Hebelgesetz), die Stabkraft ist im ganzen Zug gleich
- Knicken ausgeschaltet: ein Druckstab, der sonst knickt (40 kN bei 21,5 kN Knicklast), hält, solange er nicht fließt; Knicklast weiter zur Info
- Sprosse zwischen zwei Druckketten ohne Diagonale: im Fachwerk beweglich
- Kragstütze mit freiem Kopf: im Rahmen instabil ab der Knicklast nach Euler-Fall 1 (kritischer Lastfaktor auf 2 % genau), im Fachwerk beweglich
- Bewegungsform im Fachwerk: Stützen des leeren Tors bleiben gerade und drehen sich um das Fußgelenk; Querlast an einer Durchlaufstelle knickt den Zug dort
- Stäbe zählen: Stützen und Riegel des Tors sind drei Stäbe (nicht neun Rasterstäbe), ein Querstab teilt die Stütze, eine durchgehende Diagonale ist ein Stab
- Abzählkriterium: Tor als Fachwerk $`2 \cdot 4 - 3 - 4 = 1`$ (verschieblich), als Rahmen $`3 \cdot 4 - 3 \cdot 3 - 4 = -1`$ (einfach unbestimmt), mit Diagonale statisch bestimmt, ein loser Stab dazu macht das Fachwerk verschieblich (im Spiel ebenso); an Zufallsentwürfen ergibt $`f > 0`$ immer „beweglich“, Ausnahmefälle kommen vor und werden erkannt
- Lose Enden: im Fachwerk verschieblich, im Rahmen ohne Last; loses Dreieck am Mittelknoten eines Druckstabs: im Rahmen Knicken über die ganze Länge, im Fachwerk verschieblich
- Zweigelenkrahmen unter Vertikallast: Seitwärtsknicken, obwohl jeder Stab für sich hält
- Last direkt auf dem Lager ist kein Mechanismus; eine Lagerung, die die Last zufällig nicht anregt, ist trotzdem beweglich
- Profile: Auslastung und Masse je Profil; Bemessen wählt das kleinste Profil, das hält
- Algorithmus: Ergebnis hält in beiden Modellen und ist deutlich leichter als das volle Raster
- Zufallsbauteile: gleiche Nummer, gleiches Bauteil; Nummern 1 bis 150 lösbar (volles Raster hält in beiden Modellen), Auslastung und Beträge im Rahmen
- Baukasten: Code hin und zurück gleich (getrennte Einspannungen bleiben getrennt), Meldungen für leer, zerfallen, ohne Lager, ohne Last, beweglich, Last direkt auf dem Lager, zu große Last

Unabhängig geprüft (05.10.2026, drei getrennte Prüfungen mit eigenen Referenzlösern): Elementmatrizen, Band-Cholesky, Schnittgrößen und Gleichgewicht bis 1e-8, Darstellung der Biegelinie gegen die analytische Lösung; die Befunde dieser Prüfung (Scheinaussteifung, nicht angeregte Mechanismen, Seitwärtsknicken, Querschnittswerte) sind eingearbeitet.

## Was das Spiel vereinfacht

- Linear, elastisch, kleine Verformungen; „Bruch“ heißt: ein Stab erreicht am Rand die Streckgrenze
- Knicken nach Euler ohne Imperfektionen; die Knickkurven nach EN 1993-1-1 sind bis etwa Faktor 1,8 strenger
- Stabilität des Ganzen mit einem Element je Stab: für einzelne Stäbe etwas zu günstig, dort gilt der Euler-Nachweis
- Nur in der Ebene: kein Knicken aus der Ebene, kein Biegedrillknicken; keine Begrenzung der Verformung
- Knoten als Punkte, Lasten nur in Knoten; Eigengewicht (Einstellung) ebenfalls als Knotenlast
