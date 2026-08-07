import type { TongKetDisplayMode } from '../config/normalize-config';
type GroupKind = 'that' | 'ao';
export declare function getTongKetPercentPerHand(): number;
export declare function getTongKetDisplayMode(group: GroupKind): TongKetDisplayMode;
export declare function upsertCaProfitToday(group: GroupKind, caIndex: number, amount: number): void;
export declare function upsertCaProfitForThatGroup(thatGroupId: string, caIndex: number, amount: number): void;
export declare function getCaProfitsTodayForThatGroup(thatGroupId: string): Record<number, number>;
export declare function getTotalsForMonthForThatGroup(thatGroupId: string): {
    today: number;
    month: number;
};
export declare function upsertCaProfitForAoGroup(aoGroupId: string, caIndex: number, amount: number): void;
export declare function getCaProfitsTodayForAoGroup(aoGroupId: string): Record<number, number>;
export declare function getTotalsForMonthForAoGroup(aoGroupId: string): {
    today: number;
    month: number;
};
export declare function getCaProfitsToday(group: GroupKind): Record<number, number>;
export declare function getTotalsForMonth(group: GroupKind): {
    today: number;
    month: number;
};
export declare function formatAoDisplayPercent(value: number): string;
export declare function formatAoTotalSumAsPercent(total: number): string;
export declare function normalizeAoProfitPoints(value: number): number;
export declare function aoSessionTotalToGameResult(totalPoints: number): 'WIN' | 'LOSE' | 'HOA';
export declare function aoSessionResultToProfitPoints(isDraw: boolean, isWin: boolean): number;
export declare function coerceAoStoredProfitPoints(value: number): number;
export declare function aoProfitPointsToSheetCell(points: number): number;
export declare function formatTongKetDisplay(stored: number, group: GroupKind): string;
export declare function insertBeforeLastTwoCodepoints(line: string, textToInsert: string): string;
export declare function editTongKetCaLines(text: string, group: GroupKind, groupId?: string): string;
export {};
