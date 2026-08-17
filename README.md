# Fantabuzzer V4 - configurazione asta 2026/27

Configurazione:
- 10 squadre
- 1000 crediti iniziali
- Prezzo di partenza 1 credito
- Timer predefinito 10 secondi, modificabile dall Admin
- Ogni rilancio fa ripartire il timer
- Rilanci squadra: +1 / +5 / +10 / +50 / +100
- Rosa: 3 P / 8 D / 8 C / 6 A = 25 giocatori
- Il giocatore viene selezionato esclusivamente dall Admin
- Assegnazione automatica alla scadenza del timer
- Se non ci sono offerte il giocatore resta disponibile
- Il sistema conserva almeno 1 credito per ogni posto rosa ancora da riempire
- A rosa completa (25/25) i rilanci sono bloccati
- Budget modificabile dall Admin

## Excel supportato
La versione e adattata al file `Quotazioni_Fantacalcio_Stagione_2026_27.xlsx`.
Vengono letti esclusivamente i fogli:
- Portieri
- Difensori
- Centrocampisti
- Attaccanti

La prima riga e il titolo e la seconda riga contiene le intestazioni.
Vengono utilizzati Id, R, Nome e Squadra.

## Render
Build Command: `npm install`

Start Command: `node server.js`

- Pulsante Cambia squadra per uscire dal profilo salvato sul telefono

## Export CSV asta
- Conserva l'ID originale del giocatore presente nella colonna `Id` del file Fantacalcio.
- L'Admin può scaricare `fanta-asta-rosters.csv`.
- Il formato replica il file campione: riga `$,$,$` prima di ogni squadra, poi `Nome Squadra,Id,Prezzo`.
- Il nome del giocatore non viene inserito nel CSV finale perché il formato campione usa l'ID come riferimento.
