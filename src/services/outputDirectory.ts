import { selectOutputDir } from "./desktopApi";
import { readTextStorage, STORAGE_KEYS, writeTextStorage } from "../utils/localStorage";

export function getStoredOutputDir() {
  return readTextStorage(STORAGE_KEYS.outputDir);
}

export function persistOutputDir(outputDir: string) {
  writeTextStorage(STORAGE_KEYS.outputDir, outputDir);
  return outputDir;
}

export async function pickOutputDir() {
  const pickedFolder = await selectOutputDir();
  if (!pickedFolder) {
    return null;
  }

  persistOutputDir(pickedFolder);
  return pickedFolder;
}
