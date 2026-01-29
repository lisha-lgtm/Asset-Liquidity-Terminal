import { LiquidityCardData, TimeCycle } from './types';

const generateTrendData = (points: number, base: number, volatility: number) => {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}h`,
    value: base + Math.random() * volatility - volatility / 2,
  }));
};

export const MOCK_LIQUIDITY_DATA: LiquidityCardData[] = [
  {
    id: 'card-1',
    cycle: TimeCycle.T0,
    cycleLabel: 'Real-time (Intraday)',
    netLiquidity: 12450000,
    inflow: 45000000,
    outflow: 32550000,
    currency: 'USD',
    trend: generateTrendData(20, 12000000, 2000000),
    status: 'safe',
    lastUpdated: 'Just now',
  },
  {
    id: 'card-2',
    cycle: TimeCycle.T1,
    cycleLabel: 'Next Day Projection',
    netLiquidity: -5200000,
    inflow: 12000000,
    outflow: 17200000,
    currency: 'USD',
    trend: generateTrendData(20, -5000000, 1500000),
    status: 'warning',
    lastUpdated: '10 mins ago',
  },
  {
    id: 'card-3',
    cycle: TimeCycle.T7,
    cycleLabel: 'Weekly Outlook',
    netLiquidity: 89000000,
    inflow: 150000000,
    outflow: 61000000,
    currency: 'USD',
    trend: generateTrendData(20, 80000000, 10000000),
    status: 'safe',
    lastUpdated: '1 hour ago',
  },
  {
    id: 'card-4',
    cycle: TimeCycle.T30,
    cycleLabel: 'Monthly Forecast',
    netLiquidity: -12500000,
    inflow: 420000000,
    outflow: 432500000,
    currency: 'USD',
    trend: generateTrendData(20, -10000000, 5000000),
    status: 'critical',
    lastUpdated: '4 hours ago',
  },
];
