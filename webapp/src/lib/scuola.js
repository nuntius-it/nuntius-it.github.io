/**
 * Stima della classe scolastica dall'anno di nascita.
 * È un'euristica (anticipi/ripetenze non sono considerati): serve per i filtri
 * tipo "dalla 5ª elementare in su", non come dato anagrafico.
 */

const CLASSI = [
  "1ª elementare", "2ª elementare", "3ª elementare", "4ª elementare", "5ª elementare",
  "1ª media", "2ª media", "3ª media",
  "1ª superiore", "2ª superiore", "3ª superiore", "4ª superiore", "5ª superiore",
];

/** Anno di inizio dell'anno scolastico corrente (settembre–agosto). */
export function annoScolasticoCorrente(oggi = new Date()) {
  const anno = oggi.getFullYear();
  return oggi.getMonth() + 1 >= 9 ? anno : anno - 1;
}

/**
 * Indice di classe 1..13 (1 = 1ª elementare) per un nato in `annoNascita`
 * nell'anno scolastico che inizia in `annoInizio`. Null se fuori range.
 */
export function indiceClasse(annoNascita, annoInizio) {
  if (!annoNascita || !annoInizio) return null;
  const idx = annoInizio - annoNascita - 5;
  return idx >= 1 && idx <= 13 ? idx : null;
}

/** Etichetta della classe, es. "3ª media"; null se fuori range scolastico. */
export function classeLabel(annoNascita, annoInizio = annoScolasticoCorrente()) {
  const idx = indiceClasse(annoNascita, annoInizio);
  return idx ? CLASSI[idx - 1] : null;
}

export { CLASSI };
