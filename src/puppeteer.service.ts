import * as puppeteer from 'puppeteer';
import sharp from 'sharp';
import * as path from 'path';
import { TelegramService } from './telegram/telegram.service';
import { isChiGuiNhomAo, telegramConfig } from '../config/telegram.config';
import * as fs from 'fs';
import { retryWithBackoffAndJitter } from './utils/retry.util';
import {
  appendCaProfitToGoogleSheet,
  isGoogleSheetConfigured,
} from './google-sheets.service';
import {
  getSessionCa,
  persistNextSessionCa,
  readSessionCaOverrideFromConfigFile,
  resetSessionCaOverrideInConfig,
  resetSessionStateOnNewDay,
  setSessionCaOverrideInConfig,
} from './session-ca.util';
import {
  clearSessionProgress,
  getSessionSelectedTable,
  isSessionRetry,
  markSessionStepDone,
  SessionTelegramStep,
  setSessionSelectedTable,
  wasSessionStepDone,
} from './session-progress.util';
import {
  editTongKetCaLines,
  upsertCaProfitForAoGroup,
  upsertCaProfitForThatGroup,
  aoSessionResultToProfitPoints,
  aoSessionTotalToGameResult,
  formatAoTotalSumAsPercent,
  formatTongKetDisplay,
  getTongKetPercentPerHand,
  normalizeAoProfitPoints,
} from './ca-profit.util';

export type GameResult = 'WIN' | 'LOSE' | 'HOA';

type BaccaratRoundResult = {
  hasResult: boolean;
  playerValue?: string;
  bankerValue?: string;
  winner?: string;
};

/** Một tay ảo: chờ ván xong → dự đoán (85%) → báo kết quả. */
type AoHandPollState = {
  baselineRoundSeq: number;
  handReady: boolean;
};

/** Theo dõi ván bàn — phát hiện cả ván trùng kết quả (7-5 rồi 7-5). */
type AoGlobalTableState = {
  roundSeq: number;
  lastSnapshot: string;
  lastHasResult: boolean;
  sawNoResultSinceSnapshot: boolean;
  tableReady: boolean;
};

export class PuppeteerService {
  private readonly logger = {
    log: (message: string) => console.log(`[PuppeteerService] ${message}`),
    error: (message: string, error?: any) =>
      console.error(`[PuppeteerService] ${message}`, error),
  };
  private browser: puppeteer.Browser | null = null;
  private telegramService: TelegramService;
  private selectedTableName: string = ''; // Lưu tên bàn đã chọn
  private screenshotLock: Promise<void> = Promise.resolve(); // Lock để đảm bảo chỉ 1 nhóm chụp ảnh tại một thời điểm
  private aoPollLock: Promise<void> = Promise.resolve(); // Lock đếm ván — tránh poll nền + vòng chính đếm trùng
  private lastRunProfit: number = 0; // Lời/lỗ phiên vừa chạy (group thật)
  private lastGameResult_that: GameResult | null = null;
  private lastRunProfit_ao: number = 0; // Nhóm ảo: điểm % ca (±percentPerHand / 0), không theo bet
  private lastGameResult_ao: GameResult | null = null;
  private thatGroupSessionResults: Array<{
    groupId: string;
    result: GameResult;
    totalProfit: number;
  }> = [];
  private currentSessionCa: number | null = null; // Ca đang chạy (để ghi đúng cột CA trên Google Sheet)
  /** Tránh gọi persistNextSessionCa hai lần trong một phiên. */
  private sessionCaAdvancedThisRun = false;

  /** Trạng thái 1 tay ảo: dự đoán trước → chờ ván xong → báo kết quả (giống nhóm thật). */
  private createAoHandPollState(): AoHandPollState {
    return {
      baselineRoundSeq: 0,
      handReady: false,
    };
  }

  private createAoGlobalTableState(): AoGlobalTableState {
    return {
      roundSeq: 0,
      lastSnapshot: '',
      lastHasResult: false,
      sawNoResultSinceSnapshot: false,
      tableReady: false,
    };
  }

  /** Phát hiện ván mới: đổi kết quả HOẶC bàn clear rồi hiện lại (cùng số vẫn tính ván mới). */
  private detectAoRoundTransition(
    g: AoGlobalTableState,
    r: BaccaratRoundResult,
  ): { newRound: boolean; roundSeq: number; result: BaccaratRoundResult | null } {
    if (!r.hasResult) {
      if (g.lastHasResult) g.sawNoResultSinceSnapshot = true;
      g.lastHasResult = false;
      return { newRound: false, roundSeq: g.roundSeq, result: null };
    }

    const snap = this.serializeBaccaratRoundResult(r);

    if (!g.tableReady) {
      g.tableReady = true;
      g.lastSnapshot = snap;
      g.lastHasResult = true;
      g.sawNoResultSinceSnapshot = false;
      return { newRound: false, roundSeq: g.roundSeq, result: null };
    }

    const isNewRound =
      snap !== g.lastSnapshot || g.sawNoResultSinceSnapshot;

    g.lastHasResult = true;
    g.sawNoResultSinceSnapshot = false;

    if (!isNewRound) {
      return { newRound: false, roundSeq: g.roundSeq, result: null };
    }

    g.roundSeq += 1;
    g.lastSnapshot = snap;
    return { newRound: true, roundSeq: g.roundSeq, result: r };
  }

  /** Ghi nhận ván mới (có lock — poll nền và vòng chính không đếm trùng). */
  private ingestAoPollResult(
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    r: BaccaratRoundResult,
    logTag = '',
  ): Promise<void> {
    this.aoPollLock = this.aoPollLock.then(async () => {
      const { newRound, roundSeq, result } = this.detectAoRoundTransition(
        global,
        r,
      );
      if (newRound && result) {
        recentRounds.set(roundSeq, result);
        const tag = logTag ? `[${logTag}] ` : '';
        this.logger.log(
          `🔄 ${tag}Ván #${roundSeq}: ${result.winner} (${result.playerValue}-${result.bankerValue})`,
        );
      }
    });
    return this.aoPollLock;
  }

