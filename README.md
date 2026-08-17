
# Fantabuzzer V3

Funzioni:
- Admin senza password
- Import Excel giocatori
- Rilanci da telefono +1 / +5 / +10 / +50 / +100
- Timer che riparte a ogni rilancio
- Assegnazione automatica allo zero
- Budget residuo aggiornato automaticamente
- Modifica budget dall'Admin
- Limiti rosa:
  - P: 3
  - D: 8
  - C: 8
  - A: 6
- Blocco rilanci se il ruolo è già pieno
- Blocco rilanci oltre il budget disponibile
- Rosa personale per ogni squadra
- Tutte le rose visibili all'Admin
- Annulla ultimo acquisto

## Excel
Intestazioni riconosciute:
- Nome / Giocatore / Calciatore
- Squadra / Club
- Ruolo
- Quotazione

I ruoli possono essere:
P / POR / Portiere
D / DIF / Difensore
C / CEN / Centrocampista
A / ATT / Attaccante

## Render
Build Command:
npm install

Start Command:
node server.js
