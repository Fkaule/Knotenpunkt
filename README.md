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
- Live beim Zeichnen, einzeln oder zusammen: Verformung (fester Maßstab je Bauteil: das volle Raster im mittleren Profil verschiebt sich um 0,3 % der größten Abmessung, ein weicher Entwurf entsprechend mehr, sanft begrenzt auf 5 %) und Auslastung (Übungsmodus). Dazu eine Probe-Rechnung mit Auslastung.

## Wettkampf

- Läuft über einen eigenen Spielserver (`server.mjs`, Node und ws), der nur den Status aller Geräte verteilt (Presence); gerechnet wird in den Browsern. Auf GitHub Pages gibt es keinen Spielserver, dort ist der Wettkampf gesperrt.
- Die Spielleitung eröffnet einen Raum mit vierstelligem Code (Link mit `#CODE`), wählt Bauteil, Rechenmodell (Fachwerk oder Rahmen) und Zeit (3 bis 10 Minuten) und kann selbst mitspielen.
- Keine Probe-Rechnungen: Verformung und Auslastung sind die ganze Runde live zu sehen. Der Beamer zeigt dabei je Person die Masse des aktuellen Entwurfs, grün, wenn er gerade hält.
- Auflösung: Entwürfe nacheinander aufdecken, der leichteste zuletzt; große Ansicht je Entwurf, umschaltbar zwischen Fachwerk und Rahmen; der Algorithmus als Geisterzeile.
- Punkte nach Platz je Runde: Von n Entwürfen, die halten, bekommt der leichteste n Punkte, der schwerste 1; wer versagt, 0. Die Gesamtwertung zählt über alle Runden.
- Server: `npm start` (Port aus `PORT`, Standard 8080). Docker-Deploy: `KNOTENPUNKT_HOST=<ssh-name> scripts/deploy.sh` baut das Image auf dem Server und startet den Container `knotenpunkt` auf 127.0.0.1:8909; bricht ab, wenn gerade eine Runde läuft. nginx bindet ihn über `deploy/nginx-knotenpunkt-location.conf` unter `/knotenpunkt/` ein.

## Lokal starten

```bash
npm run build
python3 -m http.server 8913
```

Dann http://localhost:8913/ öffnen. `npm test` prüft den FE-Kern, `node scripts/kalibrieren.js` zeigt je Bauteil die Auslastung des vollen Rasters und das Ergebnis des Algorithmus.

## Wie gerechnet wird

Raster 1 m, Stäbe aus Quadratrohr, Stahl S235, $`E = 210\ \text{GPa}`$ (scharfkantig gerechnet):

| Profil | A in mm² | I in cm⁴ | W in cm³ | Masse in kg/m |
|---|---|---|---|---|
| 40 × 40 × 3 | 444 | 10,2 | 5,1 | 3,5 |
| 60 × 60 × 4 | 896 | 47,1 | 15,7 | 7,0 |
| 80 × 80 × 5 | 1500 | 141,3 | 35,3 | 11,8 |

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

**Beweglich oder nicht:** An jedem freien Freiheitsgrad sitzt eine sehr weiche Feder ($`10^{-11}\,EA/a`$ bzw. $`10^{-11}\,EI/a`$ des kleinsten Profils). Sie hält die Matrix regulär. Nehmen die Federn mehr als 1 % der Arbeit der Last auf, ist das Stabwerk ein Mechanismus:

```math
\frac{\sum k_s u_i^2}{f^\mathsf{T} u} > 0{,}01
```

So stören unbelastete, lose Teile nicht, und ein gerader Stabzug über einen Knoten ohne Querstab ist nur dann beweglich, wenn die Last quer dazu angreift.

**Nachweis je Stab:** Auslastung ist das Größere aus Fließen und Knicken,

```math
\eta = \max\left(\frac{|N|/A + \max(|M_1|, |M_2|)/W}{235\ \text{MPa}},\ \frac{-N}{\pi^2 EI / L_k^2}\right)
```

mit $`M = 0`$ im Fachwerk und dem Knickterm nur bei Druck. Knicklänge $`L_k`$: der gerade Stabzug bis zum nächsten Knoten, an dem ein Lager sitzt oder ein Stab quer ansetzt (Euler-Fall 2). Hält, wenn $`\eta \le 1`$ in allen Stäben.

**Lose Teile:** Stäbe ohne Verbindung zum Lager fallen ab. Lose Enden (Knoten ohne Lager, Last und weiteren Stab) und Teile ohne Last tragen nichts und werden nicht gerechnet, zählen aber bei der Masse.

**Gegner:** beginnt mit dem vollen Raster im mittleren Profil und bemisst es (fully stressed design: jeder tragende Stab bekommt das kleinste Profil, das mit seinen Schnittgrößen hält; wiederholt, bis sich nichts mehr ändert, weil sich die Kräfte mit den Steifigkeiten umlagern). Dann entfernt er immer den am geringsten ausgelasteten Stab, bemisst neu und behält das Ergebnis, wenn es hält und leichter ist. Was beim Entfernen beweglich wird oder nicht mehr hält, versucht er nicht noch einmal.

**Lasten:** Brücke 9 × 34 kN, Kragarm 90 kN, Kran 38 kN, so bemessen, dass das volle Raster im mittleren Profil als Fachwerk zu gut 50 % ausgelastet ist. Tor 5 kN Wind: Stützen und Riegel allein halten als Rahmen erst im dicksten Profil (106 kg), mit einer Diagonale schon im dünnsten (46 kg).

## Verifikation (`npm test`)

- Kragbalken aus vier Rahmenstäben: Durchbiegung $`FL^3/(3EI)`$ und Einspannmoment $`FL`$; als Fachwerk beweglich
- Zweistab: Stabkräfte aus dem Knotengleichgewicht, Auslastung aus Fließen und Knicken; Zugstab nur Fließen
- Feld ohne Diagonale: als Fachwerk beweglich, als Rahmen tragfähig, Kopfverschiebung zwischen eingespanntem und gelenkigem Riegel
- Lose Enden und abgetrennte Stäbe tragen nicht; Knicklänge über Knoten ohne Querstab
- Profile: Auslastung und Masse je Profil; Bemessen wählt das kleinste Profil, das hält
- Algorithmus: Ergebnis hält in beiden Modellen und ist deutlich leichter als das volle Raster

## Was das Spiel vereinfacht

- Linear, elastisch, kleine Verformungen; „Bruch“ heißt: ein Stab erreicht am Rand die Streckgrenze
- Knicken nur je Stabzug nach Euler, ohne Imperfektionen und ohne Knicken des ganzen Rahmens; im Rahmen auf der sicheren Seite
- Knoten als Punkte, Lasten nur in Knoten, kein Eigengewicht
