// Firma ad-hoc del bundle macOS quando non c'è un certificato Developer ID.
// Senza alcuna firma valida del bundle, Gatekeeper mostra "app danneggiata"
// senza alternativa; con la firma ad-hoc resta il percorso documentato
// Impostazioni → Privacy e Sicurezza → "Apri comunque".
const { execSync } = require("node:child_process");

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK) return; // certificato vero presente: firma già di electron-builder
  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: "inherit" });
};
