# Nuntius

Annunci alle comunità parrocchiali, senza copia-incolla.

Nuntius aiuta le parrocchie a inviare avvisi WhatsApp ai gruppi (catechismo, attività,
eventi) partendo dagli elenchi del gestionale parrocchiale: si importa l'elenco, si
scelgono i destinatari, si scrive il messaggio una volta sola.

## Struttura del progetto

| Cartella | Contenuto |
|----------|-----------|
| `webapp/` | Web app (GitHub Pages): elenchi, gruppi, liste, campagne |
| `sender/` | App desktop di invio (Windows/Mac) — in arrivo |
| `supabase/` | Schema del database e note di configurazione |

## Sviluppo

```bash
cd webapp
npm install
npm test        # test unitari (vitest)
npm run dev     # server di sviluppo
npm run build   # build di produzione (dist/)
```

Copia `webapp/.env.example` in `webapp/.env` e inserisci URL e anon key del progetto
Supabase per abilitare il login in locale.

## Riservatezza dei dati

Questo repository non deve mai contenere dati personali reali (anagrafiche, numeri di
telefono, export dei gestionali): i test usano esclusivamente dati fittizi.
