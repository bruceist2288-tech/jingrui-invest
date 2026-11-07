import type { Light } from "./engine";

export interface BundleStock {
  id: string;
  name: string;
  domain: string;
  industry: string;
  market: string;
  close: number | null;
  ma20: number | null;
  ma60: number | null;
  avg3m: number | null;
  avg6m: number | null;
  revenueMonth: string;
  revenueYoy: number | null;
  revenueRecent: string;
  reportQuarter: string;
  roe: number | null;
  fcfQuarters: { q: string; v: number | null }[];
  fcfTtm: number | null;
  fcfAllNegative: boolean;
  debt: number | null;
  pe: number | null;
  rd: number | null;
  rdPeriod: string;
  systemSeed: number | null;
  rawPoints: number | null;
  verifiedMax: number | null;
  penalty: number;
  parts: Record<string, number>;
  unverifiedItems: string[];
  valueUnverified: boolean;
  completeness: number;
  weightedCompleteness: number | null;
  verifiedCount: number;
  itemCount: number;
  light: Light;
  lightReason: string;
  lightDate: string;
  seedStars: number;
  seedStarLabel: string;
  growth: string;
  growthNote: string;
  riskText: string;
  reasonText: string;
  auditor: string;
  auditorKind: string;
  auditorQuarter: string;
  auditorDate: string;
  accountingStatus: string;
  disposal: string;
  disposalFuture: string;
  disposed: boolean;
  accountingVeto: boolean;
  forensic: string;
  mdd: number | null;
  turnover60: number | null;
  vol60: number | null;
  rs3m: number | null;
  drawdown52: number | null;
  high52: string;
  foreignPct: number | null;
  foreignDate: string;
  foreignSource: string;
  foreignNote: string;
  inst20: number | null;
  instWindow: string;
  margin: number | null;
  marginDate: string;
  marginSource: string;
  marginNote: string;
  bigHolder: string;
  bigHolderNote: string;
  indexMember: string;
  indexDate: string;
  indexSource: string;
  indexLimit: string;
  mcapBillion: number | null;
  mcapRank: number | null;
  mcapUniverse: number | null;
  mcapDate: string;
  mcapSource: string;
  mcapMethod: string;
  priceDate: string;
  fetchedDate: string;
  recalcDate: string;
  priceSource: string;
  revenueSource: string;
  statementSource: string;
  fcfSource: string;
  peSource: string;
  instSource: string;
  disposalSource: string;
  intlText: string;
  intlDate: string;
  intlSource: string;
  staleNote: string;
  dataGapLabel: string;
  previousScore: number | null;
  ocfNi: number | null;
  gmTrend: string;
  quarterRoe: string;
  methodText: string;
  externalAi: string;
  levelSeed: string;
  discounted: boolean;
  checkDate: string;
  snapshotNote: string;
  canslim: {
    score: number | null;
    items: { key: string; label: string; status: string; score: number | null; detail: string; source: string | null; date: string | null }[];
  };
  magic: { score: number | null; note: string; facts: { label: string; value: string; period: string; source: string; date: string }[] };
}

export interface Bundle {
  generatedFrom: string;
  universeNote: string;
  priceDate: string;
  recalcDate: string;
  fetchedDate: string;
  publicFetch: unknown;
  market: unknown;
  stocks: BundleStock[];
}

export interface Holding {
  id: string;
  shares: number;
  cost: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
  stockId: string;
  note: string;
}

export interface UserDate {
  id: string;
  label: string;
  date: string;
  stockId: string;
}

export interface RuleLog {
  at: string;
  text: string;
}
