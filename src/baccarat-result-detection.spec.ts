import { detectBaccaratRoundResult } from './baccarat-result-detection';

describe('detectBaccaratRoundResult', () => {
  it('detects player win from a generic winner-player class', () => {
    const result = detectBaccaratRoundResult({
      playerClassName: 'winner-player',
      bankerClassName: 'loser-banker',
      playerValueText: '8',
      bankerValueText: '5',
    });

    expect(result.hasResult).toBe(true);
    expect(result.winner).toBe('Tay Con');
    expect(result.playerValue).toBe('8');
    expect(result.bankerValue).toBe('5');
  });

  it('detects banker win from a generic winner-banker class', () => {
    const result = detectBaccaratRoundResult({
      playerClassName: 'loser-player',
      bankerClassName: 'winner-banker',
      playerValueText: '4',
      bankerValueText: '9',
    });

    expect(result.hasResult).toBe(true);
    expect(result.winner).toBe('Nhà Cái');
  });

  it('detects tie from a generic tie class', () => {
    const result = detectBaccaratRoundResult({
      playerClassName: 'tie-state',
      bankerClassName: 'tie-state',
      playerValueText: '8',
      bankerValueText: '8',
    });

    expect(result.hasResult).toBe(true);
    expect(result.winner).toBe('Hòa');
  });
});
