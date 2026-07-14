import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.STORE_DIR || __dirname;
const SETTINGS_PATH = () => path.join(DIR, "settings.json");
const POSITIONS_PATH = () => path.join(DIR, "positions.json");

const DEFAULT_SETTINGS = {
  amountPresets: [0.5, 1, 2],
  rangePresets: [
    { down: 5, up: 3 },
    { down: 10, up: 3 },
    { down: 20, up: 3 },
  ],
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadSettings() {
  const s = readJson(SETTINGS_PATH(), null);
  if (!s) {
    writeJsonAtomic(SETTINGS_PATH(), DEFAULT_SETTINGS);
    return structuredClone(DEFAULT_SETTINGS);
  }
  return { ...structuredClone(DEFAULT_SETTINGS), ...s };
}

export function saveSettings(settings) {
  writeJsonAtomic(SETTINGS_PATH(), settings);
}

export function loadPositions() {
  return readJson(POSITIONS_PATH(), { positions: [] }).positions;
}

function savePositions(positions) {
  writeJsonAtomic(POSITIONS_PATH(), { positions });
}

export function addPosition(p) {
  const positions = loadPositions();
  positions.push(p);
  savePositions(positions);
}

export function removePosition(positionAddress) {
  savePositions(loadPositions().filter((p) => p.position !== positionAddress));
}

export function setAlerted(positionAddress, alerted) {
  const positions = loadPositions();
  const found = positions.find((p) => p.position === positionAddress);
  if (found) {
    found.alerted = alerted;
    savePositions(positions);
  }
}
