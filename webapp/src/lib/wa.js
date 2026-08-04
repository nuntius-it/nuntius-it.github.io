/**
 * Stato del collegamento WhatsApp, condiviso tra le viste. I listener IPC
 * vanno registrati una volta sola (qui, all'import del modulo): le viste si
 * agganciano con osservaWa/osservaLog/osservaProgresso, uno slot ciascuno —
 * nell'hash router è attiva una vista alla volta, chi arriva sovrascrive.
 */

export const statoWa = {
  pronto: false,
  qr: null,      // dataUrl del QR quando WhatsApp chiede la scansione
  sync: null,    // { percent } durante il caricamento dopo il collegamento
  log: [],
  avviato: false,
};

let suAggiorna = () => {};
let suLog = () => {};
let suProgresso = () => {};

export function osservaWa(fn) { suAggiorna = fn ?? (() => {}); }
export function osservaLog(fn) { suLog = fn ?? (() => {}); }
export function osservaProgresso(fn) { suProgresso = fn ?? (() => {}); }

/** Aggancia WhatsApp (idempotente: il main process ignora le chiamate ripetute). */
export function avviaWa() {
  if (!window.nuntius || statoWa.avviato) return;
  statoWa.avviato = true;
  window.nuntius.waAvvia();
}

if (window.nuntius) {
  window.nuntius.statoIniziale().then((s) => {
    statoWa.pronto = s.waPronto;
    suAggiorna();
  });
  window.nuntius.onQr((dataUrl) => {
    statoWa.qr = dataUrl;
    statoWa.sync = null;
    suAggiorna();
  });
  window.nuntius.onAutenticato(() => {
    statoWa.qr = null;
    statoWa.sync = { percent: null };
    suAggiorna();
  });
  window.nuntius.onCaricamento(({ percent }) => {
    statoWa.qr = null;
    statoWa.sync = { percent };
    suAggiorna();
  });
  window.nuntius.onWaPronto((pronto) => {
    statoWa.pronto = pronto;
    statoWa.qr = null;
    statoWa.sync = null;
    // Disconnesso (es. scollegato dal telefono): riparte, mostrando un nuovo QR se serve.
    if (!pronto && statoWa.avviato) window.nuntius.waAvvia();
    suAggiorna();
  });
  window.nuntius.onLog((msg) => {
    statoWa.log.push(msg);
    if (statoWa.log.length > 300) statoWa.log.splice(0, statoWa.log.length - 300);
    suLog(msg);
  });
  window.nuntius.onProgresso((p) => suProgresso(p));
}