  /** Poll nền khi đang chụp/gửi kết quả — không bỏ lỡ ván ở giữa. */
  private startAoTableBackgroundPoll(
    frame: puppeteer.Frame,
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    intervalMs = 250,
  ): () => void {
    let stopped = false;
    const tick = async () => {
      while (!stopped) {
        try {
          const r = await this.readBaccaratRoundResult(frame);
          await this.ingestAoPollResult(global, recentRounds, r, 'poll nền');
        } catch {
          // iframe tạm lỗi — thử lại
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    };
    void tick();
    return () => {
      stopped = true;
    };
  }

  /** Tỷ lệ thắng nhóm ảo (mặc định 85%). Config: `ty_le_thang_ao` (0–1). */
  private getAoWinRate(): number {
    const v = Number(
      (telegramConfig as Record<string, unknown>).ty_le_thang_ao,
    );
    if (Number.isFinite(v) && v > 0 && v <= 1) return v;
    return 0.85;
  }

  /**
   * Nhóm ảo: biết kết quả ván → chọn dự đoán khớp ~85% (không random 50/50).
   */
  private simulateAoPrediction(currentResult: BaccaratRoundResult): {
    prediction: string;
    isDrawResult: boolean;
    isWin: boolean;
  } {
    const isDrawResult = currentResult.winner?.toUpperCase() === 'HÒA';
    const winRate = this.getAoWinRate();
    let prediction = '';
    let isWin = false;
    if (isDrawResult) {
      prediction = Math.random() < 0.5 ? 'NHÀ CÁI' : 'TAY CON';
    } else {
      const shouldWin = Math.random() < winRate;
      const winnerUp = (currentResult.winner ?? '').toUpperCase();
      const isBanker = winnerUp.includes('CÁI');
      if (shouldWin) {
        prediction = isBanker ? 'NHÀ CÁI' : 'TAY CON';
      } else {
        prediction = isBanker ? 'TAY CON' : 'NHÀ CÁI';
      }
      isWin = shouldWin;
    }
    return { prediction, isDrawResult, isWin };
  }

  constructor(telegramService: TelegramService) {
    this.telegramService = telegramService;
  }

  /** Link forward theo config; nhóm ảo: `_ao_1`, `_ao_2`, … → `_ao` → key gốc. */
  private getConfigForwardLink(
    baseKey: string,
    forAo: boolean,
    aoGroupIndex?: number,
  ): string | null {
    const cfg = telegramConfig as Record<string, unknown>;
    if (!forAo) {
      const link = String(cfg[baseKey] ?? '').trim();
      return link || null;
    }
    if (aoGroupIndex !== undefined && aoGroupIndex >= 0) {
      const perGroupKey = `${baseKey}_ao_${aoGroupIndex + 1}`;
      const perGroupLink = String(cfg[perGroupKey] ?? '').trim();
      if (perGroupLink) return perGroupLink;
    }
    const aoKey = `${baseKey}_ao`;
    let link = String(cfg[aoKey] ?? '').trim();
    if (!link) {
      link = String(cfg[baseKey] ?? '').trim();
    }
    return link || null;
  }

  private getAoGroupIndex(groupId: string): number {
    const idx = this.getGroupAoIds().indexOf(String(groupId));
    return idx >= 0 ? idx : 0;
  }

  private hasAnyAoForwardLink(baseKey: string): boolean {
    const groupIds = this.getGroupAoIds();
    for (let i = 0; i < groupIds.length; i++) {
      if (this.getConfigForwardLink(baseKey, true, i)) return true;
    }
    return false;
  }

  /** Mảng link forward; nhóm ảo: `_ao_1`, `_ao_2`, … → `_ao` → key gốc. */
  private getConfigForwardLinks(
    baseKey: string,
    forAo: boolean,
    aoGroupIndex?: number,
  ): string[] {
    const cfg = telegramConfig as Record<string, unknown>;
    const parseLinks = (val: unknown): string[] => {
      if (Array.isArray(val)) {
        return val.map((v) => String(v ?? '').trim()).filter(Boolean);
      }
      const single = String(val ?? '').trim();
      return single ? [single] : [];
    };
    if (!forAo) {
      return parseLinks(cfg[baseKey]);
    }
    if (aoGroupIndex !== undefined && aoGroupIndex >= 0) {
      const perGroupKey = `${baseKey}_ao_${aoGroupIndex + 1}`;
      const perGroupLinks = parseLinks(cfg[perGroupKey]);
      if (perGroupLinks.length > 0) return perGroupLinks;
    }
    const aoLinks = parseLinks(cfg[`${baseKey}_ao`]);
    if (aoLinks.length > 0) return aoLinks;
    return parseLinks(cfg[baseKey]);
  }

  /** Link forward nhóm thật: `_that_1`, `_that_2`, … → `_that` → key gốc. */
  private getConfigForwardLinkForThat(
    baseKey: string,
    thatGroupIndex?: number,
  ): string | null {
    const cfg = telegramConfig as Record<string, unknown>;
    if (thatGroupIndex !== undefined && thatGroupIndex >= 0) {
      const perGroupKey = `${baseKey}_that_${thatGroupIndex + 1}`;
      const perGroupLink = String(cfg[perGroupKey] ?? '').trim();
      if (perGroupLink) return perGroupLink;
    }
    const thatKey = `${baseKey}_that`;
    let link = String(cfg[thatKey] ?? '').trim();
    if (!link) {
      link = String(cfg[baseKey] ?? '').trim();
    }
    return link || null;
  }

  private getConfigForwardLinksForThat(
    baseKey: string,
    thatGroupIndex?: number,
  ): string[] {
    const cfg = telegramConfig as Record<string, unknown>;
    const parseLinks = (val: unknown): string[] => {
      if (Array.isArray(val)) {
        return val.map((v) => String(v ?? '').trim()).filter(Boolean);
      }
      const single = String(val ?? '').trim();
      return single ? [single] : [];
    };
    if (thatGroupIndex !== undefined && thatGroupIndex >= 0) {
      const perGroupKey = `${baseKey}_that_${thatGroupIndex + 1}`;
      const perGroupLinks = parseLinks(cfg[perGroupKey]);
      if (perGroupLinks.length > 0) return perGroupLinks;
    }
    const thatLinks = parseLinks(cfg[`${baseKey}_that`]);
    if (thatLinks.length > 0) return thatLinks;
    return parseLinks(cfg[baseKey]);
  }

  private hasAnyThatForwardLink(baseKey: string): boolean {
    const groupIds = this.getGroupThatIds();
    for (let i = 0; i < groupIds.length; i++) {
      if (this.getConfigForwardLinkForThat(baseKey, i)) return true;
    }
    return false;
  }

  /** Tin mẫu dự đoán theo config: `link_forward_du_doan_con` / `link_forward_du_doan_cai`. */
  private getDuDoanForwardLink(
    prediction: string,
    forAo = false,
    groupIndex?: number,
  ): string | null {
    const u = prediction.trim().toUpperCase();
    if (u === 'TAY CON' || u.includes('CON')) {
      return forAo
        ? this.getConfigForwardLink(
            'link_forward_du_doan_con',
            true,
            groupIndex,
          )
        : this.getConfigForwardLinkForThat(
            'link_forward_du_doan_con',
            groupIndex,
          );
    }
    if (u === 'NHÀ CÁI' || u.includes('CÁI')) {
      return forAo
        ? this.getConfigForwardLink(
            'link_forward_du_doan_cai',
            true,
            groupIndex,
          )
        : this.getConfigForwardLinkForThat(
            'link_forward_du_doan_cai',
            groupIndex,
          );
    }
    return null;
  }

  /**
   * Caption ảnh kết quả từng tay: HÚP/Gãy/hoà + tổng lãi ca (theo tongKetDisplay: % hoặc tiền).
   */
  private buildKetQuaPhotoCaption(
    gameResult: GameResult,
    cumulative: number,
    forAo: boolean,
  ): string {
    const label =
      gameResult === 'WIN' ? 'HÚP' : gameResult === 'LOSE' ? 'Gãy' : 'hoà';
    const group = forAo ? 'ao' : 'that';
    return `${label} ${formatTongKetDisplay(cumulative, group)}`;
  }

  private getLenhKetThucMessageLink(
    result: GameResult,
    suffix: '' | '_2' | '_3',
    forAo = false,
    groupIndex?: number,
  ): string | null {
    const base =
      result === 'HOA'
        ? 'link_forward_lenh_ket_thuc_draw'
        : result === 'WIN'
          ? 'link_forward_lenh_ket_thuc_win'
          : 'link_forward_lenh_ket_thuc_lose';
    return forAo
      ? this.getConfigForwardLink(`${base}${suffix}`, true, groupIndex)
      : this.getConfigForwardLinkForThat(`${base}${suffix}`, groupIndex);
  }

  /** Link `_2`, `_3` — chỉ gửi sau khi xong hết các tay trong ca. */
  private getLenhKetThucExtraMessageLinks(
    result: GameResult,
    forAo = false,
    groupIndex?: number,
  ): string[] {
    const links: string[] = [];
    for (const suffix of ['_2', '_3'] as const) {
      const link = this.getLenhKetThucMessageLink(
        result,
        suffix,
        forAo,
        groupIndex,
      );
      if (link) links.push(link);
    }
    return links;
  }

  private async forwardLenhKetThucExtraLinksAfterSession(
    groupId: string,
    gameResult: GameResult,
    aoFast = false,
    aoGroupIndex?: number,
  ): Promise<void> {
    const links = this.getLenhKetThucExtraMessageLinks(
      gameResult,
      true,
      aoGroupIndex,
    );
    if (links.length === 0) return;
    this.logger.log(
      `📤 Nhóm ${groupId}: gửi ${links.length} tin lệnh kết thúc _2/_3 (${gameResult}) sau hết lệnh kéo`,
    );
    for (let i = 0; i < links.length; i++) {
      await this.forwardMessageToSingleGroupAo(groupId, links[i], aoFast);
      if (i < links.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async forwardLenhKetThucExtraLinksAfterSessionThat(
    groupId: string,
    gameResult: GameResult,
    thatGroupIndex: number,
  ): Promise<void> {
    const links = this.getLenhKetThucExtraMessageLinks(
      gameResult,
      false,
      thatGroupIndex,
    );
    if (!groupId || links.length === 0) return;
    for (let i = 0; i < links.length; i++) {
      await this.telegramService.forwardMessageFromLink(links[i], groupId);
      if (i < links.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async sendSessionEndTelegramForThatGroup(
    groupId: string,
    gameResultThat: GameResult,
    thatGroupIndex: number,
  ): Promise<void> {
    const lenhKetThucThat = this.getConfigForwardLinkForThat(
      'link_forward_lenh_ket_thuc',
      thatGroupIndex,
    );
    if (lenhKetThucThat) {
      await this.telegramService.forwardMessageFromLink(lenhKetThucThat, groupId);
    }
    await this.forwardLenhKetThucExtraLinksAfterSessionThat(
      groupId,
      gameResultThat,
      thatGroupIndex,
    );
    const endLinkThat =
      gameResultThat === 'LOSE'
        ? (this.getConfigForwardLinkForThat(
            'link_forward_tin_nhan_ket_thuc_ca_2',
            thatGroupIndex,
          ) ??
          this.getConfigForwardLinkForThat(
            'link_forward_tin_nhan_ket_thuc_ca',
            thatGroupIndex,
          ))
        : this.getConfigForwardLinkForThat(
            'link_forward_tin_nhan_ket_thuc_ca',
            thatGroupIndex,
          );
    if (endLinkThat) {
      await this.telegramService.forwardMessageFromLink(endLinkThat, groupId);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const tongKetLinkThat =
      this.getConfigForwardLinkForThat(
        'link_forward_tin_nhan_tong_ket',
        thatGroupIndex,
      ) ?? '';
    if (tongKetLinkThat) {
      const mediaRaw = String(
        (telegramConfig as Record<string, unknown>).tong_ket_media_path ?? '',
      ).trim();
      const mediaPath = mediaRaw
        ? path.isAbsolute(mediaRaw)
          ? mediaRaw
          : path.join(process.cwd(), mediaRaw)
        : '';
      await this.forwardTongKetToSingleGroupThatWithStats(
        groupId,
        tongKetLinkThat,
        mediaPath,
      );
    }
    const phuLinksThat = this.getConfigForwardLinksForThat(
      'link_forward_tin_nhan_phu',
      thatGroupIndex,
    );
    for (const phuLink of phuLinksThat) {
      await this.telegramService.forwardMessageFromLink(phuLink, groupId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const lichCaLink = this.getConfigForwardLinkForThat(
      'link_forward_tin_nhan_lich_ca',
      thatGroupIndex,
    );
    if (lichCaLink) {
      await this.telegramService.forwardMessageFromLink(lichCaLink, groupId);
    }
  }

  /** Gửi ảnh chụp với caption = nội dung tin theo link (formattingEntities), lần lượt tới mọi group ảo. */
  private async sendEditedPhotoCaptionFromLinkToGroupAo(
    messageLink: string,
    photoPath: string,
    delay: number = 500,
  ): Promise<void> {
    const groupIds = this.getGroupAoIds();
    for (let i = 0; i < groupIds.length; i++) {
      try {
        await this.telegramService.sendEditedPhotoCaptionFromLink(
          messageLink,
          groupIds[i],
          photoPath,
          (text) => text,
        );
        this.logger.log(
          `✅ Đã gửi ảnh kết quả (caption từ link lệnh kết thúc) tới group ảo ${i + 1}/${groupIds.length}`,
        );
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(
          `❌ Lỗi gửi ảnh caption từ link tới group ảo ${i + 1}:`,
          error,
        );
      }
    }
  }

  /** Args Chrome chung + WebGL: Linux dùng SwiftShader, không bật GPU thật. */
  private buildBrowserLaunchArgs(): string[] {
    const common = [
      '--lang=vi-VN',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-plugins',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-popup-blocking',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-ipc-flooding-protection',
      '--password-store=basic',
      '--use-mock-keychain',
      '--no-pings',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    ];

    if (process.platform === 'linux') {
      this.logger.log(
        '🐧 Linux server: dùng SwiftShader WebGL (không bật GPU thật)',
      );
      return [
        ...common,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader-webgl',
        '--enable-webgl',
        '--enable-webgl2',
      ];
    }

    return [
      ...common,
      '--enable-gpu',
      '--enable-gpu-rasterization',
      '--enable-accelerated-2d-canvas',
      '--enable-accelerated-mjpeg-decode',
      '--enable-accelerated-video-decode',
      '--enable-native-gpu-memory-buffers',
      '--enable-gpu-compositing',
      '--enable-webgl',
      '--enable-webgl2',
      '--enable-accelerated-video',
      '--enable-zero-copy',
      '--enable-gpu-memory-buffer-video-frames',
      '--enable-gpu-sandbox',
      '--enable-hardware-overlays',
      '--enable-oop-rasterization',
      '--enable-raw-draw',
      '--enable-skia-graphite',
      '--enable-vulkan',
      '--enable-vulkan-validation',
    ];
  }

  /** Forward group ảo; retry phiên thì bỏ qua bước đã gửi (session-progress.json). */
  private async forwardMessageToGroupAoWithProgress(
    step: SessionTelegramStep,
    linkOrBaseKey: string,
    ca: number | null,
    opts?: { resolvePerGroupFromConfig?: boolean },
  ): Promise<void> {
    if (ca && wasSessionStepDone(step, ca)) {
      this.logger.log(
        `♻️ Retry ca ${ca}: bỏ qua "${step}" (group ảo — đã gửi)`,
      );
      return;
    }
    await this.forwardMessageToGroupAo(linkOrBaseKey, 500, opts);
    if (ca) markSessionStepDone(step, ca);
  }
  
    private async forwardMessageToGroupThatWithProgress(
    step: SessionTelegramStep,
    linkOrBaseKey: string,
    ca: number | null,
    opts?: { resolvePerGroupFromConfig?: boolean },
  ): Promise<void> {
    if (isChiGuiNhomAo()) return;
    if (ca && wasSessionStepDone(step, ca)) {
      this.logger.log(
        `♻️ Retry ca ${ca}: bỏ qua "${step}" (group thật — đã gửi)`,
      );
      return;
    }
    await this.forwardMessageToGroupThat(linkOrBaseKey, 500, opts);
    if (ca) markSessionStepDone(step, ca);
  }

  private async forwardMessageToGroupThat(
    linkOrBaseKey: string,
    delay: number = 500,
    opts?: { resolvePerGroupFromConfig?: boolean },
  ): Promise<void> {
    const groupIds = this.getGroupThatIds();
    for (let i = 0; i < groupIds.length; i++) {
      const link = opts?.resolvePerGroupFromConfig
        ? this.getConfigForwardLinkForThat(linkOrBaseKey, i)
        : String(linkOrBaseKey ?? '').trim();
      if (!link) continue;
      try {
        await this.telegramService.forwardMessageFromLink(link, groupIds[i]);
        this.logger.log(
          `✅ Đã forward message đến group thật ${i + 1}/${groupIds.length}`,
        );
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(
          `❌ Lỗi forward message đến group thật ${i + 1}:`,
          error,
        );
      }
    }
  }

  private resolveSessionCa(): number | null {
    const cfg = telegramConfig as Record<string, unknown>;
    const soCaCfg = Math.max(0, Math.floor(Number(cfg.so_ca) || 0));
    if (soCaCfg <= 0) {
      return null;
    }
    const lenCaLinks = cfg.link_forward_tin_nhan_len_ca;
    const effectiveSoCa =
      Array.isArray(lenCaLinks) && lenCaLinks.length > 0
        ? Math.min(soCaCfg, lenCaLinks.length)
        : soCaCfg;
    const overrideCa = readSessionCaOverrideFromConfigFile();
    return overrideCa > 0
      ? Math.min(Math.max(1, overrideCa), effectiveSoCa)
      : getSessionCa(effectiveSoCa);
  }

  /** Sau phiên thành công: tăng ca tiếp theo (kể cả khi không có link lệnh ca). */
  private persistSessionCaIfNeeded(): void {
    if (this.sessionCaAdvancedThisRun) return;
    const sessionCa = this.currentSessionCa;
    if (!sessionCa || sessionCa < 1) return;

    const soCaCfg = Math.max(
      0,
      Math.floor(Number((telegramConfig as Record<string, unknown>).so_ca) || 0),
    );
    if (soCaCfg < 1) return;

    persistNextSessionCa(soCaCfg, sessionCa);
    this.sessionCaAdvancedThisRun = true;
    this.logger.log(
      `✅ Đã lưu ca tiếp theo (vừa hoàn thành ca ${sessionCa}/${soCaCfg})`,
    );
  }

  /** Linux/pm2 không có X server → headless; Mac dev có màn hình → headful. Ghi đè: PUPPETEER_HEADLESS=true|false */
  private resolveHeadlessMode(): boolean {
    const env = String(process.env.PUPPETEER_HEADLESS ?? '')
      .trim()
      .toLowerCase();
    if (env === 'false' || env === '0' || env === 'no') {
      return false;
    }
    if (env === 'true' || env === '1' || env === 'yes') {
      return true;
    }
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      return true;
    }
    return false;
  }

  async launchBrowser(): Promise<void> {
    const headless = this.resolveHeadlessMode();
    if (headless) {
      this.logger.log(
        '🖥️ Headless mode (Linux server / không có DISPLAY — không cần Xvfb)',
      );
    }
    return retryWithBackoffAndJitter(
      async () => {
        this.browser = await puppeteer.launch({
          headless,
          protocolTimeout: 120000, // 2 phút — tránh Runtime.callFunctionOn timed out khi evaluate trong iframe chậm
          args: this.buildBrowserLaunchArgs(),
        });
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 10000,
        retryableErrors: ['browser', 'launch', 'timeout', 'network'],
        onRetry: (attempt, error, delay) => {
          this.logger.log(
            `🔄 Retry khởi tạo browser lần ${attempt} sau ${Math.round(delay)}ms...`,
          );
        },
      },
    ).catch((error) => {
      this.logger.error('❌ Lỗi khi khởi tạo trình duyệt:', error);
      throw error;
    });
  }

  async openPage(url: string): Promise<puppeteer.Page> {
    return retryWithBackoffAndJitter(
      async () => {
        if (!this.browser) {
          await this.launchBrowser();
        }

        const page = await this.browser!.newPage();

        // Anti-detection settings
        await page.evaluateOnNewDocument(() => {
          // Remove webdriver property
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
          });

          // Mock plugins
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });

          // Mock languages
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
          });

          // Mock chrome object
          (window as any).chrome = {
            runtime: {},
          };

          // Override getParameter
          Object.defineProperty(navigator, 'getParameter', {
            get: () => () => null,
          });
        });

        // Set realistic user agent
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        );

        // Set viewport
        await page.setViewport({
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
          isMobile: false,
        });

        // Set extra headers
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        });

        // Random delay before navigation
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 2000 + 1000),
        );

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        return page;
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 10000,
        retryableErrors: ['timeout', 'navigation', 'network', 'net::'],
        onRetry: (attempt, error, delay) => {
          this.logger.log(
            `🔄 Retry mở trang lần ${attempt} sau ${Math.round(delay)}ms...`,
          );
        },
      },
    ).catch((error) => {
      this.logger.error('❌ Lỗi khi mở trang:', error);
      throw error;
    });
  }

  async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.logger.log('🛑 Đã đóng toàn bộ trình duyệt. 🛑 KẾT THÚC CA');
        return;
      }
    } catch (error) {
      this.logger.error('❌ Lỗi khi đóng page:', error);
      this.browser = null;
    }
  }

  private async runWithScreenshotLock(task: () => Promise<void>): Promise<void> {
    const queuedTask = this.screenshotLock
      .catch((error) => {
        this.logger.error('⚠️ Phục hồi hàng đợi chụp ảnh sau lỗi trước đó:', error);
      })
      .then(task);

    this.screenshotLock = queuedTask.catch((error) => {
      this.logger.error('❌ Lỗi hàng đợi chụp ảnh:', error);
    });

    await queuedTask;
  }

  async login(
    page: puppeteer.Page,
    username: string,
    password: string,
  ): Promise<void> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      this.logger.log('🔐 Bắt đầu đăng nhập...');

      // Tìm và nhập username
      await page.waitForSelector('#login', { timeout: 15000 });
      await page.type('#login', username);
      this.logger.log('✅ Đã nhập username');

      // Tìm và nhập password
      await page.waitForSelector('#password', { timeout: 15000 });
      await page.type('#password', password);
      this.logger.log('✅ Đã nhập password');

      // Click button đăng nhập và đợi navigation
      this.logger.log('🔍 Đang tìm nút đăng nhập...');

      // Tạo promise để đợi navigation (nếu có)
      const navigationPromise = page
        .waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 30000,
        })
        .catch(() => {
          this.logger.log('⚠️ Không có navigation sau khi đăng nhập');
          return null;
        });

      // Click button
      const clicked = await page.waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const loginButton = buttons.find((btn) =>
            btn.textContent?.includes('Đăng Nhập') || btn.textContent?.includes('Login'),
          );
          if (loginButton) {
            (loginButton as HTMLButtonElement).click();
            return true;
          }
          return false;
        },
        { timeout: 10000 },
      );

      if (!clicked) {
        throw new Error('Không tìm thấy nút Đăng Nhập');
      }

      this.logger.log('✅ Đã click nút đăng nhập');

      // Đợi navigation hoàn tất (nếu có)
      await navigationPromise;

      // Đợi thêm để đảm bảo page ổn định
      this.logger.log('⏳ Đợi page ổn định sau đăng nhập...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Kiểm tra URL sau khi đăng nhập
      const currentUrl = page.url();
      this.logger.log(`📄 URL sau khi đăng nhập: ${currentUrl}`);

      // Kiểm tra xem có đăng nhập thành công không
      // Có thể thêm logic check element đặc trưng của trang đã đăng nhập
      try {
        await page.waitForFunction(
          () => {
            // Check xem có button SEXYBCRT không (dấu hiệu đã login)
            return (
              document.querySelector('[data-provider="SEXYBCRT"]') !== null
            );
          },
          { timeout: 10000 },
        );
        this.logger.log('✅ Đăng nhập thành công - Đã tìm thấy SEXYBCRT');
      } catch (checkError) {
        this.logger.log(
          '⚠️ Không tìm thấy SEXYBCRT ngay sau login, có thể cần đợi thêm',
        );
        // Đợi thêm 5 giây
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      this.logger.error('❌ Lỗi khi đăng nhập:', error);

      // Chụp screenshot để debug
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await page.screenshot({
          path: `screenshots-debug/login-error-${timestamp}.png`,
          fullPage: true,
        });
        this.logger.log('📸 Đã chụp screenshot lỗi đăng nhập');
      } catch (screenshotError) {
        // Ignore screenshot error
      }

      throw error;
    }
  }

  async navigateToSexyBaccarat(page: puppeteer.Page): Promise<puppeteer.Page> {
    this.logger.log('🚀 [navigateToSexyBaccarat] BẮT ĐẦU');

    try {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const newPagePromise = new Promise<puppeteer.Page>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.logger.error('❌ TIMEOUT: Không có page mới sau 30 giây');
          reject(new Error('Timeout: Không có page mới sau 30 giây'));
        }, 30000);

        page.browser()?.on('targetcreated', async (target) => {
          try {
            if (target.type() === 'page') {
              const newPage = await target.page();
              if (newPage) {
                clearTimeout(timeout);
                this.logger.log(
                  `✅ [Event] Đã tìm thấy page mới: ${newPage.url()}`,
                );
                resolve(newPage);
              }
            }
          } catch (error) {
            this.logger.error('❌ [Event] Lỗi trong targetcreated:', error);
            clearTimeout(timeout);
            reject(error);
          }
        });
      });
      // Click vào SEXYBCRT
      const found = await page.waitForFunction(
        () => {
          const selectors = [
            'a[data-provider="SEXYBCRT"]',
            'li[data-provider="sexybcrt"] a[data-provider="SEXYBCRT"]',
            '[data-provider="SEXYBCRT"]',
            '*[data-provider="SEXYBCRT"]',
          ];

          for (const selector of selectors) {
            try {
              const element = document.querySelector(selector);
              if (element && (element as HTMLElement).offsetParent !== null) {
                (element as HTMLElement).click();
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        },
        { timeout: 15000 },
      );

      if (!found) {
        throw new Error('Không tìm thấy sảnh SEXYBCRT');
      }
      const newPage = await newPagePromise;

      // Set viewport PC (desktop 1920×1080)
      try {
        await newPage.setViewport({
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: true,
        });
        await newPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        );
        this.logger.log('🖥️ Đã set viewport PC cho page SexyBaccarat');
      } catch (viewportError) {
        this.logger.error('⚠️ Không set được viewport PC:', viewportError);
      }

      // Đợi page load (với timeout)
      // try {
      //   await newPage.waitForNavigation({
      //     waitUntil: 'networkidle2',
      //     timeout: 30000,
      //   });
      // } catch (navError) {
      //   this.logger.log('⚠️ [5/6] Navigation timeout hoặc không cần thiết');
      // }

      // Đợi thêm để chắc chắn
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const finalUrl = newPage.url();
      this.logger.log('🎉 [navigateToSexyBaccarat] HOÀN THÀNH');
      return newPage;
    } catch (error) {
      this.logger.error('❌ [navigateToSexyBaccarat] LỖI:', error);
      this.logger.error('Stack:', error?.stack);

      // Chụp screenshot để debug
      try {
        if (!fs.existsSync('screenshots-debug')) {
          fs.mkdirSync('screenshots-debug', { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await page.screenshot({
          path: `screenshots-debug/navigate-error-${timestamp}.png`,
          fullPage: true,
        });
        this.logger.log('📸 Đã chụp screenshot lỗi');
      } catch (screenshotError) {
        // Ignore
      }

      throw error;
    }
  }

  async replaceGameMessage(
    frame: puppeteer.Frame,
    isWin: boolean,
    amount: string,
  ): Promise<void> {
    try {
      await frame.evaluate(
        (win: boolean, amt: string) => {
          // Tìm hoặc tạo .messagebox-wrap
          let wrap = document.querySelector(
            '.messagebox-wrap',
          ) as HTMLElement | null;
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'messagebox-wrap';
            document.body.appendChild(wrap);
          }

          // Hiển thị (bỏ display:none)
          wrap.removeAttribute('style');

          // Reset nội dung
          wrap.innerHTML = '';

          // Tạo inner: game_info_win / game_info_lose
          const inner = document.createElement('div');
          inner.className = win ? 'game_info_win' : 'game_info_lose';

          const p = document.createElement('p');
          p.textContent = win ? 'Thắng' : 'Thua';

          const h5 = document.createElement('h5');
          h5.textContent = amt;

          inner.appendChild(p);
          inner.appendChild(h5);
          wrap.appendChild(inner);
        },
        isWin,
        amount,
      );

      this.logger.log(`✅ Đã thay thế .messagebox-wrap: ${amount}`);
    } catch (error) {
      this.logger.error('❌ Lỗi thay thế messagebox-wrap:', error);
    }
  }

  /** Crop top mặc định: 8.5333333333vw (ẩn phần header của vùng game). */
  private static readonly CROP_TOP_VW = 8.5333333333;
  /** Ảnh kết quả ván: cắt 40% trên + 30% dưới → giữ dải giữa 30% chiều cao. */
  private static readonly RESULT_CROP_TOP_PERCENT = 40;
  private static readonly RESULT_CROP_BOTTOM_PERCENT = 30;
  /** Ưu tiên DOM container trước, iframe là fallback cuối. */
  private static readonly SCREENSHOT_TARGET_SELECTORS = [
    '#gameCanvas',
    'canvas#gameCanvas',
    '#gameContainer',
    '.game-container',
    '.table-container',
    '#iframeGameFullPage',
    '#iframeGameHall',
    'iframe[src*="game"]',
  ] as const;

  /**
   * Tìm lại iframe `#iframeGameFullPage` + contentFrame một cách "tươi".
   *
   * Trả về:
   * - `iframe` = `<iframe id="iframeGameFullPage">` element — fallback cho screenshot.
   * - `frame` = contentFrame của iframe — dùng để `replaceGameMessage`, đọc
   *   DOM kết quả game.
   */
  private async findGameIframe(
    page: puppeteer.Page,
  ): Promise<{
    iframe: puppeteer.ElementHandle<HTMLIFrameElement>;
    frame: puppeteer.Frame;
  } | null> {
    let fallback: {
      iframe: puppeteer.ElementHandle<HTMLIFrameElement>;
      frame: puppeteer.Frame;
    } | null = null;

    for (const f of page.frames()) {
      try {
        const found = await f.$('#iframeGameFullPage');
        if (!found) continue;
        const handle = found as puppeteer.ElementHandle<HTMLIFrameElement>;
        const inner = await handle.contentFrame();
        if (inner) {
          return { iframe: handle, frame: inner };
        }
        // contentFrame() is null for cross-origin OOPIFs — keep element handle
        // and use the owning frame as fallback so callers don't fail entirely.
        if (!fallback) {
          fallback = { iframe: handle, frame: f };
        }
      } catch {
        // ignore
      }
    }
    return fallback;
  }

  /**
   * Chờ #iframeGameFullPage xuất hiện.
   * - Có iframe → chụp gửi ngay, không đợi DOM bàn load.
   * - Chưa có iframe → chờ tối đa 30s rồi chụp gửi luôn.
   */
  private async waitForBaccaratTableReady(
    page: puppeteer.Page,
    options: { maxWaitMs?: number; logTag?: string } = {},
  ): Promise<puppeteer.Frame> {
    const maxWaitMs = options.maxWaitMs ?? 90_000;
    const checkInterval = 1000;
    const maxAttempts = Math.ceil(maxWaitMs / checkInterval);
    const tag = options.logTag ? `${options.logTag} ` : '';

    this.logger.log(
      `⏳ ${tag}Chờ iframeGameFullPage (tối đa ${maxWaitMs / 1000}s)...`,
    );

    let lastFoundFrame: puppeteer.Frame | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const found = await this.findGameIframe(page);
      if (found) {
        this.logger.log(
          `✅ ${tag}Đã thấy iframe — chụp gửi ngay${attempt > 0 ? ` (sau ${attempt}s)` : ''}`,
        );
        return found.frame;
      }

      if (attempt > 0 && attempt % 10 === 0) {
        this.logger.log(
          `⏳ ${tag}Vẫn chờ iframe... (${attempt}/${maxAttempts}s)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Hết thời gian chờ vẫn không thấy iframe — ném lỗi để caller xử lý retry/skip.
    if (lastFoundFrame) {
      this.logger.log(
        `⚠️ ${tag}Hết ${maxWaitMs / 1000}s nhưng iframe đã tìm thấy lần cuối — tiếp tục chụp ảnh.`,
      );
      return lastFoundFrame;
    }

    throw new Error(
      `Không tìm thấy iframe iframeGameFullPage sau ${maxWaitMs / 1000}s`,
    );
  }

  private async resolveScreenshotTarget(
    page: puppeteer.Page,
  ): Promise<
    | {
        selector: string;
        tagName: string;
        bbox: { x: number; y: number; width: number; height: number };
      }
    | null
  > {
    const selectors = [...PuppeteerService.SCREENSHOT_TARGET_SELECTORS];
    return page.evaluate((targetSelectors) => {
      type Candidate = {
        selector: string;
        tagName: string;
        isIframe: boolean;
        selectorIndex: number;
        area: number;
        bbox: { x: number; y: number; width: number; height: number };
      };
      const candidates: Candidate[] = [];

      for (let i = 0; i < targetSelectors.length; i++) {
        const selector = targetSelectors[i];
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const isVisible =
            rect.width >= 500 &&
            rect.height >= 250 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0';
          if (!isVisible) continue;
          candidates.push({
            selector,
            tagName: el.tagName.toLowerCase(),
            isIframe: el.tagName.toLowerCase() === 'iframe',
            selectorIndex: i,
            area: rect.width * rect.height,
            bbox: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }

      if (candidates.length === 0) return null;

      candidates.sort((a, b) => {
        if (a.isIframe !== b.isIframe) return a.isIframe ? 1 : -1; // DOM trước iframe
        if (a.selectorIndex !== b.selectorIndex)
          return a.selectorIndex - b.selectorIndex;
        return b.area - a.area;
      });

      const best = candidates[0];
      return {
        selector: best.selector,
        tagName: best.tagName,
        bbox: best.bbox,
      };
    }, selectors);
  }

  /**
   * Chụp vùng game an toàn (DOM mode, PC) — tránh ảnh trắng & detach frame.
   *
   * Không phụ thuộc iframe cố định vì site có thể đổi cấu trúc giữa mobile/PC.
   * Cơ chế:
   * 1. Re-lookup target DOM trước mỗi lần chụp để có bbox "tươi".
   * 2. Đợi 2 rAF + delay nhỏ cho paint cycle.
   * 3. Lấy bounding box của `#iframeGameFullPage` rồi dùng `page.screenshot({ clip })`
   *    (DOM screenshot từ page context — tránh vấn đề OOPIF trắng):
   *    - `cropTopPercent` / `cropBottomPercent` (ảnh kết quả): lấy dải giữa.
   *    - `cropTopVw` (ảnh bàn): cắt header theo vw (1vw = 1% bbox.width).
   * 4. Heuristic phát hiện ảnh trắng → retry tối đa `maxRetries` lần.
   */
  private async captureIframeSafely(
    page: puppeteer.Page,
    outputPath: string,
    options: {
      maxRetries?: number;
      cropTopVw?: number;
      /** Cắt từ trên theo % chiều cao ảnh. */
      cropTopPercent?: number;
      /** Cắt từ dưới theo % chiều cao ảnh (chỉ lấy phần giữa). */
      cropBottomPercent?: number;
      logTag?: string;
    } = {},
  ): Promise<void> {
    const MIN_OK_BYTES = 30_000;
    const maxRetries = options.maxRetries ?? 4;
    const cropTopPercent = options.cropTopPercent;
    const cropBottomPercent = options.cropBottomPercent ?? 0;
    const cropTopVw =
      cropTopPercent != null
        ? 0
        : (options.cropTopVw ?? PuppeteerService.CROP_TOP_VW);
    const tag = options.logTag ? `[${options.logTag}] ` : '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1) Re-lookup iframe + game frame (nếu có) và target DOM để chụp
        const found = await this.findGameIframe(page);
        const frame = found?.frame ?? null;
        const target = await this.resolveScreenshotTarget(page);
        if (!target) {
          throw new Error('Không tìm thấy target DOM để chụp bàn');
        }

        // 2) "Wake up" layer render:
        //    scrollIntoView + chạm vào DOM target + force layout trong frame (nếu có).
        await page
          .evaluate((selector) => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (el?.scrollIntoView) {
              el.scrollIntoView({ block: 'start', inline: 'start' });
            }
            window.scrollTo(0, 0);
            // Toggle 1 thuộc tính nhỏ để invalidate compositor layer
            if (el) {
              el.style.willChange = 'transform';
              void el.offsetHeight;
            }
          }, target.selector)
          .catch(() => undefined);

        if (frame) {
          await frame
            .evaluate(() => {
              void document.body.offsetHeight;
              void document.documentElement.offsetHeight;
            })
            .catch(() => undefined);
        }

        // 3) Đợi 2 rAF (cả page lẫn frame) + delay tăng theo attempt
        await page
          .evaluate(() => {
            return new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve());
              });
            });
          })
          .catch(() => undefined);
        if (frame) {
          await frame
            .evaluate(() => {
              return new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => resolve());
                });
              });
            })
            .catch(() => undefined);
        }

        // Delay tăng dần theo lần retry: 300ms → 700ms → 1200ms
        const delay = 300 + attempt * 400;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // 4) Chụp bằng DOM: lấy bounding box target mới nhất rồi dùng page.screenshot({ clip })
        const latestTarget = await this.resolveScreenshotTarget(page);
        const bbox = latestTarget?.bbox;
        if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
          throw new Error('Không lấy được bounding box target chụp ảnh');
        }
        this.logger.log(
          `📸 ${tag}Target DOM: ${latestTarget?.selector} <${latestTarget?.tagName}> ${Math.round(bbox.width)}x${Math.round(bbox.height)}`,
        );
        const rawBuffer = (await page.screenshot({
          type: 'png',
          clip: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
          captureBeyondViewport: false,
        })) as Buffer;

        // Reset willChange sau chụp
        await page
          .evaluate((selector) => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (el) el.style.willChange = '';
          }, target.selector)
          .catch(() => undefined);

        // 5) Crop bằng sharp
        const meta = await sharp(rawBuffer).metadata();
        const imgW = meta.width ?? 0;
        const imgH = meta.height ?? 0;
        let cropPx = 0;
        let cropHeight = imgH;
        let cropBottomPx = 0;

        if (
          cropTopPercent != null &&
          cropTopPercent > 0 &&
          cropTopPercent < 100 &&
          imgH > 0
        ) {
          cropPx = Math.floor((imgH * cropTopPercent) / 100);
          if (cropBottomPercent > 0) {
            cropBottomPx = Math.floor((imgH * cropBottomPercent) / 100);
          }
          cropHeight = imgH - cropPx - cropBottomPx;
          if (cropHeight <= 0) {
            cropBottomPx = 0;
            cropHeight = imgH - cropPx;
          }
          this.logger.log(
            `📐 ${tag}wrapper.screenshot ${imgW}x${imgH}, crop top=${cropTopPercent}% bottom=${cropBottomPercent}% → ${imgW}x${cropHeight} (giữa)`,
          );
        } else {
          cropPx =
            cropTopVw > 0 && imgW > 0
              ? Math.floor((imgW * cropTopVw) / 100)
              : 0;
          cropHeight = imgH - cropPx;
          this.logger.log(
            `📐 ${tag}wrapper.screenshot ${imgW}x${imgH}, cropTop=${cropPx}px`,
          );
        }

        if (cropPx > 0 && cropPx < imgH && cropHeight > 0) {
          await sharp(rawBuffer)
            .extract({
              left: 0,
              top: cropPx,
              width: imgW,
              height: cropHeight,
            })
            .png()
            .toFile(outputPath);
        } else {
          fs.writeFileSync(outputPath, rawBuffer);
        }

        // 4) Heuristic phát hiện ảnh trắng (1 phần)
        let fileSize = 0;
        try {
          fileSize = fs.statSync(outputPath).size;
        } catch {
          fileSize = 0;
        }

        if (fileSize >= MIN_OK_BYTES) {
          if (attempt > 0) {
            this.logger.log(
              `📸 ${tag}Chụp lại OK ở lần ${attempt + 1} (file ${fileSize} bytes)`,
            );
          }
          return;
        }

        if (attempt < maxRetries) {
          this.logger.log(
            `⚠️ ${tag}Ảnh có vẻ trắng (${fileSize} bytes < ${MIN_OK_BYTES}, lần ${attempt + 1}/${maxRetries + 1}), retry sau 500ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          this.logger.log(
            `⚠️ ${tag}Hết retry (${maxRetries + 1} lần), file ${fileSize} bytes — vẫn dùng ảnh này`,
          );
        }
      } catch (err) {
        this.logger.error(`❌ ${tag}Lỗi chụp iframe (lần ${attempt + 1}):`, err);
        if (attempt >= maxRetries) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // Helper: Lấy config cược theo nhóm (that = group thật, ao = group ảo)
  private getGameBetConfig(useAo: boolean): {
    betAmount: number;
    bankerOdds: number;
    playerOdds: number;
  } {
    const defaultConfig = {
      betAmount: 200,
      bankerOdds: 0.95,
      playerOdds: 1.0,
    };
    const main = telegramConfig.gameBetConfig || defaultConfig;
    if (useAo && (telegramConfig as any).gameBetConfigAo) {
      const ao = (telegramConfig as any).gameBetConfigAo;
      return {
        betAmount: ao.betAmount ?? main.betAmount ?? 2000,
        bankerOdds: ao.bankerOdds ?? main.bankerOdds ?? 0.95,
        playerOdds: ao.playerOdds ?? main.playerOdds ?? 1.0,
      };
    }
    return {
      betAmount: main.betAmount ?? 2000,
      bankerOdds: main.bankerOdds ?? 0.95,
      playerOdds: main.playerOdds ?? 1.0,
    };
  }

  // Helper: Lấy betAmount từ config (useAo = true cho group ảo)
  private getBetAmount(useAo?: boolean): number {
    const config = this.getGameBetConfig(useAo ?? false);
    return config.betAmount;
  }

  // Helper: Tính toán số tiền thắng (chỉ số, không có dấu +/-). useAo = true cho group ảo.
  private calculateWinAmount(winner?: string, useAo?: boolean): number {
    const config = this.getGameBetConfig(useAo ?? false);
    const { betAmount, bankerOdds, playerOdds } = config;

    if (winner?.toUpperCase() === 'NHÀ CÁI') {
      return betAmount * bankerOdds;
    } else {
      return betAmount * playerOdds;
    }
  }

  // Helper: Tính toán số tiền thắng/thua dựa trên betAmount và odds từ config. useAo = true cho group ảo.
  private calculateAmount(
    isDraw: boolean,
    isWin: boolean,
    winner?: string,
    useAo?: boolean,
  ): string {
    const config = this.getGameBetConfig(useAo ?? false);
    const { betAmount, bankerOdds, playerOdds } = config;

    if (isDraw) {
      // HÒA: +0
      return '+0';
    }

    if (isWin) {
      // Thắng: tính dựa trên odds
      let winAmount: number;
      if (winner?.toUpperCase() === 'NHÀ CÁI') {
        // Thắng Banker: betAmount * bankerOdds
        winAmount = betAmount * bankerOdds;
      } else {
        // Thắng Player: betAmount * playerOdds
        winAmount = betAmount * playerOdds;
      }
      // Format với dấu phẩy và 2 chữ số thập phân
      return `+${winAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    // Thua: -betAmount
    return `-${betAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // Gate bắt buộc: phải thấy iframe game trước khi gửi tin Telegram đầu tiên.
  private async waitForGameIframeReady(page: puppeteer.Page): Promise<void> {
    this.logger.log('⏳ Gate: Đang chờ iframe game xuất hiện...');
    const maxAttempts = 50; // ~100 giây chờ + thời gian reload (build/prod thường chậm hơn dev)
    const checkInterval = 2000;
    const reloadEveryAttempts = 12; // ~24s giữa các lần thử reload
    const selectors = [
      '#iframeGameHall',
      'iframe#iframeGameHall',
      'iframe[id="iframeGameHall"]',
      '#iframeGame',
      'iframe#iframeGame',
    ];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      for (const selector of selectors) {
        try {
          const found = await page.$(selector);
          if (found) {
            this.logger.log(`✅ Gate: Đã thấy iframe (${selector})`);
            return;
          }
        } catch {
          // Bỏ qua lỗi selector, thử selector khác
        }
      }

      const allIframes = await page.$$('iframe');
      if (allIframes.length > 0) {
        this.logger.log(`✅ Gate: Đã thấy ${allIframes.length} iframe`);
        return;
      }

      if (attempt < maxAttempts - 1) {
        if (
          attempt > 0 &&
          attempt % reloadEveryAttempts === 0
        ) {
          this.logger.log(
            '🔄 Gate: Chưa thấy iframe — reload trang game rồi chờ tiếp...',
          );
          try {
            await page.reload({
              waitUntil: 'domcontentloaded',
              timeout: 60000,
            });
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } catch (reloadErr) {
            this.logger.log(`⚠️ Gate: Reload lỗi, tiếp tục chờ: ${reloadErr}`);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(
      'Gate fail: Không tìm thấy iframe game sau nhiều lần chờ và reload',
    );
  }

  // Helper: Lấy danh sách group IDs (hỗ trợ cả string và array)
  private getGroupAoIds(): string[] {
    const config = telegramConfig.gui_tin_nhan_vao_group_ao;
    if (Array.isArray(config)) {
      return config.map((id) => String(id).trim()).filter(Boolean);
    }
    const single = String(config ?? '').trim();
    return single ? [single] : [];
  }

  private getGroupThatIds(): string[] {
    const config = telegramConfig.gui_tin_nhan_vao_group_that;
    if (Array.isArray(config)) {
      return config.map((id) => String(id).trim()).filter(Boolean);
    }
    const single = String(config ?? '').trim();
    return single ? [single] : [];
  }

  private getGroupBaoBanIds(): string[] {
    const config = (telegramConfig as Record<string, unknown>)
      .gui_tin_nhan_vao_group_bao_ban;
    if (Array.isArray(config)) {
      return config.map((id) => String(id).trim()).filter(Boolean);
    }
    const single = String(config ?? '').trim();
    return single ? [single] : [];
  }

  private getThatGroupIndex(groupId: string): number {
    const idx = this.getGroupThatIds().indexOf(String(groupId));
    return idx >= 0 ? idx : 0;
  }

  /** Số tay đánh mỗi nhóm thật (cùng thứ tự `gui_tin_nhan_vao_group_that`). */
  private getSoTayGroupThat(): number[] {
    const ids = this.getGroupThatIds();
    const cfg = (telegramConfig as Record<string, unknown>).so_tay_group_that;
    if (Array.isArray(cfg) && cfg.length > 0) {
      return ids.map((_, i) => {
        const raw = cfg[i] ?? cfg[cfg.length - 1];
        const v = Number(raw);
        return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
      });
    }
    return ids.map(() => 1);
  }

  /** Số tay đánh mỗi nhóm ảo (cùng thứ tự `gui_tin_nhan_vao_group_ao`). Mặc định 2 nhóm → [5, 1]. */
  private getSoTayGroupAo(): number[] {
    const ids = this.getGroupAoIds();
    const cfg = (telegramConfig as Record<string, unknown>).so_tay_group_ao;
    if (Array.isArray(cfg) && cfg.length > 0) {
      return ids.map((_, i) => {
        const raw = cfg[i] ?? cfg[cfg.length - 1];
        const v = Number(raw);
        return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
      });
    }
    if (ids.length === 2) return [5, 1];
    return ids.map(() => 1);
  }

  private getAoHandTelegramOpts(): { minGapMs: number } {
    return { minGapMs: this.telegramService.getAoHandMinGapMs() };
  }

  private static readonly MIN_DELAY_DU_DOAN_KET_QUA_AO_SEC = 7;

  private getDelayDuDoanToKetQuaAoMs(): number {
    const s = Number(
      (telegramConfig as Record<string, unknown>)
        .delay_giua_du_doan_va_ket_qua_ao,
    );
    const sec = Number.isFinite(s) && s >= 0 ? s : 0;
    return Math.round(
      Math.max(sec, PuppeteerService.MIN_DELAY_DU_DOAN_KET_QUA_AO_SEC) * 1000,
    );
  }

  private serializeBaccaratRoundResult(r: BaccaratRoundResult): string {
    return `${r.winner}_${r.playerValue}_${r.bankerValue}`;
  }

  private async forwardMessageToSingleGroupAo(
    groupId: string,
    link: string,
    fastHand = false,
  ): Promise<void> {
    const trimmed = link.trim();
    if (!trimmed) return;
    await this.telegramService.forwardMessageFromLink(
      trimmed,
      groupId,
      fastHand ? this.getAoHandTelegramOpts() : undefined,
    );
  }

  private async sendMessageToSingleGroupAo(
    groupId: string,
    message: string,
    fastHand = false,
  ): Promise<void> {
    if (!message?.trim()) return;
    await this.telegramService.sendMessage(
      groupId,
      message,
      fastHand ? this.getAoHandTelegramOpts() : undefined,
    );
  }

  private async sendPhotoToSingleGroupAo(
    groupId: string,
    photoPath: string,
    caption?: string,
    fastHand = false,
  ): Promise<void> {
    await this.telegramService.sendPhoto(
      groupId,
      photoPath,
      caption,
      fastHand ? this.getAoHandTelegramOpts() : undefined,
    );
  }

  private async sendEditedPhotoCaptionFromLinkToSingleGroupAo(
    groupId: string,
    messageLink: string,
    photoPath: string,
    fastHand = false,
  ): Promise<void> {
    await this.telegramService.sendEditedPhotoCaptionFromLink(
      messageLink,
      groupId,
      photoPath,
      (text) => text,
      fastHand ? this.getAoHandTelegramOpts() : undefined,
    );
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildBaoBanPhotoCaption(): string | undefined {
    const cfg = telegramConfig as Record<string, unknown>;
    const tableName = this.selectedTableName.trim();
    const rawLines = Array.isArray(cfg.captionBaoBan) ? cfg.captionBaoBan : [];
    const lines = rawLines
      .map((line) => String(line ?? '').trim())
      .filter(Boolean);
    const parts: string[] = [];

    if (tableName) {
      parts.push(`🎯 <b>${this.escapeHtml(tableName)}</b>`);
    }
    if (lines.length > 0) {
      parts.push(lines.join('\n'));
    }

    const caption = parts.join('\n').trim();
    return caption || undefined;
  }

  private async captureTableScreenshot(page: puppeteer.Page): Promise<string> {
    if (!fs.existsSync('screenshots-table')) {
      fs.mkdirSync('screenshots-table', { recursive: true });
    }
    const safeTableName =
      this.selectedTableName
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'baccarat-table';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = `screenshots-table/${safeTableName}_${timestamp}.png`;

    await this.runWithScreenshotLock(async () => {
      await this.captureIframeSafely(page, outputPath, { logTag: 'bàn' });
    });

    return outputPath;
  }

  private async sendTablePhotoToConfiguredGroups(
    page: puppeteer.Page,
    ca: number | null,
  ): Promise<void> {
    const aoGroupIds = this.getGroupAoIds().map((id) => id.trim()).filter(Boolean);
    const thatGroupIds = this.getGroupThatIds()
      .map((id) => id.trim())
      .filter(Boolean);
    const baoBanGroupIds = this.getGroupBaoBanIds()
      .map((id) => id.trim())
      .filter(Boolean);
    const skipAo = Boolean(ca && wasSessionStepDone('bao_ban_ao', ca));
    const skipThat = Boolean(ca && wasSessionStepDone('bao_ban_that', ca));

    if (skipAo) {
      this.logger.log(
        `♻️ Retry ca ${ca}: bỏ qua "bao_ban_ao" (đã gửi báo bàn ảo/nhóm báo bàn)`,
      );
    }
    if (skipThat) {
      this.logger.log(
        `♻️ Retry ca ${ca}: bỏ qua "bao_ban_that" (link báo bàn đã gửi)`,
      );
    }

    const shouldSendAo = aoGroupIds.length > 0 && !skipAo;
    const shouldSendThat =
      !isChiGuiNhomAo() && thatGroupIds.length > 0 && !skipThat;
    const shouldSendBaoBanPhoto = baoBanGroupIds.length > 0 && !skipAo;

    if (!shouldSendAo && !shouldSendThat && !shouldSendBaoBanPhoto) {
      return;
    }

    if (shouldSendAo) {
      await this.forwardMessageToGroupAo(
        'link_forward_tin_nhan_bao_ban',
        500,
        { resolvePerGroupFromConfig: true },
      );
      if (ca) markSessionStepDone('bao_ban_ao', ca);
    }

    if (shouldSendThat) {
      await this.forwardMessageToGroupThat(
        'link_forward_tin_nhan_bao_ban',
        500,
        { resolvePerGroupFromConfig: true },
      );
      if (ca) markSessionStepDone('bao_ban_that', ca);
    }

    if (!shouldSendBaoBanPhoto) {
      return;
    }

    const photoPath = await this.captureTableScreenshot(page);
    try {
      const caption = this.buildBaoBanPhotoCaption();
      await Promise.all(
        baoBanGroupIds.map(async (groupId) => {
          try {
            await this.telegramService.sendPhoto(groupId, photoPath, caption);
            this.logger.log(`✅ Đã gửi ảnh báo bàn cho nhóm báo bàn ${groupId}`);
          } catch (error) {
            this.logger.error(
              `❌ Lỗi gửi ảnh báo bàn cho nhóm báo bàn ${groupId}:`,
              error,
            );
          }
        }),
      );
      if (ca) markSessionStepDone('bao_ban_ao', ca);
    } finally {
      try {
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
      } catch {
        // ignore
      }
    }
  }

  private async forwardTongKetToSingleGroupAoWithStats(
    groupId: string,
    messageLink: string,
    mediaPath: string,
  ): Promise<void> {
    const preview =
      await this.telegramService.fetchMessageTextFromLink(messageLink);
    const editFn = (text: string) => editTongKetCaLines(text, 'ao', groupId);
    const mp = mediaPath.trim();
    const useMedia = mp !== '' && fs.existsSync(mp);

    if (!preview?.text?.trim()) {
      await this.forwardMessageToSingleGroupAo(groupId, messageLink);
      return;
    }
    if (useMedia) {
      await this.telegramService.sendEditedPhotoCaptionFromLink(
        messageLink,
        groupId,
        mp,
        editFn,
      );
    } else {
      await this.telegramService.sendEditedMessageFromLink(
        messageLink,
        groupId,
        editFn,
      );
    }
  }

  /** Nhóm thật: forward nguyên tin tổng kết (không chèn lãi — chỉ nhóm ảo mới build stats). */
  private async forwardTongKetToSingleGroupThatWithStats(
    groupId: string,
    messageLink: string,
    _mediaPath: string,
  ): Promise<void> {
    await this.telegramService.forwardMessageFromLink(messageLink, groupId);
  }

  /** Xóa toàn bộ ảnh trong screenshots-result, screenshots-table, screenshots-tables (gọi theo lịch 00:05 và 15:05) */
  cleanupAllScreenshotFolders(): void {
    const path = require('path');
    try {
      if (fs.existsSync('screenshots-result')) {
        const files = fs.readdirSync('screenshots-result');
        for (const f of files) {
          const full = path.join('screenshots-result', f);
          if (fs.statSync(full).isFile()) fs.unlinkSync(full);
        }
        this.logger.log('✅ Đã xóa ảnh trong screenshots-result');
      }
      if (fs.existsSync('screenshots-table')) {
        const files = fs.readdirSync('screenshots-table');
        for (const f of files) {
          const full = path.join('screenshots-table', f);
          if (fs.statSync(full).isFile()) fs.unlinkSync(full);
        }
        this.logger.log('✅ Đã xóa ảnh trong screenshots-table');
      }
      if (fs.existsSync('screenshots-tables')) {
        const subs = fs.readdirSync('screenshots-tables');
        for (const sub of subs) {
          const full = path.join('screenshots-tables', sub);
          if (fs.statSync(full).isDirectory()) {
            fs.rmSync(full, { recursive: true });
          } else {
            fs.unlinkSync(full);
          }
        }
        this.logger.log('✅ Đã xóa ảnh và folder trong screenshots-tables');
      }
    } catch (err) {
      this.logger.error('❌ Lỗi xóa ảnh/folder:', err);
    }
  }

  // Helper: Gửi tin nhắn đến nhiều group ảo với delay 500ms
  private async sendMessageToGroupAo(
    message: string,
    delay: number = 500,
  ): Promise<void> {
    const groupIds = this.getGroupAoIds();
    for (let i = 0; i < groupIds.length; i++) {
      try {
        await this.telegramService.sendMessage(groupIds[i], message);
        this.logger.log(
          `✅ Đã gửi tin nhắn đến group ảo ${i + 1}/${groupIds.length}`,
        );
        // Đợi 500ms trước khi gửi group tiếp theo (trừ group cuối)
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(`❌ Lỗi gửi tin nhắn đến group ảo ${i + 1}:`, error);
      }
    }
  }

  // Helper: Gửi ảnh đến nhiều group ảo với delay 500ms
  private async sendPhotoToGroupAo(
    photoPath: string,
    caption?: string,
    delay: number = 500,
  ): Promise<void> {
    const groupIds = this.getGroupAoIds();
    for (let i = 0; i < groupIds.length; i++) {
      try {
        await this.telegramService.sendPhoto(groupIds[i], photoPath, caption);
        this.logger.log(
          `✅ Đã gửi ảnh đến group ảo ${i + 1}/${groupIds.length}`,
        );
        // Đợi 500ms trước khi gửi group tiếp theo (trừ group cuối)
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(`❌ Lỗi gửi ảnh đến group ảo ${i + 1}:`, error);
      }
    }
  }

  // Helper: Forward message đến nhiều group ảo với delay 500ms
  private async forwardMessageToGroupAo(
    linkOrBaseKey: string,
    delay: number = 500,
    opts?: { resolvePerGroupFromConfig?: boolean },
  ): Promise<void> {
    const groupIds = this.getGroupAoIds();
    for (let i = 0; i < groupIds.length; i++) {
      const link = opts?.resolvePerGroupFromConfig
        ? this.getConfigForwardLink(linkOrBaseKey, true, i)
        : String(linkOrBaseKey ?? '').trim();
      if (!link) continue;
      try {
        await this.telegramService.forwardMessageFromLink(link, groupIds[i]);
        this.logger.log(
          `✅ Đã forward message đến group ảo ${i + 1}/${groupIds.length}`,
        );
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(
          `❌ Lỗi forward message đến group ảo ${i + 1}:`,
          error,
        );
      }
    }
  }

  /**
   * Tổng kết nhóm ảo: nếu đọc được text mẫu → sendEdited (chèn % từ ca-profit);
   * không thì forward nguyên bản. Hỗ trợ tin ảnh có `tong_ket_media_path`.
   */
  private async forwardTongKetToGroupAoWithStats(
    messageLink: string,
    mediaPath: string,
    delay: number = 500,
  ): Promise<void> {
    const preview =
      await this.telegramService.fetchMessageTextFromLink(messageLink);
    if (!preview?.text?.trim()) {
      this.logger.log(
        '⚠️ Không đọc được text tin tổng kết — forward ảo nguyên bản như cũ',
      );
      await this.forwardMessageToGroupAo(messageLink, delay);
      return;
    }
    const groupIds = this.getGroupAoIds();
    const mp = mediaPath.trim();
    const usePhoto = mp !== '' && fs.existsSync(mp);
    for (let i = 0; i < groupIds.length; i++) {
      const groupId = groupIds[i];
      const editFn = (text: string) => editTongKetCaLines(text, 'ao', groupId);
      try {
        if (usePhoto) {
          await this.telegramService.sendEditedPhotoCaptionFromLink(
            messageLink,
            groupId,
            mp,
            editFn,
          );
        } else {
          await this.telegramService.sendEditedMessageFromLink(
            messageLink,
            groupId,
            editFn,
          );
        }
        this.logger.log(
          `✅ Đã gửi tổng kết đã build tới group ảo ${i + 1}/${groupIds.length}`,
        );
        if (i < groupIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.error(
          `❌ Lỗi gửi tổng kết tới group ảo ${i + 1}:`,
          error,
        );
      }
    }
  }

  async findBaccaratActive(page: puppeteer.Page): Promise<void> {
    try {
      this.logger.log(`📄 Bắt đầu findBaccaratActive với URL: ${page.url()}`);

      // Đợi page ổn định
      await new Promise((resolve) => setTimeout(resolve, 10000));

      this.logger.log('🔍 Đang tìm các bàn Baccarat đang hoạt động...');

      // Kiểm tra xem page có đang load không
      try {
        await page.waitForFunction(() => document.readyState === 'complete', {
          timeout: 10000,
        });
        this.logger.log('✅ Page readyState = complete');
      } catch {
        this.logger.log('⏳ Đợi thêm 5 giây...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Đợi iframe xuất hiện với polling
      this.logger.log('⏳ Đang đợi iframe xuất hiện (có thể load động)...');
      let iframe: puppeteer.ElementHandle<HTMLIFrameElement> | null = null;
      const maxWaitTime = 90000;
      const checkInterval = 2000;
      const maxAttempts = maxWaitTime / checkInterval;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const allIframes = await page.$$('iframe');

        if (allIframes.length > 0) {
          for (let i = 0; i < allIframes.length; i++) {
            try {
              await Promise.all([
                page.evaluate((el) => el.id, allIframes[i]),
                page.evaluate((el) => el.src, allIframes[i]),
              ]);
            } catch (e) {
              continue;
            }
          }

          const selectors = [
            '#iframeGameHall',
            'iframe#iframeGameHall',
            'iframe[id="iframeGameHall"]',
          ];

          const allFrames = page.frames();

          for (const f of allFrames) {
            for (const selector of selectors) {
              try {
                const found = await f.$(selector);
                if (found) {
                  iframe = found as puppeteer.ElementHandle<HTMLIFrameElement>;
                  this.logger.log(
                    `✅ Tìm thấy iframe '${selector}' trong frame: ${f.url() || '(about:blank)'}`,
                  );
                  break;
                }
              } catch (error) {
                continue;
              }
            }
            if (iframe) break;
          }
  
          if (iframe) break;

          if (!iframe && allIframes.length > 0) {
            try {
              const fallbackSrc = await page.evaluate(
                (el) => (el as HTMLIFrameElement).src || el.id || '(no src/id)',
                allIframes[0],
              );
              this.logger.log(
                `⚠️ Không tìm thấy #iframeGameHall, thử dùng iframe đầu tiên (src/id: ${fallbackSrc})...`,
              );
            } catch {
              this.logger.log(
                '⚠️ Không tìm thấy #iframeGameHall, thử dùng iframe đầu tiên...',
              );
            }
            iframe =
              allIframes[0] as puppeteer.ElementHandle<HTMLIFrameElement>;
          }

          if (iframe) {
            break;
          }
        }

        if (!iframe && attempt < maxAttempts - 1) {
          this.logger.log(
            `⏳ Chưa tìm thấy iframe, đợi thêm ${checkInterval / 1000} giây...`,
          );
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
        }
      }

      if (!iframe) {
        const pageContent = await page.content();
        const pageTitle = await page.title();
        this.logger.error(`❌ URL page: ${page.url()}`);
        this.logger.error(`❌ Title page: ${pageTitle}`);
        this.logger.error(
          `❌ Page content length: ${pageContent.length} characters`,
        );
        throw new Error('Không tìm thấy iframe iframeGameHall sau 90 giây.');
      }

      // Chuyển vào iframe
      let frame = await iframe.contentFrame();
      if (!frame) {
        throw new Error('Không thể truy cập vào iframe');
      }

      // Nhóm ảo/nhóm thật nhận báo bàn bằng link; ảnh + caption chỉ gửi nhóm báo bàn riêng.

      // Tìm các bàn Baccarat (thử lại tối đa 30 giây nếu chưa render kịp)
      // Mỗi lần thử, duyệt lại tất cả frame của page để bắt được iframe load động
      const baccaratMaxWait = 30000;
      const baccaratCheckInterval = 2000;
      let baccaratElements: { index: number; text: string }[] = [];

      const searchBaccaratInFrames = async (): Promise<{
        elements: { index: number; text: string }[];
        foundFrame: puppeteer.Frame;
      } | null> => {
        const framesToSearch = [frame, ...page.frames().filter((f) => f !== frame)];
        for (const f of framesToSearch) {
          try {
            const elements = await f.evaluate(() => {
              const spans = document.querySelectorAll('span');
              const baccaratSpans = Array.from(spans).filter(
                (span) =>
                  span.textContent &&
                  span.textContent.toLowerCase().includes('baccarat'),
              );
              return baccaratSpans.slice(0, 5).map((span, index) => ({
                index: index + 1,
                text: span.textContent?.trim() || '',
              }));
            });
            if (elements.length > 0) {
              return { elements, foundFrame: f };
            }
          } catch {
            // frame có thể bị detach, bỏ qua
          }
        }
        return null;
      };

      for (
        let elapsed = 0;
        elapsed < baccaratMaxWait;
        elapsed += baccaratCheckInterval
      ) {
        const result = await searchBaccaratInFrames();
        if (result) {
          baccaratElements = result.elements;
          if (result.foundFrame !== frame) {
            this.logger.log(
              `🔄 Tìm thấy bàn baccarat trong frame khác: ${result.foundFrame.url() || '(about:blank)'}`,
            );
            frame = result.foundFrame;
          }
          break;
        }

        // Log debug info về frame hiện tại để dễ chẩn đoán
        try {
          const frameInfo = await frame.evaluate(() => ({
            url: document.location.href,
            readyState: document.readyState,
            bodyChildren: document.body ? document.body.children.length : 0,
            spanCount: document.querySelectorAll('span').length,
          }));
          this.logger.log(
            `⏳ Chưa thấy bàn baccarat trong iframe, đợi thêm ${baccaratCheckInterval / 1000}s... (${elapsed + baccaratCheckInterval}ms/${baccaratMaxWait}ms) | readyState=${frameInfo.readyState} spans=${frameInfo.spanCount} bodyChildren=${frameInfo.bodyChildren}`,
          );
        } catch {
          this.logger.log(
            `⏳ Chưa thấy bàn baccarat trong iframe, đợi thêm ${baccaratCheckInterval / 1000}s... (${elapsed + baccaratCheckInterval}ms/${baccaratMaxWait}ms)`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, baccaratCheckInterval),
        );
      }

      if (baccaratElements.length === 0) {
        // Log thêm thông tin để dễ chẩn đoán
        try {
          const allFrameUrls = page.frames().map((f) => f.url() || '(about:blank)');
          this.logger.error(
            `❌ Tất cả frames hiện có (${allFrameUrls.length}): ${JSON.stringify(allFrameUrls)}`,
          );
        } catch {
          // ignore
        }
        throw new Error('Không tìm thấy bàn baccarat nào');
      }

      const ca = this.currentSessionCa;
      const savedTableName =
        ca && ca > 0 ? getSessionSelectedTable(ca) : null;
      let tableIndex: number;
      if (savedTableName) {
        const savedLower = savedTableName.trim().toLowerCase();
        const foundIdx = baccaratElements.findIndex((t) => {
          const textLower = t.text.trim().toLowerCase();
          return (
            textLower === savedLower ||
            textLower.includes(savedLower) ||
            savedLower.includes(textLower)
          );
        });
        if (foundIdx >= 0) {
          tableIndex = foundIdx;
          this.logger.log(
            `♻️ Retry: vào lại bàn đã chọn: ${baccaratElements[foundIdx].text}`,
          );
        } else {
          tableIndex = Math.floor(
            Math.random() * Math.min(5, baccaratElements.length),
          );
          this.logger.log(
            `⚠️ Retry: không thấy bàn "${savedTableName}" — chọn ngẫu nhiên`,
          );
        }
      } else {
        tableIndex = Math.floor(
          Math.random() * Math.min(5, baccaratElements.length),
        );
      }
      const selectedTable = baccaratElements[tableIndex];

      this.logger.log(`🎯 Đã chọn bàn: ${selectedTable.text}`);

      this.selectedTableName = selectedTable.text;
      if (ca && ca > 0) {
        setSessionSelectedTable(ca, selectedTable.text);
      }

      // Click vào bàn
      await frame.evaluate((index) => {
        const spans = document.querySelectorAll('span');
        const baccaratSpans = Array.from(spans).filter(
          (span) =>
            span.textContent &&
            span.textContent.toLowerCase().includes('baccarat'),
        );

        if (baccaratSpans[index]) {
          (baccaratSpans[index] as HTMLElement).click();
        }
      }, tableIndex);

      // Có iframe là chụp gửi ngay, tối đa chờ 30s
      await this.waitForBaccaratTableReady(page, {
        logTag: 'bàn',
        maxWaitMs: 30_000,
      });

      // Gửi tin nhắn Telegram - KHÔNG throw error nếu lỗi
      this.logger.log('📤 Đang gửi tin nhắn Telegram...');

      // Forward vào sảnh cho cả 2 nhóm TRƯỚC khi gửi số bàn/ảnh bàn
      try {
        const hasVaoSanhAo = this.hasAnyAoForwardLink(
          'link_forward_tin_nhan_vao_sanh',
        );
        const hasVaoSanhThat = this.hasAnyThatForwardLink(
          'link_forward_tin_nhan_vao_sanh',
        );
        if (hasVaoSanhAo || hasVaoSanhThat) {
          if (hasVaoSanhAo) {
            await this.forwardMessageToGroupAoWithProgress(
              'vao_sanh_ao',
              'link_forward_tin_nhan_vao_sanh',
              ca ?? null,
              { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram vào sảnh (ảo) - Bỏ qua: ${err}`,
              );
            });
          }
          if (!isChiGuiNhomAo() && hasVaoSanhThat) {
            await this.forwardMessageToGroupThatWithProgress(
                'vao_sanh_that',
                'link_forward_tin_nhan_vao_sanh',
                ca ?? null,
                { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram vào sảnh (thật) - Bỏ qua: ${err}`,
              );
            });
          }
        }
      } catch (err) {
        this.logger.log(`⚠️ Lỗi gửi Telegram vào sảnh - Bỏ qua: ${err}`);
      }

      // Chụp ảnh bàn ngay khi iframe + DOM đã sẵn sàng rồi gửi vào các group cấu hình.
      await this.sendTablePhotoToConfiguredGroups(page, ca ?? null);

      // Báo bàn (ảo) + chờ lệnh (ảo/thật)
      this.logger.log('📤 Đang gửi báo bàn / chờ lệnh...');
      try {
        const hasChoLenhAo = this.hasAnyAoForwardLink(
          'link_forward_tin_nhan_cho_lenh',
        );
        const hasChoLenhThat = this.hasAnyThatForwardLink(
          'link_forward_tin_nhan_cho_lenh',
        );
        if (hasChoLenhAo || hasChoLenhThat) {
          if (hasChoLenhAo) {
            await this.forwardMessageToGroupAoWithProgress(
              'cho_lenh_ao',
              'link_forward_tin_nhan_cho_lenh',
              ca ?? null,
              { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram vào cho lenh (ảo) - Bỏ qua: ${err}`,
              );
            });
          }
          if (!isChiGuiNhomAo() && hasChoLenhThat) {
            await this.forwardMessageToGroupThatWithProgress(
                'cho_lenh_that',
                'link_forward_tin_nhan_cho_lenh',
                ca ?? null,
                { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram vào cho lenh (thật) - Bỏ qua: ${err}`,
              );
            });
          }
        }
      } catch (telegramError) {
        this.logger.log('⚠️ Lỗi gửi báo bàn/chờ lệnh - Tiếp tục chạy:');
      }

      this.logger.log(
        '✅ findBaccaratActive hoàn thành (bỏ qua lỗi Telegram nếu có)',
      );
    } catch (error) {
      this.logger.error('❌ Lỗi khi chọn bàn baccarat:', error);
      throw error;
    }
  }

  async waitForGameResult_that(
    page: puppeteer.Page,
  ): Promise<GameResult> {
    try {
      this.logger.log('🎮 Bắt đầu theo dõi kết quả nhóm thật...');
      return await this.runMultiGroupThatSession(page);
    } catch (error) {
      this.logger.error('❌ Lỗi khi lắng nghe kết quả game (group thật):', error);
      try {
        await this.closeBrowser();
      } catch (closeError) {
        this.logger.error('❌ Lỗi khi đóng browser:', closeError);
      }
      return 'LOSE';
    }
  }

  private async findAoGameFrame(
    page: puppeteer.Page,
  ): Promise<puppeteer.Frame> {
    return this.waitForBaccaratTableReady(page, {
      logTag: 'ảo',
      maxWaitMs: 30_000,
    });
  }

  private async readBaccaratRoundResult(
    frame: puppeteer.Frame,
  ): Promise<BaccaratRoundResult> {
    return frame.evaluate(() => {
      const gameWinnerPlayer = document.querySelector('.result_left');
      const gameWinnerBanker = document.querySelector('.result_right');
      const gameWinnerTie = document.querySelector('.zone_result');
      if (!gameWinnerBanker || !gameWinnerPlayer || !gameWinnerTie) {
        throw new Error('Chưa vào được bàn Baccarat');
      }
      if (
        gameWinnerPlayer.classList.contains('result_left--win')
      ) {
        return {
          hasResult: true,
          playerValue:
            document.querySelector('.result_left__hand-value')?.textContent ||
            '0',
          bankerValue:
            document.querySelector('.result_right__hand-value')?.textContent ||
            '0',
          winner: 'Tay Con',
        };
      }
      if (gameWinnerBanker.classList.contains('result_right--win')) {
        return {
          hasResult: true,
          playerValue:
            document.querySelector('.result_left__hand-value')?.textContent ||
            '0',
          bankerValue:
            document.querySelector('.result_right__hand-value')?.textContent ||
            '0',
          winner: 'Nhà Cái',
        };
      }
      if (gameWinnerTie.classList.contains('result_tie')) {
        return {
          hasResult: true,
          playerValue:
            document.querySelector('.result_left__hand-value')?.textContent ||
            '0',
          bankerValue:
            document.querySelector('.result_right__hand-value')?.textContent ||
            '0',
          winner: 'Hòa',
        };
      }
      return { hasResult: false };
    });
  }

  private async sendAoDuDoanForGroup(
    groupId: string,
    handIndex: number,
    prediction: string,
  ): Promise<void> {
    this.logger.log(
      `📢 Nhóm ảo ${groupId} tay ${handIndex}: gửi dự đoán ${prediction}`,
    );
    const duDoanLink = this.getDuDoanForwardLink(
      prediction,
      true,
      this.getAoGroupIndex(groupId),
    );
    try {
      if (duDoanLink) {
        await this.forwardMessageToSingleGroupAo(groupId, duDoanLink, true);
      } else {
        const betAmount = this.getBetAmount(true);
        const pct = getTongKetPercentPerHand();
        const msg = prediction.toUpperCase().includes('CÁI')
          ? `<b>🔴 CÁI ${betAmount} (${pct}%)</b>`
          : `<b>🟢 CON ${betAmount} (${pct}%)</b>`;
        await this.sendMessageToSingleGroupAo(groupId, msg, true);
      }
    } catch (e) {
      this.logger.error(`❌ Lỗi gửi dự đoán nhóm ${groupId}:`, e);
    }
  }

  private async captureAoKetQuaScreen(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    groupId: string,
    handIndex: number,
    roundResult: BaccaratRoundResult,
    cheat: { isDrawResult: boolean; isWin: boolean },
  ): Promise<{
    profit: number;
    gameResult: GameResult;
    resultImagePath: string;
  }> {
    const { isDrawResult, isWin } = cheat;
    const amountText = this.calculateAmount(
      isDrawResult,
      isWin,
      roundResult.winner,
      true,
    );
    const profit = aoSessionResultToProfitPoints(isDrawResult, isWin);
    const gameResult: GameResult = isDrawResult
      ? 'HOA'
      : isWin
        ? 'WIN'
        : 'LOSE';

    this.logger.log(
      `🎯 Nhóm ảo ${groupId} tay ${handIndex}: ván xong — ${isDrawResult ? 'HÒA' : isWin ? 'WIN' : 'LOSE'} (${profit > 0 ? '+' : ''}${profit}%, tỷ lệ mục tiêu ${Math.round(this.getAoWinRate() * 100)}%)`,
    );

    if (!fs.existsSync('screenshots-result')) {
      fs.mkdirSync('screenshots-result', { recursive: true });
    }
    const safeId = groupId.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultImagePath = `screenshots-result/ao_${safeId}_t${handIndex}_${timestamp}.png`;

    this.logger.log(
      `📸 Nhóm ảo ${groupId} tay ${handIndex}: thay messagebox + chụp ngay${handIndex === 3 ? ' (full màn hình)' : ''}...`,
    );
    await this.runWithScreenshotLock(async () => {
      await this.replaceGameMessage(frame, isWin || isDrawResult, amountText);
      const captureOpts =
        handIndex === 3
          ? { logTag: 'ảo', cropTopVw: 0 }
          : {
              logTag: 'ảo',
              cropTopPercent: PuppeteerService.RESULT_CROP_TOP_PERCENT,
              cropBottomPercent: PuppeteerService.RESULT_CROP_BOTTOM_PERCENT,
            };
      await this.captureIframeSafely(page, resultImagePath, captureOpts);
    });

    return {
      profit,
      gameResult,
      resultImagePath,
    };
  }

  private async sendAoKetQuaPhotoToGroup(
    groupId: string,
    handIndex: number,
    resultImagePath: string,
    priorSessionPercent: number,
    profit: number,
    gameResult: GameResult,
  ): Promise<void> {
    const delayMs = this.getDelayDuDoanToKetQuaAoMs();
    this.logger.log(
      `⏳ Nhóm ảo ${groupId} tay ${handIndex}: chờ ${delayMs / 1000}s sau dự đoán rồi gửi ảnh kết quả...`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      const aoIdx = this.getAoGroupIndex(groupId);
      const lenhLink = this.getLenhKetThucMessageLink(gameResult, '', true, aoIdx);
      if (lenhLink) {
        await this.sendEditedPhotoCaptionFromLinkToSingleGroupAo(
          groupId,
          lenhLink,
          resultImagePath,
          true,
        );
      } else {
        const cumulativePercent = priorSessionPercent + profit;
        const finalCaption = this.buildKetQuaPhotoCaption(
          gameResult,
          cumulativePercent,
          true,
        );
        await this.sendPhotoToSingleGroupAo(
          groupId,
          resultImagePath,
          finalCaption,
          true,
        );
      }
    } catch (e) {
      this.logger.error(`❌ Lỗi gửi ảnh kết quả nhóm ${groupId}:`, e);
    } finally {
      try {
        if (fs.existsSync(resultImagePath)) fs.unlinkSync(resultImagePath);
      } catch {
        // ignore
      }
    }
  }

  private async sendAoKetQuaForGroup(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    groupId: string,
    handIndex: number,
    roundResult: BaccaratRoundResult,
    priorSessionPercent: number,
    cheat: { isDrawResult: boolean; isWin: boolean; prediction: string },
  ): Promise<{
    profit: number;
    gameResult: GameResult;
    photoTask: Promise<void>;
  }> {
    const captured = await this.captureAoKetQuaScreen(
      page,
      frame,
      groupId,
      handIndex,
      roundResult,
      cheat,
    );

    await this.sendAoDuDoanForGroup(
      groupId,
      handIndex,
      cheat.prediction,
    );

    const photoTask = this.sendAoKetQuaPhotoToGroup(
      groupId,
      handIndex,
      captured.resultImagePath,
      priorSessionPercent,
      captured.profit,
      captured.gameResult,
    );

    return {
      profit: captured.profit,
      gameResult: captured.gameResult,
      photoTask,
    };
  }

  private async sendSessionEndTelegramForAoGroup(
    groupId: string,
    gameResult: GameResult,
    gameResultThat: GameResult | null,
  ): Promise<void> {
    const aoIdx = this.getAoGroupIndex(groupId);
    const lenhKetThucAo = this.getConfigForwardLink(
      'link_forward_lenh_ket_thuc',
      true,
      aoIdx,
    );
    if (lenhKetThucAo) {
      await this.forwardMessageToSingleGroupAo(groupId, lenhKetThucAo);
    }
    await this.forwardLenhKetThucExtraLinksAfterSession(
      groupId,
      gameResult,
      true,
      aoIdx,
    );
    const endLinkAo =
      gameResult === 'LOSE'
        ? (this.getConfigForwardLink(
            'link_forward_tin_nhan_ket_thuc_ca_2',
            true,
            aoIdx,
          ) ??
          this.getConfigForwardLink(
            'link_forward_tin_nhan_ket_thuc_ca',
            true,
            aoIdx,
          ))
        : this.getConfigForwardLink(
            'link_forward_tin_nhan_ket_thuc_ca',
            true,
            aoIdx,
          );
    if (endLinkAo) {
      await this.forwardMessageToSingleGroupAo(groupId, endLinkAo);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const tongKetLink =
      this.getConfigForwardLink(
        'link_forward_tin_nhan_tong_ket',
        true,
        aoIdx,
      ) ?? '';
    if (tongKetLink) {
      const mediaRaw = String(
        (telegramConfig as any).tong_ket_media_path ?? '',
      ).trim();
      const mediaPath = mediaRaw
        ? path.isAbsolute(mediaRaw)
          ? mediaRaw
          : path.join(process.cwd(), mediaRaw)
        : '';
      await this.forwardTongKetToSingleGroupAoWithStats(
        groupId,
        tongKetLink,
        mediaPath,
      );
    }

    const phuLinksAo = this.getConfigForwardLinks(
      'link_forward_tin_nhan_phu',
      true,
      aoIdx,
    );
    for (const phuLink of phuLinksAo) {
      await this.forwardMessageToSingleGroupAo(groupId, phuLink);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (telegramConfig.link_forward_tin_nhan_lich_ca) {
      await this.forwardMessageToSingleGroupAo(
        groupId,
        String(telegramConfig.link_forward_tin_nhan_lich_ca),
      );
    }
  }

  private async finalizeAoGroupAfterSession(
    groupId: string,
    totalProfit: number,
    _lastHandResult: GameResult,
    gameResultThat: GameResult | null,
  ): Promise<void> {
    const caForSheet = this.currentSessionCa ?? undefined;
    if (typeof caForSheet === 'number' && caForSheet >= 1) {
      const normalizedTotal = normalizeAoProfitPoints(totalProfit);
      upsertCaProfitForAoGroup(groupId, caForSheet, normalizedTotal);
      if (isGoogleSheetConfigured()) {
        try {
          await appendCaProfitToGoogleSheet(
            'ao',
            normalizedTotal,
            caForSheet,
          );
        } catch (e) {
          this.logger.log(`⚠️ Lỗi ghi Sheet nhóm ${groupId}: ${e}`);
        }
      }
    }
    const sessionResult = aoSessionTotalToGameResult(totalProfit);
    this.logger.log(
      `📤 Nhóm ảo ${groupId} đủ tay — tổng ca ${formatAoTotalSumAsPercent(totalProfit)} → chốt ${sessionResult}`,
    );
    await this.sendSessionEndTelegramForAoGroup(
      groupId,
      sessionResult,
      gameResultThat,
    );
  }

  private async finishAoHandKetQua(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    s: {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfit: number;
      lastGameResult: GameResult;
    },
    roundResult: BaccaratRoundResult,
    targetSeq: number,
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    finalizeTasks: Promise<void>[],
    photoTasks: Promise<void>[],
  ): Promise<void> {
    const stopPoll = this.startAoTableBackgroundPoll(
      frame,
      global,
      recentRounds,
    );
    try {
      s.handIndex += 1;
      const cheat = this.simulateAoPrediction(roundResult);

      const { profit, gameResult, photoTask } =
        await this.sendAoKetQuaForGroup(
          page,
          frame,
          s.groupId,
          s.handIndex,
          roundResult,
          s.totalProfit,
          cheat,
        );
      s.totalProfit += profit;
      s.lastGameResult = gameResult;
      s.handsLeft -= 1;

      this.logger.log(
        `✅ Nhóm ${s.groupId} tay ${s.handIndex}: xong ván #${targetSeq} (còn ${s.handsLeft} tay, tổng ${formatAoTotalSumAsPercent(s.totalProfit)})`,
      );

      if (s.handsLeft === 0) {
        finalizeTasks.push(
          (async () => {
            await photoTask;
            await this.finalizeAoGroupAfterSession(
              s.groupId,
              s.totalProfit,
              gameResult,
              this.lastGameResult_that,
            );
          })(),
        );
      } else {
        photoTasks.push(photoTask);
        s.handPoll.handReady = true;
        s.handPoll.baselineRoundSeq = targetSeq;
      }
    } finally {
      stopPoll();
    }
  }

  /** Sau khi báo kết quả, xử lý nốt các ván đã xảy ra trong lúc chụp ảnh/gửi tin. */
  private async catchUpAoGroupMissedRounds(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    s: {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfit: number;
      lastGameResult: GameResult;
    },
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    finalizeTasks: Promise<void>[],
    photoTasks: Promise<void>[],
  ): Promise<void> {
    while (s.handsLeft > 0) {
      const targetSeq = s.handPoll.baselineRoundSeq + 1;
      if (global.roundSeq < targetSeq) break;
      if (!s.handPoll.handReady) {
        s.handPoll.handReady = true;
      }
      const roundResult = recentRounds.get(targetSeq);
      if (!roundResult) break;

      this.logger.log(
        `⚡ Nhóm ${s.groupId}: bắt kịp ván #${targetSeq}`,
      );

      await this.finishAoHandKetQua(
        page,
        frame,
        s,
        roundResult,
        targetSeq,
        global,
        recentRounds,
        finalizeTasks,
        photoTasks,
      );
    }
  }

  private makeThatPrediction(): string {
    return Math.random() <= 0.493 ? 'TAY CON' : 'NHÀ CÁI';
  }

  private evaluateThatRound(
    prediction: string,
    roundResult: BaccaratRoundResult,
  ): { isDrawResult: boolean; isWin: boolean } {
    const isDrawResult = roundResult.winner?.toUpperCase() === 'HÒA';
    const isWin =
      !isDrawResult &&
      prediction.toLowerCase() === roundResult.winner?.toLowerCase();
    return { isDrawResult, isWin };
  }

  private thatSessionTotalToGameResult(totalProfitMoney: number): GameResult {
    if (totalProfitMoney > 0) return 'WIN';
    if (totalProfitMoney < 0) return 'LOSE';
    return 'HOA';
  }

  private async sendThatDuDoanForGroup(
    groupId: string,
    handIndex: number,
    prediction: string,
  ): Promise<void> {
    const thatIdx = this.getThatGroupIndex(groupId);
    this.logger.log(
      `📢 Nhóm thật ${groupId} tay ${handIndex}: gửi dự đoán ${prediction}`,
    );
    const duDoanLink = this.getDuDoanForwardLink(prediction, false, thatIdx);
    try {
      if (duDoanLink) {
        await this.telegramService.forwardMessageFromLink(duDoanLink, groupId);
      } else {
        const betAmount = this.getBetAmount(false);
        const pct = getTongKetPercentPerHand();
        const msg = prediction.toUpperCase().includes('CÁI')
          ? `<b>🔴 CÁI ${betAmount} (${pct}%)</b>`
          : `<b>🟢 CON ${betAmount} (${pct}%)</b>`;
        await this.telegramService.sendMessage(groupId, msg);
      }
    } catch (e) {
      this.logger.error(`❌ Lỗi gửi dự đoán nhóm thật ${groupId}:`, e);
    }
  }

  private async sendThatKetQuaForGroup(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    groupId: string,
    handIndex: number,
    roundResult: BaccaratRoundResult,
    priorSessionPercent: number,
    prediction: string,
  ): Promise<{ profitMoney: number; profitPercent: number; gameResult: GameResult }> {
    const { isDrawResult, isWin } = this.evaluateThatRound(
      prediction,
      roundResult,
    );
    const amountText = this.calculateAmount(
      isDrawResult,
      isWin,
      roundResult.winner,
      false,
    );
    const profitMoney = isDrawResult
      ? 0
      : isWin
        ? this.calculateWinAmount(roundResult.winner)
        : -this.getBetAmount(false);
    const profitPercent = aoSessionResultToProfitPoints(isDrawResult, isWin);
    const gameResult: GameResult = isDrawResult
      ? 'HOA'
      : isWin
        ? 'WIN'
        : 'LOSE';

    this.logger.log(
      `🎯 Nhóm thật ${groupId} tay ${handIndex}: ${isDrawResult ? 'HÒA' : isWin ? 'WIN' : 'LOSE'} (${profitMoney >= 0 ? '+' : ''}${profitMoney})`,
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (!fs.existsSync('screenshots-result')) {
      fs.mkdirSync('screenshots-result', { recursive: true });
    }
    const safeId = groupId.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultImagePath = `screenshots-result/that_${safeId}_t${handIndex}_${timestamp}.png`;

    await this.runWithScreenshotLock(async () => {
      await this.replaceGameMessage(frame, isWin || isDrawResult, amountText);
      const captureOpts =
        handIndex === 3
          ? { logTag: 'thật', cropTopVw: 0 }
          : {
              logTag: 'thật',
              cropTopPercent: PuppeteerService.RESULT_CROP_TOP_PERCENT,
              cropBottomPercent: PuppeteerService.RESULT_CROP_BOTTOM_PERCENT,
            };
      await this.captureIframeSafely(page, resultImagePath, captureOpts);
    });

    try {
      const thatIdx = this.getThatGroupIndex(groupId);
      const lenhLink = this.getLenhKetThucMessageLink(gameResult, '', false, thatIdx);
      if (lenhLink) {
        await this.telegramService.sendEditedPhotoCaptionFromLink(
          lenhLink,
          groupId,
          resultImagePath,
          (t) => t,
        );
      } else {
        const cumulativePercent = priorSessionPercent + profitPercent;
        const caption = this.buildKetQuaPhotoCaption(
          gameResult,
          cumulativePercent,
          false,
        );
        await this.telegramService.sendPhoto(groupId, resultImagePath, caption);
      }
    } catch (e) {
      this.logger.error(`❌ Lỗi gửi ảnh kết quả nhóm thật ${groupId}:`, e);
    } finally {
      try {
        if (fs.existsSync(resultImagePath)) fs.unlinkSync(resultImagePath);
      } catch {
        // ignore
      }
    }

    return { profitMoney, profitPercent, gameResult };
  }

  private async finalizeThatGroupAfterSession(
    groupId: string,
    totalProfitMoney: number,
    _lastHandResult: GameResult,
  ): Promise<void> {
    const thatIdx = this.getThatGroupIndex(groupId);
    const caForSheet = this.currentSessionCa ?? undefined;
    if (typeof caForSheet === 'number' && caForSheet >= 1) {
      upsertCaProfitForThatGroup(groupId, caForSheet, totalProfitMoney);
      if (isGoogleSheetConfigured()) {
        try {
          await appendCaProfitToGoogleSheet(
            'that',
            totalProfitMoney,
            caForSheet,
          );
        } catch (e) {
          this.logger.log(`⚠️ Lỗi ghi Sheet nhóm thật ${groupId}: ${e}`);
        }
      }
    }
    const sessionResult = this.thatSessionTotalToGameResult(totalProfitMoney);
    this.logger.log(
      `📤 Nhóm thật ${groupId} đủ tay — tổng ca ${totalProfitMoney >= 0 ? '+' : ''}${totalProfitMoney} → chốt ${sessionResult}`,
    );
    await this.sendSessionEndTelegramForThatGroup(
      groupId,
      sessionResult,
      thatIdx,
    );
  }

  private async finishThatHandKetQua(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    s: {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfitMoney: number;
      totalPercent: number;
      lastGameResult: GameResult;
    },
    roundResult: BaccaratRoundResult,
    targetSeq: number,
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    finalizeTasks: Promise<void>[],
  ): Promise<void> {
    const stopPoll = this.startAoTableBackgroundPoll(
      frame,
      global,
      recentRounds,
    );
    try {
      s.handIndex += 1;
      const prediction = this.makeThatPrediction();
      await this.sendThatDuDoanForGroup(s.groupId, s.handIndex, prediction);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { profitMoney, profitPercent, gameResult } =
        await this.sendThatKetQuaForGroup(
          page,
          frame,
          s.groupId,
          s.handIndex,
          roundResult,
          s.totalPercent,
          prediction,
        );
      s.totalProfitMoney += profitMoney;
      s.totalPercent += profitPercent;
      s.lastGameResult = gameResult;
      s.handsLeft -= 1;

      this.logger.log(
        `✅ Nhóm thật ${s.groupId} tay ${s.handIndex}: xong ván #${targetSeq} (còn ${s.handsLeft} tay, tổng ${s.totalProfitMoney >= 0 ? '+' : ''}${s.totalProfitMoney})`,
      );

      if (s.handsLeft === 0) {
        finalizeTasks.push(
          this.finalizeThatGroupAfterSession(
            s.groupId,
            s.totalProfitMoney,
            gameResult,
          ),
        );
      } else {
        s.handPoll.handReady = true;
        s.handPoll.baselineRoundSeq = targetSeq;
      }
    } finally {
      stopPoll();
    }
  }

  private async catchUpThatGroupMissedRounds(
    page: puppeteer.Page,
    frame: puppeteer.Frame,
    s: {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfitMoney: number;
      totalPercent: number;
      lastGameResult: GameResult;
    },
    global: AoGlobalTableState,
    recentRounds: Map<number, BaccaratRoundResult>,
    finalizeTasks: Promise<void>[],
  ): Promise<void> {
    while (s.handsLeft > 0) {
      const targetSeq = s.handPoll.baselineRoundSeq + 1;
      if (global.roundSeq < targetSeq) break;
      if (!s.handPoll.handReady) {
        s.handPoll.handReady = true;
      }
      const roundResult = recentRounds.get(targetSeq);
      if (!roundResult) break;

      this.logger.log(
        `⚡ Nhóm thật ${s.groupId}: bắt kịp ván #${targetSeq}`,
      );

      await this.finishThatHandKetQua(
        page,
        frame,
        s,
        roundResult,
        targetSeq,
        global,
        recentRounds,
        finalizeTasks,
      );
    }
  }

  private async runMultiGroupThatSession(
    page: puppeteer.Page,
  ): Promise<GameResult> {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const groupIds = this.getGroupThatIds();
    if (groupIds.length === 0) {
      this.logger.log('⚠️ Không có nhóm thật — bỏ qua');
      return 'LOSE';
    }

    const handsPerGroup = this.getSoTayGroupThat();
    type ThatGroupState = {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfitMoney: number;
      totalPercent: number;
      lastGameResult: GameResult;
    };

    const states: ThatGroupState[] = groupIds.map((groupId, i) => ({
      groupId,
      handsLeft: handsPerGroup[i],
      handIndex: 0,
      handPoll: this.createAoHandPollState(),
      totalProfitMoney: 0,
      totalPercent: 0,
      lastGameResult: 'LOSE' as GameResult,
    }));

    this.logger.log(
      `🎮 Nhóm thật: ${states.map((s) => `${s.groupId}=${s.handsLeft} tay`).join(' | ')}`,
    );

    const frame = await this.findAoGameFrame(page);
    const global = this.createAoGlobalTableState();
    const recentRounds = new Map<number, BaccaratRoundResult>();
    const finalizeTasks: Promise<void>[] = [];

    while (states.some((s) => s.handsLeft > 0)) {
      let currentResult: BaccaratRoundResult;
      try {
        currentResult = await this.readBaccaratRoundResult(frame);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      await this.ingestAoPollResult(global, recentRounds, currentResult);

      if (global.tableReady) {
        for (const s of states) {
          if (s.handsLeft > 0 && !s.handPoll.handReady) {
            s.handPoll.handReady = true;
            s.handPoll.baselineRoundSeq = global.roundSeq;
          }
        }
      }

      const needKetQua = states.filter(
        (s) =>
          s.handsLeft > 0 &&
          s.handPoll.handReady &&
          global.roundSeq > s.handPoll.baselineRoundSeq,
      );

      for (const s of needKetQua) {
        const targetSeq = s.handPoll.baselineRoundSeq + 1;
        const roundResult = recentRounds.get(targetSeq);
        if (!roundResult) continue;

        await this.finishThatHandKetQua(
          page,
          frame,
          s,
          roundResult,
          targetSeq,
          global,
          recentRounds,
          finalizeTasks,
        );
        await this.catchUpThatGroupMissedRounds(
          page,
          frame,
          s,
          global,
          recentRounds,
          finalizeTasks,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await Promise.allSettled(finalizeTasks);

    this.thatGroupSessionResults = states.map((s) => ({
      groupId: s.groupId,
      result: this.thatSessionTotalToGameResult(s.totalProfitMoney),
      totalProfit: s.totalProfitMoney,
    }));

    const primaryId = groupIds[0];
    const primary = states.find((s) => s.groupId === primaryId);
    this.lastRunProfit = primary?.totalProfitMoney ?? 0;
    return this.thatSessionTotalToGameResult(primary?.totalProfitMoney ?? 0);
  }

  private async runMultiGroupAoSession(
    page: puppeteer.Page,
  ): Promise<GameResult> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const groupIds = this.getGroupAoIds();
    const handsPerGroup = this.getSoTayGroupAo();
    type GroupState = {
      groupId: string;
      handsLeft: number;
      handIndex: number;
      handPoll: AoHandPollState;
      totalProfit: number;
      lastGameResult: GameResult;
    };

    const states: GroupState[] = groupIds.map((groupId, i) => ({
      groupId,
      handsLeft: handsPerGroup[i],
      handIndex: 0,
      handPoll: this.createAoHandPollState(),
      totalProfit: 0,
      lastGameResult: 'LOSE' as GameResult,
    }));

    this.logger.log(
      `🎮 Nhóm ảo: ${states.map((s) => `${s.groupId}=${s.handsLeft} tay (chờ ván → hô ${Math.round(this.getAoWinRate() * 100)}%)`).join(' | ')}`,
    );

    const frame = await this.findAoGameFrame(page);
    const global = this.createAoGlobalTableState();
    const recentRounds = new Map<number, BaccaratRoundResult>();
    const finalizeTasks: Promise<void>[] = [];
    const photoTasks: Promise<void>[] = [];

    while (states.some((s) => s.handsLeft > 0)) {
      let currentResult: BaccaratRoundResult;
      try {
        currentResult = await this.readBaccaratRoundResult(frame);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      await this.ingestAoPollResult(global, recentRounds, currentResult);

      if (global.tableReady) {
        for (const s of states) {
          if (s.handsLeft > 0 && !s.handPoll.handReady) {
            s.handPoll.handReady = true;
            s.handPoll.baselineRoundSeq = global.roundSeq;
          }
        }
      }

      const needKetQua = states.filter(
        (s) =>
          s.handsLeft > 0 &&
          s.handPoll.handReady &&
          global.roundSeq > s.handPoll.baselineRoundSeq,
      );

      for (const s of needKetQua) {
        const targetSeq = s.handPoll.baselineRoundSeq + 1;
        const roundResult = recentRounds.get(targetSeq);
        if (!roundResult) continue;

        await this.finishAoHandKetQua(
          page,
          frame,
          s,
          roundResult,
          targetSeq,
          global,
          recentRounds,
          finalizeTasks,
          photoTasks,
        );
        await this.catchUpAoGroupMissedRounds(
          page,
          frame,
          s,
          global,
          recentRounds,
          finalizeTasks,
          photoTasks,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await Promise.allSettled(photoTasks);
    await Promise.allSettled(finalizeTasks);

    const primaryId = groupIds[0];
    const primary = states.find((s) => s.groupId === primaryId);
    this.lastRunProfit_ao = primary?.totalProfit ?? 0;
    this.lastGameResult_ao = aoSessionTotalToGameResult(
      primary?.totalProfit ?? 0,
    );
    return this.lastGameResult_ao;
  }

  async waitForGameResult_ao(page: puppeteer.Page): Promise<GameResult> {
    try {
      return await this.runMultiGroupAoSession(page);
    } catch (error) {
      this.logger.error('❌ Lỗi khi lắng nghe kết quả game (group ảo):', error);
      try {
        await this.closeBrowser();
      } catch (closeError) {
        this.logger.error('❌ Lỗi khi đóng browser:', closeError);
      }
      throw error;
    }
  }
  getLastRunProfit(): number {
    return this.lastRunProfit;
  }

  getLastGameResult_that(): GameResult | null {
    return this.lastGameResult_that;
  }

  getLastRunProfit_ao(): number {
    return this.lastRunProfit_ao;
  }

  getLastGameResult_ao(): GameResult | null {
    return this.lastGameResult_ao;
  }

  async runBaccaratAuto(): Promise<void> {
    try {
      this.logger.log('🎯 Bắt đầu chạy Baccarat auto...');
      if (isChiGuiNhomAo()) {
        this.logger.log(
          '📌 chi_gui_nhom_ao=true — bỏ qua mọi thao tác nhóm thật',
        );
      }
      this.lastRunProfit = 0;
      this.lastGameResult_that = null;
      this.lastRunProfit_ao = 0;
      this.lastGameResult_ao = null;
      this.thatGroupSessionResults = [];
      this.currentSessionCa = null;
      this.sessionCaAdvancedThisRun = false;

      resetSessionStateOnNewDay();
      
      if (isSessionRetry()) {
        this.logger.log(
          '♻️ Retry phiên (session_ca_override > 0): bỏ qua tin group ảo đã gửi, giữ bàn đã chọn',
        );
      }

      await this.closeBrowser();
      this.logger.log('✅ STEP 1: Đã đóng browser cũ');

      const page = await this.openPage(telegramConfig.url_site);
      this.logger.log('✅ STEP 2: Đã mở page');

      await this.login(
        page,
        telegramConfig.username_site,
        telegramConfig.password_site,
      );
      this.logger.log('✅ STEP 3: Đã đăng nhập xong - Chuẩn bị tìm SEXYBCRT');

      // Đợi thêm sau khi đăng nhập để page ổn định
      this.logger.log('⏳ STEP 4: Đợi 2 giây trước khi tìm SEXYBCRT...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.logger.log('🔍 STEP 5: Bắt đầu gọi navigateToSexyBaccarat()...');
      const newPage = await this.navigateToSexyBaccarat(page);
      this.logger.log(`✅ STEP 6: Đã lấy được page mới: ${newPage.url()}`);

      // Chỉ bắt đầu gửi tin sau khi xác nhận đã có iframe game.
      await this.waitForGameIframeReady(newPage);
      this.logger.log('✅ STEP 6.5: Đã thấy iframe game, bắt đầu gửi tin');

      // Forward tin nhắn bắt đầu trước khi chọn bàn
      this.logger.log('📤 STEP 7: Gửi tin nhắn bắt đầu...');
      const sessionCaForProgress = this.resolveSessionCa();
      if (sessionCaForProgress) {
        this.currentSessionCa = sessionCaForProgress;
      }
      try {
        const hasBatDauThat = this.hasAnyThatForwardLink(
          'link_forward_tin_nhan_bat_dau',
        );
        const hasBatDauAo = this.hasAnyAoForwardLink(
          'link_forward_tin_nhan_bat_dau',
        );
        if (hasBatDauThat || hasBatDauAo) {
          if (hasBatDauAo) {
            await this.forwardMessageToGroupAoWithProgress(
              'bat_dau_ao',
              'link_forward_tin_nhan_bat_dau',
              sessionCaForProgress,
              { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram bắt đầu (group ảo) - Bỏ qua: ${err}`,
              );
            });
          }
          if (hasBatDauThat) {
            await this.forwardMessageToGroupThatWithProgress(
              'bat_dau_that',
              'link_forward_tin_nhan_bat_dau',
              sessionCaForProgress,
              { resolvePerGroupFromConfig: true },
            ).catch((err) => {
              this.logger.log(
                `⚠️ Lỗi gửi Telegram bắt đầu (group thật) - Bỏ qua: ${err}`,
              );
            });
          }
        }

        // Ngay sau tin bắt đầu: forward tin lệnh theo ca (index = ca - 1 trong mảng)
        const cfg = telegramConfig as Record<string, unknown>;
        const soCaCfg = Math.max(
          0,
          Math.floor(Number(cfg.so_ca) || 0),
        );
        const lenCaLinks = cfg.link_forward_tin_nhan_len_ca;
        if (
          soCaCfg > 0 &&
          Array.isArray(lenCaLinks) &&
          lenCaLinks.length > 0
        ) {
          const effectiveSoCa = Math.min(soCaCfg, lenCaLinks.length);
          if (effectiveSoCa < soCaCfg) {
            this.logger.log(
              `⚠️ link_forward_tin_nhan_len_ca chỉ có ${lenCaLinks.length} phần tử — dùng tối đa ${effectiveSoCa} ca`,
            );
          }
          const overrideCa = readSessionCaOverrideFromConfigFile();
          const sessionCa = sessionCaForProgress ?? this.resolveSessionCa();
          if (!sessionCa) {
            throw new Error('Không xác định được ca phiên');
          }
          this.currentSessionCa = sessionCa;
          if (overrideCa > 0) {
            this.logger.log(
              `📌 session_ca_override=${overrideCa} (từ config.json) → ca ${sessionCa}/${effectiveSoCa}; sau OK về 0`,
            );
          }
          const linkRaw = lenCaLinks[sessionCa - 1];
          const linkLen =
            typeof linkRaw === 'string' ? linkRaw.trim() : String(linkRaw ?? '').trim();
          if (linkLen) {
            this.logger.log(
              `📤 Forward tin lệnh ca ${sessionCa}/${effectiveSoCa} (index ${sessionCa - 1})...`,
            );
            let caForwardOk = false;
            if (isChiGuiNhomAo()) {
              await this.forwardMessageToGroupAoWithProgress(
                'len_ca_ao',
                linkLen,
                sessionCa,
              )
                .then(() => {
                  caForwardOk = true;
                })
                .catch((err) => {
                  this.logger.log(
                    `⚠️ Lỗi forward lệnh ca (group ảo) - Bỏ qua: ${err}`,
                  );
                });
            } else {
              await this.forwardMessageToGroupAoWithProgress(
                'len_ca_ao',
                linkLen,
                sessionCa,
              ).catch((err) => {
                this.logger.log(
                  `⚠️ Lỗi forward lệnh ca (group ảo) - Bỏ qua: ${err}`,
                );
              });
              await this.forwardMessageToGroupThatWithProgress(
                'len_ca_that',
                linkLen,
                sessionCa,
              )
                .then(() => {
                  caForwardOk = true;
                })
                .catch((err) => {
                  this.logger.log(
                    `⚠️ Lỗi forward lệnh ca (group thật) - Bỏ qua: ${err}`,
                  );
                });
            }
            if (caForwardOk) {
              if (overrideCa > 0) {
                resetSessionCaOverrideInConfig();
                this.logger.log(
                  '✅ Đã đặt session_ca_override về 0 trong config.json',
                );
              }
              this.logger.log(
                `✅ Đã gửi tin lệnh ca ${sessionCa}/${effectiveSoCa}`,
              );
            } else {
              this.logger.log(
                `⚠️ Không lưu tăng ca — ${isChiGuiNhomAo() ? 'group ảo' : 'group thật'} chưa forward được tin lệnh ca ${sessionCa}`,
              );
            }
          } else {
            this.logger.log(
              `⚠️ link_forward_tin_nhan_len_ca[${sessionCa - 1}] trống — bỏ qua`,
            );
          }
        }
      } catch (telegramError) {
        this.logger.log('⚠️ Lỗi gửi tin nhắn bắt đầu - Tiếp tục chạy:');
      }

      this.logger.log('🎰 STEP 8: Bắt đầu tìm bàn Baccarat...');
      await this.findBaccaratActive(newPage);
      this.logger.log('✅ STEP 9: Đã tìm và vào bàn Baccarat');

      this.logger.log('👀 STEP 10: Bắt đầu theo dõi kết quả game...');
      if (isChiGuiNhomAo()) {
        this.logger.log('📌 chi_gui_nhom_ao: chỉ theo dõi kết quả nhóm ảo');
      }
      const gameResultAoPromise = this.waitForGameResult_ao(newPage);

      let gameResultThat: GameResult | null = null;
      if (!isChiGuiNhomAo()) {
        gameResultThat = await this.waitForGameResult_that(newPage);
        this.lastGameResult_that = gameResultThat;
        this.logger.log(
          `📤 Nhóm thật đã xong (${this.thatGroupSessionResults.length} nhóm) — không đợi nhóm ảo...`,
        );
      }

      const gameResultAo = await gameResultAoPromise;
      this.lastGameResult_ao = gameResultAo;

      this.logger.log('✅ STEP 11: Đã hoàn thành theo dõi game');
      this.persistSessionCaIfNeeded();
      await this.closeBrowser();

      // Bỏ xóa ảnh sảnh: không còn chụp sảnh nữa.

      clearSessionProgress();
      if (readSessionCaOverrideFromConfigFile() > 0) {
        resetSessionCaOverrideInConfig();
        this.logger.log(
          '✅ Phiên hoàn tất — đặt session_ca_override về 0 (cron tick sau dùng ca tiếp theo)',
        );
      }
      this.logger.log('✅ Đã xóa session-progress (phiên hoàn tất)');

      this.logger.log('🎉 HOÀN THÀNH TẤT CẢ!');
    } catch (error) {
      this.logger.error('❌ LỖI tại một step nào đó:', error);
      this.logger.error('Stack trace:', error?.stack);
      this.logger.error('Error message:', error?.message);
      if (this.currentSessionCa && this.currentSessionCa > 0) {
        setSessionCaOverrideInConfig(this.currentSessionCa);
        this.logger.log(
          `♻️ Đã giữ ca hiện tại để restart: session_ca_override=${this.currentSessionCa}`,
        );
      }
      try {
        await this.closeBrowser();
      } catch (closeError) {
        this.logger.error('❌ Lỗi khi đóng browser sau lỗi:', closeError);
      }
      throw error;
    }
  }
}
