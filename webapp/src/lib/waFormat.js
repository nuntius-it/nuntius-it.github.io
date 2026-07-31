/**
 * Anteprima della formattazione WhatsApp: *grassetto*, _corsivo_, ~barrato~.
 * L'input viene prima escapato, l'output è HTML sicuro.
 */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function waToHtml(testo) {
  let out = escapeHtml(testo);
  // La coppia di marcatori non deve avere spazi subito dentro (regola WhatsApp).
  out = out.replace(/\*([^*\n]+?)\*/g, (m, inner) =>
    /^\s|\s$/.test(inner) ? m : `<strong>${inner}</strong>`
  );
  out = out.replace(/_([^_\n]+?)_/g, (m, inner) =>
    /^\s|\s$/.test(inner) ? m : `<em>${inner}</em>`
  );
  out = out.replace(/~([^~\n]+?)~/g, (m, inner) =>
    /^\s|\s$/.test(inner) ? m : `<s>${inner}</s>`
  );
  return out.replace(/\n/g, "<br>");
}
