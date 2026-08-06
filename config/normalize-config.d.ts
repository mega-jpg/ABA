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
export declare function isNestedConfig(raw: unknown): boolean;
/** Chuẩn hóa config.json (nested hoặc flat) → flat keys mà code hiện tại đọc. */
export declare function normalizeConfig(raw: unknown): NormalizedTelegramConfig;
export declare function readSessionCaOverrideFromRaw(raw: unknown): number;
export declare function writeSessionCaOverrideToRaw(raw: unknown, value: number): unknown;
export declare function getAoGroupIdsFromRaw(raw: unknown): string[];
