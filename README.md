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

## V6.1
- Timer dashboard sincronizzato con il timer reale dell'asta
- Nuova asta: azzera rose/acquisti/spese e riporta le squadre a 1000 crediti
- Elenco completo giocatori acquistati e prezzo sotto ogni squadra

## V6.2
- Countdown dashboard corretto: legge esclusivamente endsAt e duration dal server
- Durata predefinita fissata a 10 secondi in server e pannello Admin

## V6.3
- Timer sincronizzato con l'orologio del server
- Elimina differenze dovute all'ora locale di PC e telefoni
- Dashboard e squadre calcolano il countdown sulla stessa base temporale

## V6.4
- Countdown calcolato esclusivamente dal server e trasmesso identico a dashboard e telefoni ogni 100 ms.
- Eliminata ogni dipendenza dall’orologio locale dei dispositivi.

## V6.5
- Nuova dashboard PC/TV stile regia
- Asta centrale con giocatore, timer, prezzo e squadra in testa
- Griglia 5x2 delle 10 squadre
- Rosa completa e prezzo sotto ogni squadra
- Pannello comandi laterale richiudibile
- Logica asta/timer V6.4 invariata

## V6.7
- Riquadro principale Giocatore in asta centrato orizzontalmente nella dashboard
- Nessuna modifica alla logica di timer, rilanci o assegnazione

## V6.8
- Restyling completo pagina squadra mobile
- Tema Blue Arena coerente con dashboard TV
- Scheda squadra, ruoli, budget e rosa più leggibili
- Giocatore in asta più centrale
- Pulsanti rilancio +1/+5/+10/+50/+100 ridisegnati
- Logica asta invariata

## V6.9
- Avatar dinamico con iniziali e colore per ruolo
- Animazione ingresso giocatore
- Effetto visivo ad ogni rilancio
- Ultimi 3 secondi evidenziati
- Overlay AGGIUDICATO su dashboard e telefono
- Max rilancio visibile nella pagina squadra
- Rosa squadra migliorata con ruolo, prezzo e spesa per ruolo
- Squadra in testa più evidente
- Nuovo comando Admin per riaprire l'ultimo giocatore
- Logica timer/rilanci della V6.8 mantenuta

## V6.9.1
- Corretto esclusivamente il rendering del countdown nella dashboard TV
- Nessuna modifica alla logica server, ai rilanci o alla sincronizzazione del timer
