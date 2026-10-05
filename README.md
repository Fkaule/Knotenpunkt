# Knotenpunkt

Stabwerk-Minispiel, abgeleitet von [Knackpunkt](https://github.com/Fkaule/Knackpunkt): Statt Kacheln aus einem Blech nehmen Sie Stäbe aus einem Raster (oder bauen nach „Alles leeren“ selbst, wie im Bridge Builder). Eine FE-Rechnung im Browser zeigt, ob das Tragwerk hält. Gewertet wird die eingesparte Masse, wenn es hält, sonst null.

Dasselbe Stabwerk lässt sich auf zwei Arten rechnen, im Ergebnis schalten Sie zwischen beiden um:

- **Fachwerk:** Knoten sind Gelenke, Stäbe tragen nur Normalkraft. Ohne Dreiecke ist es beweglich.
- **Rahmen:** Knoten sind biegesteif, Stäbe sind Balken. Felder ohne Diagonale tragen über Biegung, aber weich; in Fachwerken zeigt diese Ansicht die Nebenspannungen.

## Starten

```bash
npm run build
python3 -m http.server 8913
```

Dann http://localhost:8913/ öffnen. `npm test` prüft den FE-Kern, `node scripts/kalibrieren.js` zeigt Auslastung des vollen Stabwerks und Ergebnis des Algorithmus je Bauteil.

## Wie gerechnet wird

Raster 1 m, alle Stäbe Quadratrohr 40 × 40 × 3 aus S235 (scharfkantig): $`A = 444\ \text{mm}^2`$, $`I = 10{,}2\ \text{cm}^4`$, $`W = 5{,}1\ \text{cm}^3`$, $`E = 210\ \text{GPa}`$. Jedes Rasterfeld hat vier Randstäbe und zwei Diagonalen (kreuzend, ohne Knoten in der Mitte).

**Fachwerkstab** (2 Freiheitsgrade je Knoten), Richtungskosinus $`c, s`$:

```math
K_e = \frac{EA}{L}\begin{bmatrix} cc & cs & -cc & -cs \\ cs & ss & -cs & -ss \\ -cc & -cs & cc & cs \\ -cs & -ss & cs & ss \end{bmatrix}, \qquad N = \frac{EA}{L}\left(c\,\Delta u + s\,\Delta v\right)
```

**Rahmenstab** (Euler-Bernoulli, 3 Freiheitsgrade je Knoten), lokal mit $`a = EA/L`$, $`k_1 = 12EI/L^3`$, $`k_2 = 6EI/L^2`$, $`k_3 = 4EI/L`$, $`k_4 = 2EI/L`$, global $`K_e = T^\mathsf{T} K_l\, T`$:

```math
K_l = \begin{bmatrix} a & 0 & 0 & -a & 0 & 0 \\ 0 & k_1 & k_2 & 0 & -k_1 & k_2 \\ 0 & k_2 & k_3 & 0 & -k_2 & k_4 \\ -a & 0 & 0 & a & 0 & 0 \\ 0 & -k_1 & -k_2 & 0 & k_1 & -k_2 \\ 0 & k_2 & k_4 & 0 & -k_2 & k_3 \end{bmatrix}
```

Lösung mit Band-Cholesky, Knoten entlang der kurzen Seite nummeriert.

**Beweglich oder nicht:** An jedem freien Freiheitsgrad sitzt eine sehr weiche Feder ($`10^{-11}\,EA/a`$ bzw. $`10^{-11}\,EI/a`$). Sie hält die Matrix regulär. Nehmen die Federn mehr als 1 % der Arbeit der Last auf, ist das Stabwerk ein Mechanismus:

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

**Gegner (ESO):** entfernt immer den am geringsten ausgelasteten Stab, der sich entfernen lässt, solange das Tragwerk hält; Stäbe, die nichts tragen, zuerst.

**Lasten:** so bemessen, dass das volle Stabwerk als Fachwerk zu gut 50 % ausgelastet ist (Brücke 9 × 17 kN, Kragarm 45 kN, Kran 19 kN).

## Verifikation (`npm test`)

- Kragbalken aus vier Rahmenstäben: Durchbiegung $`FL^3/(3EI)`$ und Einspannmoment $`FL`$; als Fachwerk beweglich
- Zweistab: Stabkräfte aus dem Knotengleichgewicht, Auslastung aus Fließen und Knicken; Zugstab nur Fließen
- Feld ohne Diagonale: als Fachwerk beweglich, als Rahmen tragfähig, Kopfverschiebung zwischen eingespanntem und gelenkigem Riegel
- Lose Enden und abgetrennte Stäbe tragen nicht; Knicklänge über Knoten ohne Querstab
- Algorithmus: Ergebnis hält in beiden Modellen

## Was das Spiel vereinfacht

- Linear, elastisch, kleine Verformungen; „Bruch“ heißt: ein Stab erreicht am Rand die Streckgrenze
- Knicken nur je Stabzug nach Euler, ohne Imperfektionen und ohne Knicken des ganzen Rahmens; im Rahmen auf der sicheren Seite
- Knoten als Punkte, Lasten nur in Knoten, kein Eigengewicht
