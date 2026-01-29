export enum TimeCycle {
  T0 = 'T+0',
  T1 = 'T+1',
  T7 = 'T+7',
  T30 = 'T+30',
}

export interface TrendPoint {
  time: string;
  value: number;
}

export interface LiquidityCardData {
  id: string;
  cycle: TimeCycle;
  cycleLabel: string;
  netLiquidity: number;
  inflow: number;
  outflow: number;
  currency: string;
  trend: TrendPoint[];
  status: 'safe' | 'warning' | 'critical';
  lastUpdated: string;
}
