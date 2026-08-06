import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeConfig,
  isNestedConfig,
  readSessionCaOverrideFromRaw,
  writeSessionCaOverrideToRaw,
  type NormalizedTelegramConfig,
} from './normalize-config';

const configPath = process.env.CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.CONFIG_PATH)
  : path.join(process.cwd(), 'config.json');
const rawConfigData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const telegramConfig: NormalizedTelegramConfig = normalizeConfig(rawConfigData);

/** `chi_gui_nhom_ao: true` → bỏ qua mọi gửi tin / thao tác nhóm thật. */
export function isChiGuiNhomAo(): boolean {
  return Boolean(
    (telegramConfig as Record<string, unknown>).chi_gui_nhom_ao,
  );
}

export function getConfigPath(): string {
  return configPath;
}

export function reloadTelegramConfig(): void {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const flat = normalizeConfig(raw);
  for (const key of Object.keys(telegramConfig)) {
    delete (telegramConfig as Record<string, unknown>)[key];
  }
  Object.assign(telegramConfig, flat);
}

export function readRawConfigFile(): unknown {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function writeRawConfigFile(raw: unknown): void {
  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
}

export function readSessionCaOverrideFromConfigFile(): number {
  return readSessionCaOverrideFromRaw(readRawConfigFile());
}

export function setSessionCaOverrideInConfigFile(value: number): void {
  const raw = readRawConfigFile();
  const updated = writeSessionCaOverrideToRaw(raw, value);
  writeRawConfigFile(updated);
  (telegramConfig as Record<string, unknown>).session_ca_override = value;
}

export { telegramConfig, isNestedConfig, normalizeConfig };
