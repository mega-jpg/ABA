export type BaccaratRoundResultSnapshot = {
  playerClassName?: string | null;
  bankerClassName?: string | null;
  tieClassName?: string | null;
  playerValueText?: string | null;
  bankerValueText?: string | null;
};

export type BaccaratRoundResult = {
  hasResult: boolean;
  playerValue?: string;
  bankerValue?: string;
  winner?: string;
};

function normalizeText(value?: string | null): string {
  return String(value ?? '').trim();
}

export function detectBaccaratRoundResult(
  snapshot: BaccaratRoundResultSnapshot,
): BaccaratRoundResult {
  const playerClass = normalizeText(snapshot.playerClassName).toLowerCase();
  const bankerClass = normalizeText(snapshot.bankerClassName).toLowerCase();
  const tieClass = normalizeText(snapshot.tieClassName).toLowerCase();
  const combined = `${playerClass} ${bankerClass} ${tieClass}`;
  const playerValue = normalizeText(snapshot.playerValueText) || undefined;
  const bankerValue = normalizeText(snapshot.bankerValueText) || undefined;

  const playerWin =
    /result_left[^ ]*win|result_left[^ ]*active|player[^ ]*win|\bwin\b/i.test(
      combined,
    ) && !/result_right[^ ]*win|banker[^ ]*win|\blose\b/i.test(combined);

  const bankerWin =
    /result_right[^ ]*win|result_right[^ ]*active|banker[^ ]*win|\bwin\b/i.test(
      combined,
    ) && !/result_left[^ ]*win|player[^ ]*win|\blose\b/i.test(combined);

  const tieResult =
    /result_tie|zone_result|tie|draw|hòa|hoa/i.test(combined) ||
    /\b(tie|draw|hòa|hoa)\b/i.test(playerValue || '') ||
    /\b(tie|draw|hòa|hoa)\b/i.test(bankerValue || '');

  if (playerWin) {
    return {
      hasResult: true,
      playerValue,
      bankerValue,
      winner: 'Tay Con',
    };
  }

  if (bankerWin) {
    return {
      hasResult: true,
      playerValue,
      bankerValue,
      winner: 'Nhà Cái',
    };
  }

  if (tieResult) {
    return {
      hasResult: true,
      playerValue,
      bankerValue,
      winner: 'Hòa',
    };
  }

  return { hasResult: false };
}
