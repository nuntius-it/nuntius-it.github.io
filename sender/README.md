# Nuntius Sender

App desktop (Windows/Mac) che invia gli annunci WhatsApp preparati con la web app
Nuntius. Flusso guidato in 3 passi: accesso parrocchia → collegamento WhatsApp con
QR (solo la prima volta) → invio degli annunci "pronti" con un click.

L'invio usa whatsapp-web.js (delay casuali 6–12 s tra i messaggi); gli esiti
(inviato / non su WhatsApp / errore) vengono scritti su Supabase e sono visibili
nella web app.

## Sviluppo

```bash
cd sender
npm install
npm start
```

## Pacchetti d'installazione

Le release si creano con un tag `v*` (workflow `release.yml`): produce `.dmg` (Mac)
e installer NSIS (Windows) e li pubblica nelle GitHub Releases, da cui
`electron-updater` scarica gli aggiornamenti automatici.

Nota: i pacchetti non sono firmati — al primo avvio macOS chiede
tasto destro → "Apri", Windows "Ulteriori informazioni → Esegui comunque"
(documentato nella guida utente).
