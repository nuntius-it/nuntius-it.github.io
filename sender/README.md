# Nuntius Sender (Fase 3)

App desktop (Windows/Mac) per l'invio effettivo dei messaggi WhatsApp.

Arriverà nella Fase 3 del piano di lavoro, riusando la logica già collaudata del
progetto `whatsapp_bulk_sender` (whatsapp-web.js, autenticazione con QR, delay
casuali tra gli invii), con queste differenze:

- le campagne arrivano da Supabase (stesso account della web app), non da `config.json`;
- gli esiti degli invii vengono scritti su Supabase (tabella `invii`);
- pacchettizzata con Electron: installer doppio click e wizard guidato al primo avvio.
