import type { PaginationMeta, Pipeline } from './crm-types';

export interface ForecastMoneySummary {
  currency: string;
  openPipeline: string;
  weightedPipeline: string;
  expectedThisMonth: string;
  expectedThisQuarter: string;
  wonThisMonth: string;
  lostThisMonth: string;
  averageDealSize: string | null;
}
export interface ForecastStage {
  id: string;
  name: string;
  pipelineName: string;
  currency: string;
  dealCount: number;
  totalValue: string;
  weightedValue: string;
}
export interface ForecastOwner {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  currency: string;
  openDeals: number;
  pipelineValue: string;
  weightedValue: string;
  wonValue: string;
  wonCount: number;
  lostCount: number;
  winRate: number | null;
}
export interface ForecastTimeline {
  period: string;
  currency: string;
  value: string;
  weightedValue: string;
}
export interface ForecastDeal {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  ownerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  isWon: boolean;
  isLost: boolean;
  amount: string | null;
  currency: string;
  probability: number;
  weightedValue: string | null;
  expectedCloseDate: string | null;
  daysInStage: number;
  daysSinceCreated: number;
}
export interface ForecastResponse {
  data: {
    summary: {
      currencies: ForecastMoneySummary[];
      won: number;
      lost: number;
      winRate: number | null;
      averageSalesCycleDays: number | null;
    };
    byStage: ForecastStage[];
    byOwner: ForecastOwner[];
    timeline: ForecastTimeline[];
    deals: ForecastDeal[];
  };
  meta: PaginationMeta & {
    range: { from: string; to: string };
    timezone: string;
    visibility: 'organization' | 'own';
    winRateFormula: string;
  };
}
export type ForecastPipeline = Pipeline;
