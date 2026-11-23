import { APP_TITLE } from "../config.js";
import { detectPlatform, helpSteps, isInstalledApp } from "../permissions.js";
import { installer } from "../pwa.js";
import { showInfo } from "./messagebox.js";

export const canOfferInstall = () => !isInstalledApp();

export async function installApp() {
  if (isInstalledApp()) {
    await showInfo("La aplicación ya está instalada en este dispositivo.", APP_TITLE);
    return "already";
  }
  if (installer.canInstall) {
    const accepted = await installer.prompt();
    return accepted ? "installed" : "dismissed";
  }
  const steps = helpSteps("install", detectPlatform()).map((step, index) => `${index + 1}. ${step}`).join("\n");
  await showInfo(`Para instalar la aplicación en este dispositivo:\n\n${steps}`, APP_TITLE);
  return "manual";
}
