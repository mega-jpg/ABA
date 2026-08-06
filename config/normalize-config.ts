type RawConfig = Record<string, unknown>;

export type TongKetDisplayMode = 'percent' | 'bet';

export interface GameBetConfig {
  betAmount: number;
  bankerOdds: number;
  playerOdds: number;
}

export interface NormalizedTelegramConfig {
  port?: number;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  password: string;
  sessionString: string;
  min_message_gap_seconds?: number;
  min_message_gap_seconds_trong_ca_ao?: number;
  delay_giua_du_doan_va_ket_qua_ao?: number;
  gui_lenh_group_ao?: boolean;
  chi_gui_nhom_ao?: boolean;
  gui_tin_nhan_vao_group_that?: string | string[];
  so_tay_group_that?: number[];
  gui_tin_nhan_vao_group_ao?: string | string[];
  so_tay_group_ao?: number[];
  so_ca?: number;
  session_ca_override?: number;
  tong_ket_amount_text?: string;
  tong_ket_media_path?: string;
  dang_ky_link?: string;
  tong_ket_link_nhom_nhan_ban?: string;
  tong_ket_link_tai_day?: string;
  /** Cách hiển thị lãi trên tin tổng kết — không ảnh hưởng tính lãi tay/ca. */
  tong_ket_display_ao?: TongKetDisplayMode;
  tong_ket_display_that?: TongKetDisplayMode;
  tong_ket_percent_per_hand?: number;
  ty_le_thang_ao?: number;
  google_sheet_id?: string;
  google_service_account_path?: string;
  google_sheet_tab_that?: string;
  google_sheet_tab_ao?: string;
  google_sheet_first_data_row?: number;
  url_site: string;
  username_site: string;
  password_site: string;
  gameBetConfig?: GameBetConfig;
  gameBetConfigAo?: GameBetConfig;
  captionBaoBan?: string[];
  link_forward_tin_nhan_len_ca?: string[];
  link_forward_tin_nhan_lich_ca?: string;
  [key: string]: unknown;
}

const FORWARD_LINK_TYPES: Record<string, string> = {
  tin_nhan_lich_ca: 'link_forward_tin_nhan_lich_ca',
  tin_nhan_bat_dau: 'link_forward_tin_nhan_bat_dau',
  tin_nhan_len_ca: 'link_forward_tin_nhan_len_ca',
  tin_nhan_vao_sanh: 'link_forward_tin_nhan_vao_sanh',
  tin_nhan_cho_lenh: 'link_forward_tin_nhan_cho_lenh',
  tin_nhan_ket_thuc_ca: 'link_forward_tin_nhan_ket_thuc_ca',
  tin_nhan_ket_thuc_ca_ao: 'link_forward_tin_nhan_ket_thuc_ca_ao',
  tin_nhan_ket_thuc_ca_2: 'link_forward_tin_nhan_ket_thuc_ca_2',
  tin_nhan_ket_thuc_ca_2_ao: 'link_forward_tin_nhan_ket_thuc_ca_2_ao',
  tin_nhan_bao_ban: 'link_forward_tin_nhan_bao_ban',
  tin_nhan_tong_ket: 'link_forward_tin_nhan_tong_ket',
  lenh_ket_thuc_win: 'link_forward_lenh_ket_thuc_win',
  lenh_ket_thuc_win_2: 'link_forward_lenh_ket_thuc_win_2',
  lenh_ket_thuc_win_3: 'link_forward_lenh_ket_thuc_win_3',
  lenh_ket_thuc_lose: 'link_forward_lenh_ket_thuc_lose',
  lenh_ket_thuc_lose_2: 'link_forward_lenh_ket_thuc_lose_2',
  lenh_ket_thuc_lose_3: 'link_forward_lenh_ket_thuc_lose_3',
  lenh_ket_thuc_draw: 'link_forward_lenh_ket_thuc_draw',
  lenh_ket_thuc_draw_2: 'link_forward_lenh_ket_thuc_draw_2',
  du_doan_cai: 'link_forward_du_doan_cai',
  du_doan_con: 'link_forward_du_doan_con',
  tin_nhan_phu: 'link_forward_tin_nhan_phu',
};

