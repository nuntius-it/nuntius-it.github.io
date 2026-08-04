/** Finestra modale riutilizzabile per i form di modifica. */
import { esc } from "./html.js";

export function apriModale(titolo, corpoHtml) {
  const sfondo = document.createElement("div");
  sfondo.className = "modale-sfondo";
  sfondo.innerHTML = `
    <div class="modale" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modale-testata">
        <h3>${esc(titolo)}</h3>
        <button type="button" class="modale-chiudi" aria-label="Chiudi">×</button>
      </div>
      <div class="modale-corpo">${corpoHtml}</div>
    </div>`;
  document.body.appendChild(sfondo);
  const chiudi = () => sfondo.remove();
  sfondo.addEventListener("click", (e) => {
    if (e.target === sfondo) chiudi();
  });
  sfondo.querySelector(".modale-chiudi").addEventListener("click", chiudi);
  sfondo.querySelector("input, select, textarea")?.focus();
  return { el: sfondo, chiudi };
}
