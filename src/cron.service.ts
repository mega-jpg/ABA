import * as cron from 'node-cron';
import { PuppeteerService } from './puppeteer.service';
import { TelegramService } from './telegram/telegram.service';
import { retryWithBackoffAndJitter } from './utils/retry.util';

export class CronService {
  private readonly logger = {
    log: (message: string) => console.log(`[CronService] ${message}`),
    error: (message: string, error?: any) =>
      console.error(`[CronService] ${message}`, error),
  };
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private puppeteerService: PuppeteerService,
    private telegramService: TelegramService,
  ) {}

  async start(): Promise<void> {
    // this.logger.log('🚀 App start → chạy tool ngay');
    this.startToolSession();

    // Các khung giờ theo ca (Giờ VN — Asia/Ho_Chi_Minh):
    // 12:50 → 22:50 (Ca1–Ca16)
    const toolSchedules = [
     '0,30 13-15,19-21 * * *'
    ];


    for (const expression of toolSchedules) {
      cron.schedule(
        expression,
        async () => {
          await this.startToolSession();
        },
        { timezone: 'Asia/Ho_Chi_Minh' },
      );
    }

    // Bỏ tổng kết ngày: giờ gửi tổng tiền theo ca ngay sau mỗi ca
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  private async startToolSession() {
    if (this.isRunning) {
      this.logger.log('⏭️ Phiên đang chạy — bỏ qua lần gọi trùng');
      return;
    }
    this.isRunning = true;
    try {
      await retryWithBackoffAndJitter(
        async () => {
          await this.puppeteerService.runBaccaratAuto();
        },
        {
          maxRetries: 4,
          initialDelay: 8000,
          maxDelay: 45000,
          retryableErrors: [
            'timeout',
            'navigation',
            'network',
            'browser',
            'gate',
            'iframe',
            'baccarat',
            'không tìm thấy',
            'chưa sẵn sàng',
          ],
          onRetry: (attempt, error, delay) => {
            this.logger.log(
              `🔄 Retry toàn phiên (đóng browser & chạy lại) lần ${attempt} sau ${Math.round(delay)}ms — ${error?.message ?? error}`,
            );
          },
        },
      );
      // Bỏ thống kê lời/lỗ theo ngày (DailySummaryService)
    } catch (error) {
      this.logger.log('🛑 Tool sẽ dừng do lỗi sau nhiều lần thử');
      this.logger.error('❌ Lỗi:', error);
      return;
    } finally {
      this.isRunning = false;
    }
  }
}