const FORWARD_SUFFIX_KEYS = [
  'default',
  'that',
  'that_1',
  'that_2',
  'ao',
  'ao_1',
  'ao_2',
] as const;

function asRecord(v: unknown): RawConfig {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as RawConfig)
    : {};
}

function pick<T>(...values: T[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function isNestedConfig(raw: unknown): boolean {
  const cfg = asRecord(raw);
  return Boolean(cfg.telegram || cfg.groups || cfg.forwardLinks);
}

function expandForwardLinks(forwardLinks: unknown): RawConfig {
  const out: RawConfig = {};
  const links = asRecord(forwardLinks);

  for (const [newKey, baseKey] of Object.entries(FORWARD_LINK_TYPES)) {
    const entry = links[newKey];
    if (entry === undefined) continue;

    if (Array.isArray(entry)) {
      out[baseKey] = entry;
      continue;
    }

    const obj = asRecord(entry);
    if (Object.keys(obj).length === 0) continue;

    for (const suffix of FORWARD_SUFFIX_KEYS) {
      if (!(suffix in obj)) continue;
      const flatKey =
        suffix === 'default' ? baseKey : `${baseKey}_${suffix}`;
      out[flatKey] = obj[suffix];
    }
  }

  return out;
}

/** Chuẩn hóa config.json (nested hoặc flat) → flat keys mà code hiện tại đọc. */
export function normalizeConfig(raw: unknown): NormalizedTelegramConfig {
  if (!isNestedConfig(raw)) {
    return asRecord(raw) as NormalizedTelegramConfig;
  }

  const cfg = asRecord(raw);
  const telegram = asRecord(cfg.telegram);
  const messaging = asRecord(cfg.messaging);
  const groups = asRecord(cfg.groups);
  const that = asRecord(groups.that);
  const ao = asRecord(groups.ao);
  const session = asRecord(cfg.session);
  const tongKetDisplay = asRecord(session.tongKetDisplay);
  const aoSimulation = asRecord(cfg.aoSimulation);
  const googleSheets = asRecord(cfg.googleSheets);
  const site = asRecord(cfg.site);
  const gameBet = asRecord(cfg.gameBet);
  const app = asRecord(cfg.app);

  const flat: RawConfig = {
    port: pick(app.port, cfg.port),
    apiId: pick(telegram.apiId, cfg.apiId),
    apiHash: pick(telegram.apiHash, cfg.apiHash),
    phoneNumber: pick(telegram.phoneNumber, cfg.phoneNumber),
    password: pick(telegram.password, cfg.password),
    sessionString: pick(telegram.sessionString, cfg.sessionString),
    min_message_gap_seconds: pick(
      messaging.min_message_gap_seconds,
      cfg.min_message_gap_seconds,
    ),
    min_message_gap_seconds_trong_ca_ao: pick(
      messaging.min_message_gap_seconds_trong_ca_ao,
      cfg.min_message_gap_seconds_trong_ca_ao,
    ),
    delay_giua_du_doan_va_ket_qua_ao: pick(
      messaging.delay_giua_du_doan_va_ket_qua_ao,
      cfg.delay_giua_du_doan_va_ket_qua_ao,
    ),
    gui_lenh_group_ao: pick(groups.gui_lenh_group_ao, cfg.gui_lenh_group_ao),
    chi_gui_nhom_ao: pick(groups.chi_gui_nhom_ao, cfg.chi_gui_nhom_ao),
    gui_tin_nhan_vao_group_that: pick(
      that.ids,
      cfg.gui_tin_nhan_vao_group_that,
    ),
    so_tay_group_that: pick(that.so_tay, cfg.so_tay_group_that),
    gui_tin_nhan_vao_group_ao: pick(ao.ids, cfg.gui_tin_nhan_vao_group_ao),
    so_tay_group_ao: pick(ao.so_tay, cfg.so_tay_group_ao),
    so_ca: pick(session.so_ca, cfg.so_ca),
    session_ca_override: pick(
      session.session_ca_override,
      cfg.session_ca_override,
    ),
    tong_ket_amount_text: pick(
      session.tong_ket_amount_text,
      cfg.tong_ket_amount_text,
    ),
    tong_ket_media_path: pick(
      session.tong_ket_media_path,
      cfg.tong_ket_media_path,
    ),
    dang_ky_link: pick(session.dang_ky_link, cfg.dang_ky_link),
    tong_ket_link_nhom_nhan_ban: pick(
      session.tong_ket_link_nhom_nhan_ban,
      cfg.tong_ket_link_nhom_nhan_ban,
    ),
    tong_ket_link_tai_day: pick(
      session.tong_ket_link_tai_day,
      cfg.tong_ket_link_tai_day,
    ),
    tong_ket_display_ao: pick(
      tongKetDisplay.ao,
      session.tong_ket_display_ao,
      cfg.tong_ket_display_ao,
    ),
    tong_ket_display_that: pick(
      tongKetDisplay.that,
      session.tong_ket_display_that,
      cfg.tong_ket_display_that,
    ),
    tong_ket_percent_per_hand: pick(
      tongKetDisplay.percentPerHand,
      session.tong_ket_percent_per_hand,
      cfg.tong_ket_percent_per_hand,
    ),
    ty_le_thang_ao: pick(aoSimulation.ty_le_thang_ao, cfg.ty_le_thang_ao),
    google_sheet_id: pick(googleSheets.id, cfg.google_sheet_id),
    google_service_account_path: pick(
      googleSheets.serviceAccountPath,
      cfg.google_service_account_path,
    ),
    google_sheet_tab_that: pick(
      googleSheets.tabThat,
      cfg.google_sheet_tab_that,
    ),
    google_sheet_tab_ao: pick(googleSheets.tabAo, cfg.google_sheet_tab_ao),
    google_sheet_first_data_row: pick(
      googleSheets.firstDataRow,
      cfg.google_sheet_first_data_row,
    ),
    url_site: pick(site.url, cfg.url_site),
    username_site: pick(site.username, cfg.username_site),
    password_site: pick(site.password, cfg.password_site),
    gameBetConfig: pick(gameBet.that, cfg.gameBetConfig),
    gameBetConfigAo: pick(gameBet.ao, cfg.gameBetConfigAo),
    captionBaoBan: pick(cfg.captionBaoBan),
    ...expandForwardLinks(cfg.forwardLinks),
  };

  for (const [k, v] of Object.entries(cfg)) {
    if (!(k in flat) && k.startsWith('link_forward_')) {
      flat[k] = v;
    }
  }

  return flat as NormalizedTelegramConfig;
}

export function readSessionCaOverrideFromRaw(raw: unknown): number {
  const cfg = asRecord(raw);
  let v: unknown;
  if (isNestedConfig(raw)) {
    v = asRecord(cfg.session).session_ca_override;
  } else {
    v = cfg.session_ca_override;
  }
  const n = typeof v === 'number' ? v : Number(String(v ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function writeSessionCaOverrideToRaw(
  raw: unknown,
  value: number,
): unknown {
  const cloned = JSON.parse(JSON.stringify(raw)) as RawConfig;
  if (isNestedConfig(cloned)) {
    const session = asRecord(cloned.session);
    session.session_ca_override = value;
    cloned.session = session;
  } else {
    cloned.session_ca_override = value;
  }
  return cloned;
}

export function getAoGroupIdsFromRaw(raw: unknown): string[] {
  const flat = normalizeConfig(raw);
  const ao = flat.gui_tin_nhan_vao_group_ao;
  if (Array.isArray(ao)) {
    return ao.map(String).filter(Boolean);
  }
  const single = String(ao ?? '').trim();
  return single ? [single] : [];
}
