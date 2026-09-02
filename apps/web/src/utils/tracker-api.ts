export interface LiveStats {
  totalOrders: number;
  grossRevenue: number;
  avgOrderValue: number;
  fulfillmentRate: number;
  conversionRate: number;
  agentOrders: number;
  agentSharePct: number;
  humanOrders: number;
}

export interface TimeSeriesItem {
  day: string;
  series: "Human" | "AI Agent";
  orders: number;
}

export interface OrderItem {
  id: string;
  date: string;
  customer: string;
  city: string;
  items: string;
  amount: number;
  method: string;
  status: string;
  actor: "agent" | "shopper";
  merchantId: string;
  siteId: string;
}

export interface FunnelItem {
  stage: string;
  count: number;
  rate: string;
  drop: string;
}

export interface SearchQueryItem {
  query: string;
  searches: number;
  suggestion: string;
}

export interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  customerLifetimeValue: number;
  newCustomers: number;
  churnedCustomers: number;
  totalGrowthPct: number;
  activeRetentionPct: number;
  clvGrowthPct: number;
  newAcquisitionPct: number;
}

export interface CustomerGrowthItem {
  day: string;
  series: "New Signups" | "Churned";
  count: number;
}

export interface GeoDistributionItem {
  city: string;
  state: string;
  orders: number;
  share: number;
  revenue: number;
}

export interface CohortAnalysisData {
  firstTime: {
    count: number;
    sharePct: number;
    avgSpend: number;
    totalRevenue: number;
  };
  repeat: {
    count: number;
    sharePct: number;
    avgSpend: number;
    totalRevenue: number;
    repeatCycleDays: number;
    retentionRate: number;
  };
}

export interface TrackerStatsResponse {
  boundMerchantId?: string;
  boundSiteId?: string;
  stats: LiveStats;
  customerStats?: CustomerStats;
  customerGrowthTimeSeries?: CustomerGrowthItem[];
  geoDistribution?: GeoDistributionItem[];
  cohortAnalysis?: CohortAnalysisData;
  timeSeries: TimeSeriesItem[];
  orders: OrderItem[];
  funnel: FunnelItem[];
  searchQueries: SearchQueryItem[];
}

export type StatsPreset = "24h" | "7d" | "15d" | "30d";

export const DEFAULT_STATS: LiveStats = {
  totalOrders: 0,
  grossRevenue: 0,
  avgOrderValue: 0,
  fulfillmentRate: 0,
  conversionRate: 0,
  agentOrders: 0,
  agentSharePct: 0,
  humanOrders: 0,
};

export async function fetchTrackerStats(
  siteId: string,
  preset: StatsPreset = "15d",
): Promise<TrackerStatsResponse> {
  const url = siteId && siteId !== "site_all"
    ? `/api/tracker/stats?site=${encodeURIComponent(siteId)}&range=${preset}`
    : `/api/tracker/stats?site=all&range=${preset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json();
}
