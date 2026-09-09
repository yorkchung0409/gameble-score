const rules = require(`${process.cwd()}/shared/mahjong-rules.js`) as {
  calculateTeaFeeCents(amountCents: number, thresholdCents: number, ratePercent: number): number;
  calculateThresholdTeaFeeCents(amountCents: number, thresholdCents: number, feeCents: number): number;
  calculateRoomStats(rows: unknown[]): {
    balanceMap: Map<string, number>;
    teaFeeTotal: number;
    totalTurnover: number;
  };
  centsToAmount(cents: number): string;
  canViewRoom(input: { isArchived: boolean; isActiveMember: boolean; wasMember: boolean }): boolean;
};

export const calculatePerPlayerTeaFeeCents = rules.calculateTeaFeeCents;
export const calculateThresholdTeaFeeCents = rules.calculateThresholdTeaFeeCents;
export const calculateRoomStats = rules.calculateRoomStats;
export const canViewRoom = rules.canViewRoom;
export const centsToAmount = rules.centsToAmount;
