
# Fantabuzzer Mobile

Versione mobile-first per asta fantacalcio con rilanci live.

## Come usarla
1. Sul PC installa Node.js.
2. Apri il terminale nella cartella del progetto.
3. Esegui:
   npm install
4. Poi:
   npm start
5. Il PC apre:
   http://localhost:3000

## Collegamento dai telefoni
Tutti devono essere sulla stessa rete Wi-Fi.

Trova l'IP locale del PC, per esempio:
192.168.1.25

Poi ogni partecipante apre dal telefono:
http://192.168.1.25:3000

## Versione mobile
- Pulsanti grandi +1 / +2 / +5
- Layout ottimizzato per smartphone
- Vibrazione al rilancio e all'aggiudicazione
- Nome squadra ricordato sul dispositivo
- Barra dei rilanci sempre raggiungibile
- Installabile come web app dalla schermata Home sui browser compatibili
- Supporto safe-area per iPhone

## Importante
Per l'uso dalla stessa Wi-Fi basta il PC come server.
Per usarla anche da reti diverse o via Internet serve pubblicarla online
(ad esempio su Render, Railway, Fly.io o un VPS).

Nota: il pannello admin non è ancora protetto da password.
