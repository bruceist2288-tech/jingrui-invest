import { assessGraham, rulePasses, type QualityFacts, type RuleResult } from "./masters";

export const CATEGORIES = [
  {
    key: "profit",
    label: "獲利品質",
    short: "獲利",
    max: 20,
    parts: ["品質_ROE", "品質_FCF", "品質_負債", "品質_四季GM同比"],
  },
  {
    key: "growth",
    label: "成長動能",
    short: "成長",
    max: 20,
    parts: ["成長_單季營收", "成長_單季淨利", "成長_月營收", "成長_連三月"],
  },
  {
    key: "intl",
    label: "國際接軌",
    short: "國際",
    max: 15,
    parts: ["國際接軌"],
  },
  { key: "value", label: "估值", short: "估值", max: 15, parts: ["估值"] },
  { key: "chip", label: "籌碼", short: "籌碼", max: 10, parts: ["籌碼_20日", "籌碼_大戶融資"] },
  { key: "tech", label: "產業技術", short: "技術", max: 10, parts: ["產業技術"] },
  {
    key: "momentum",
    label: "價格動能",
    short: "動能",
    max: 5,
    parts: ["價格_60MA", "價格_RS", "價格_量能"],
  },
] as const;

export type WeightKey = (typeof CATEGORIES)[number]["key"];
export type Weights = Record<WeightKey, number>;
export type GateId = "g1" | "g2" | "g3" | "g4" | "g5" | "g6";
export type SubId =
  | "g1_listed"
  | "g1_liquidity"
  | "g2_accounting"
  | "g2_fcf"
  | "g2_disposal"
  | "g3_dual"
  | "g3_governance"
  | "g3_penalty_cap"
  | "g4_completeness"
  | "g5_timing"
  | "g6_max30"
  | "g6_sector5"
  | "g6_weight25"
  | "g6_memory";
export type DisplayLevel = "novice" | "advanced" | "pro";
export type Light = "green" | "yellow" | "red";
export type Tier = "core" | "reserve" | "fail" | "veto";

export interface StockInput {
  id: string;
  name: string;
  domain: string;
  market: string;
  completeness: number;
  turnover60: number | null;
  light: Light;
  penalty: number;
  parts: Record<string, number>;
  unverifiedItems: string[];
  valueUnverified: boolean;
  fcfAllNegative: boolean;
  disposed: boolean;
  accountingVeto: boolean;
  systemSeed: number | null;
  canslimItems: CanslimItemInput[];
  magic: { score: number | null };
  forensic: string;
  quality: QualityFacts;
}

export const CANSLIM_ORDER = ["C", "A", "N", "S", "L", "I", "M"] as const;
export type CanslimKey = (typeof CANSLIM_ORDER)[number];
export const CANSLIM_LABEL: Record<CanslimKey, string> = {
  C: "當季盈餘",
  A: "年度盈餘",
  N: "新高",
  S: "供需",
  L: "領導",
  I: "法人",
  M: "大盤",
};
export type CanslimWeights = Record<CanslimKey, number>;
export interface CanslimItemInput {
  key: CanslimKey;
  status: "verified" | "unverified";
  partial: number | null;
  pass: boolean;
  detail: string;
  source: string | null;
  date: string | null;
}

export function defaultCanslimWeights(): CanslimWeights {
  const weights = {} as CanslimWeights;
  for (const key of CANSLIM_ORDER) weights[key] = 100 / 7;
  return weights;
}

export type CanslimOn = Record<CanslimKey, boolean>;

export function defaultCanslimOn(): CanslimOn {
  const flags = {} as CanslimOn;
  for (const key of CANSLIM_ORDER) flags[key] = true;
  return flags;
}

export const CANSLIM_NORM_NOTE =
  "七項預設各約 14.3 分（合計 100），做不滿也給部分分數。這是我們自己的換算，不是 O'Neil 的原始計分。";
export const MAGIC_SEPARATE_NOTE =
  "神奇公式比的是名次，不是 0–100 分。資本報酬率與盈餘殖利率各自排名後相加，名次不能和分數放在一起平均，所以單獨成一張名單，不進累加。金融與公用事業依原法排除。沒有這兩項已驗證數字就不排名。";

export function isMagicExcludedIndustry(industry: string): boolean {
  return /金融|保險|油電燃氣|公用/.test(industry);
}

export interface MagicCandidate {
  id: string;
  industry: string;
  roc: number | null;
  ey: number | null;
  gatePass: boolean;
}

export type MagicStatus =
  | { id: string; state: "ranked"; rank: number; rocRank: number; eyRank: number; combined: number }
  | { id: string; state: "unverified" }
  | { id: string; state: "excluded"; reason: string }
  | { id: string; state: "gated" };

export function rankMagic(candidates: MagicCandidate[]): { top: MagicStatus[]; byId: Map<string, MagicStatus> } {
  const byId = new Map<string, MagicStatus>();
  const pool: { id: string; roc: number; ey: number }[] = [];
  for (const item of candidates) {
    if (isMagicExcludedIndustry(item.industry)) {
      byId.set(item.id, { id: item.id, state: "excluded", reason: "金融或公用事業，Greenblatt 原法排除" });
      continue;
    }
    if (item.roc == null || item.ey == null) {
      byId.set(item.id, { id: item.id, state: "unverified" });
      continue;
    }
    if (!item.gatePass) {
      byId.set(item.id, { id: item.id, state: "gated" });
      continue;
    }
    pool.push({ id: item.id, roc: item.roc, ey: item.ey });
  }
  const byRoc = [...pool].sort((a, b) => b.roc - a.roc || a.id.localeCompare(b.id));
  const byEy = [...pool].sort((a, b) => b.ey - a.ey || a.id.localeCompare(b.id));
  const rocRank = new Map(byRoc.map((item, index) => [item.id, index + 1]));
  const eyRank = new Map(byEy.map((item, index) => [item.id, index + 1]));
  const ordered = pool
    .map((item) => ({
      id: item.id,
      rocRank: rocRank.get(item.id) || 0,
      eyRank: eyRank.get(item.id) || 0,
      combined: (rocRank.get(item.id) || 0) + (eyRank.get(item.id) || 0),
    }))
    .sort((a, b) => a.combined - b.combined || a.id.localeCompare(b.id));
  ordered.forEach((item, index) => {
    byId.set(item.id, { id: item.id, state: "ranked", rank: index + 1, rocRank: item.rocRank, eyRank: item.eyRank, combined: item.combined });
  });
  return { top: ordered.slice(0, 30).map((item) => byId.get(item.id)!), byId };
}

export function magicLine(status: MagicStatus | undefined): string {
  if (!status || status.state === "unverified") return "神奇公式排名：未驗證（獨立名單，不進累加）";
  if (status.state === "excluded") return `神奇公式排名：不列入（${status.reason}）`;
  if (status.state === "gated") return "神奇公式排名：未通過目前關卡，不列入這張名單";
  return `神奇公式排名：第 ${status.rank} 名（資本報酬率第 ${status.rocRank}、盈餘殖利率第 ${status.eyRank}，名次不是分數）`;
}

export const CANSLIM_THRESHOLD_NOTE =
  "CAN SLIM 只做門檻，不給分數，也不加進排名。預設七項都勾，勾著的每一項都要過；可以整組關掉。C 和 M 可以單獨取消，但它們是核心項。L 是同業營收或市占前三，不必第一；沒有來源和日期就標未驗證，算沒過。";
export const RANKING_NOTE =
  "一次只用一種方法排序：本系統分數，或神奇公式名次。兩種不相加。下面最多 30 家是預備名單，不是買進清單；過關幾家就列幾家，不補滿。";
export const POOL_NOTE = "這是預備名單，不是買進清單。過關幾家就列幾家，不滿 30 家也不湊數。";

export interface Settings {
  display: DisplayLevel;
  gates: Record<GateId, boolean>;
  subs: Record<SubId, boolean>;
  standards: { system: boolean; magic: boolean; canslim: boolean };
  rankingMethod: "system" | "magic";
  canslimGate: boolean;
  grahamGate: boolean;
  grahamOn: { pe: boolean; pb: boolean; current: boolean; earnings: boolean; dividend: boolean };
  grahamPeMax: number;
  grahamPbMax: number;
  grahamProductMax: number;
  grahamCurrentMin: number;
  weights: Weights;
  canslimWeights: CanslimWeights;
  canslimOn: CanslimOn;
  canslimMin: number;
  notify: {
    enabled: boolean;
    weekly: boolean;
    risk: boolean;
    stale: boolean;
    rotation: boolean;
  };
}

export const DEFAULT_WEIGHTS: Weights = {
  profit: 20,
  growth: 20,
  intl: 15,
  value: 15,
  chip: 10,
  tech: 10,
  momentum: 5,
};

export const DEFAULT_SETTINGS: Settings = {
  display: "novice",
  gates: { g1: true, g2: true, g3: true, g4: true, g5: true, g6: true },
  subs: {
    g1_listed: true,
    g1_liquidity: true,
    g2_accounting: true,
    g2_fcf: true,
    g2_disposal: true,
    g3_dual: true,
    g3_governance: true,
    g3_penalty_cap: true,
    g4_completeness: true,
    g5_timing: true,
    g6_max30: true,
    g6_sector5: true,
    g6_weight25: true,
    g6_memory: true,
  },
  standards: { system: true, magic: false, canslim: true },
  rankingMethod: "system",
  canslimGate: true,
  grahamGate: false,
  grahamOn: { pe: true, pb: true, current: true, earnings: true, dividend: true },
  grahamPeMax: 15,
  grahamPbMax: 1.5,
  grahamProductMax: 22.5,
  grahamCurrentMin: 2,
  weights: { ...DEFAULT_WEIGHTS },
  canslimWeights: defaultCanslimWeights(),
  canslimOn: defaultCanslimOn(),
  canslimMin: 7,
  notify: { enabled: false, weekly: true, risk: true, stale: true, rotation: false },
};

export const ORIGIN_NOTES = {
  system:
    "自己定的權重，按專家各自負責的領域給分，並參考證交所指數的流動性與公司治理規則。這套分數還沒有回測。",
  magic:
    "出自 Joel Greenblatt 2005 年的書。方法是挑資本報酬率高、而且盈餘殖利率也高的公司。",
  canslim:
    "William O'Neil（《投資人商業日報》創辦人）整理過去大漲股票的七個特質。",
} as const;

export function weightTotal(weights: Weights): number {
  return CATEGORIES.reduce((sum, item) => sum + (Number(weights[item.key]) || 0), 0);
}

export function scaleWeights(weights: Weights): Weights {
  const raw = CATEGORIES.map((item) => Math.max(0, Number(weights[item.key]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  const exact = raw.map((value) => (value / sum) * 100);
  const floored = exact.map((value) => Math.floor(value));
  let left = 100 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; i < left; i += 1) floored[order[i].index] += 1;
  const next = { ...DEFAULT_WEIGHTS };
  CATEGORIES.forEach((item, index) => {
    next[item.key] = floored[index];
  });
  return next;
}

export function normalizeSettings(input: Settings): Settings {
  const next: Settings = {
    ...input,
    gates: { ...input.gates, g2: true },
    subs: { ...input.subs, g2_accounting: true, g2_fcf: true, g2_disposal: true },
    standards: { system: true, magic: false, canslim: true },
    rankingMethod: input.rankingMethod === "magic" ? "magic" : "system",
    canslimGate: input.canslimGate !== false,
    grahamGate: input.grahamGate === true,
    grahamOn: {
      pe: input.grahamOn?.pe !== false,
      pb: input.grahamOn?.pb !== false,
      current: input.grahamOn?.current !== false,
      earnings: input.grahamOn?.earnings !== false,
      dividend: input.grahamOn?.dividend !== false,
    },
    grahamPeMax: numberOr(input.grahamPeMax, 15),
    grahamPbMax: numberOr(input.grahamPbMax, 1.5),
    grahamProductMax: numberOr(input.grahamProductMax, 22.5),
    grahamCurrentMin: numberOr(input.grahamCurrentMin, 2),
    weights: { ...DEFAULT_WEIGHTS, ...input.weights },
    canslimWeights: { ...defaultCanslimWeights(), ...(input.canslimWeights || {}) },
    canslimOn: { ...defaultCanslimOn(), ...(input.canslimOn || {}) },
    canslimMin: clampMin(input.canslimMin),
    notify: { ...DEFAULT_SETTINGS.notify, ...input.notify },
  };
  const picked = [next.standards.system, next.standards.canslim].filter(Boolean).length;
  if (picked === 0) next.standards.system = true;
  for (const item of CATEGORIES) {
    const value = Number(next.weights[item.key]);
    next.weights[item.key] = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  }
  for (const key of CANSLIM_ORDER) {
    const value = Number(next.canslimWeights[key]);
    next.canslimWeights[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    next.canslimOn[key] = next.canslimOn[key] !== false;
  }
  if (!CANSLIM_ORDER.some((key) => next.canslimOn[key])) next.canslimOn = defaultCanslimOn();
  return next;
}

export function formatTotal(total: number): string {
  if (Math.abs(total - 100) < 0.05) return "100";
  return (Math.round(total * 10) / 10).toFixed(1);
}

export function canslimWeightTotal(weights: CanslimWeights): number {
  const sum = CANSLIM_ORDER.reduce((total, key) => total + (Number(weights[key]) || 0), 0);
  return Math.round(sum * 1000) / 1000;
}

function numberOr(value: number | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMin(value: number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(7, Math.round(parsed)));
}

export interface CanslimRowView {
  key: CanslimKey;
  label: string;
  status: "verified" | "unverified";
  partial: number | null;
  pass: boolean;
  input: number;
  scaled: number;
  detail: string;
  source: string | null;
  date: string | null;
}

export interface CanslimResult {
  score: number;
  qualified: boolean;
  met: number;
  minimum: number;
  strict: boolean;
  missing: CanslimRowView[];
  rows: CanslimRowView[];
}

export function scoreCanslim(stock: StockInput, settings: Settings): CanslimResult {
  const byKey = new Map(stock.canslimItems.map((item) => [item.key, item]));
  const rows: CanslimRowView[] = CANSLIM_ORDER.map((key) => {
    const item = byKey.get(key);
    const status = item?.status === "verified" ? "verified" : "unverified";
    const partial = status === "verified" && item?.partial != null ? clamp(Number(item.partial)) : null;
    const pass = status === "verified" && item?.pass === true;
    return {
      key,
      label: CANSLIM_LABEL[key],
      status,
      partial,
      pass,
      input: Number(settings.canslimWeights[key]) || 0,
      scaled: 0,
      detail: item?.detail || "未驗證",
      source: item?.source ?? null,
      date: item?.date ?? null,
    };
  });
  const ticked = rows.filter((row) => settings.canslimOn?.[row.key] !== false);
  const weightSum = ticked.reduce((total, row) => total + Math.max(0, row.input), 0);
  for (const row of rows) {
    const active = settings.canslimOn?.[row.key] !== false && weightSum > 0;
    row.scaled = active ? (Math.max(0, row.input) / weightSum) * 100 : 0;
  }
  const met = ticked.filter((row) => row.pass).length;
  const qualified = ticked.length > 0 && ticked.every((row) => row.pass);
  const missing = ticked.filter((row) => !row.pass);
  const raw = rows.reduce((total, row) => {
    if (!row.pass || row.partial == null) return total;
    return total + (row.partial / 100) * row.scaled;
  }, 0);
  return {
    score: qualified ? clamp(raw) : 0,
    qualified,
    met,
    minimum: ticked.length,
    strict: CANSLIM_ORDER.every((key) => settings.canslimOn?.[key] !== false),
    missing,
    rows,
  };
}

export function missingPhrase(result: CanslimResult): string {
  if (result.missing.length === 0) return "";
  const bits = result.missing.map((item) => {
    const notes: string[] = [];
    if (item.status === "unverified") notes.push("未驗證");
    if (item.key === "C") notes.push("必過核心");
    if (item.key === "M") notes.push("必過核心，市場風險");
    return notes.length ? `${item.key}（${notes.join("，")}）` : item.key;
  });
  return `缺：${bits.join("、")}`;
}

export function gapIsCore(key: CanslimKey): boolean {
  return key === "C" || key === "M";
}

export interface CanslimMissRow {
  key: CanslimKey;
  label: string;
  missed: number;
  unverified: number;
  failed: number;
  passed: number;
}

export interface CanslimMissStat {
  universe: number;
  passAll: number;
  rows: CanslimMissRow[];
}

export function summarizeCanslim(results: CanslimResult[]): CanslimMissStat {
  const rows = CANSLIM_ORDER.map((key) => {
    let unverified = 0;
    let failed = 0;
    let passed = 0;
    for (const result of results) {
      const item = result.rows.find((row) => row.key === key);
      if (!item || item.status !== "verified") unverified += 1;
      else if (item.pass) passed += 1;
      else failed += 1;
    }
    return { key, label: CANSLIM_LABEL[key], missed: unverified + failed, unverified, failed, passed };
  });
  return {
    universe: results.length,
    passAll: results.filter((result) => result.met === 7).length,
    rows,
  };
}

export function canslimStatLines(stat: CanslimMissStat): string[] {
  return [
    `CAN SLIM 未過原因統計（${stat.universe} 家，七項全過 ${stat.passAll} 家）`,
    ...stat.rows.map(
      (row) => `${row.key} ${row.label}：沒過 ${row.missed}（未驗證 ${row.unverified}、查了但沒過 ${row.failed}、過了 ${row.passed}）`,
    ),
  ];
}

function earned(stock: StockInput, parts: readonly string[]): number {
  return parts.reduce((sum, key) => sum + (Number(stock.parts[key]) || 0), 0);
}

export interface CategoryUse {
  key: WeightKey;
  label: string;
  short: string;
  earned: number;
  max: number;
  ratio: number | null;
  included: boolean;
  input: number;
  scaled: number;
  note: string;
}

export function categoryUses(stock: StockInput, weights: Weights): CategoryUse[] {
  const rows: CategoryUse[] = CATEGORIES.map((item) => {
    let max = item.max;
    let got = earned(stock, item.parts);
    let included = true;
    let note = "";
    if (item.key === "value" && stock.valueUnverified) {
      included = false;
      note = "未驗證，這項權重先拿掉";
    } else if (item.key === "chip" && stock.unverifiedItems.some((name) => name.includes("籌碼_大戶融資"))) {
      max = 5;
      got = Number(stock.parts["籌碼_20日"]) || 0;
      note = "大戶與融資未驗證，已從這項分母排除";
    }
    const ratio = included && max > 0 ? got / max : null;
    return {
      key: item.key,
      label: item.label,
      short: item.short,
      earned: got,
      max,
      ratio,
      included,
      input: Number(weights[item.key]) || 0,
      scaled: 0,
      note,
    };
  });
  const usable = rows.filter((row) => row.included);
  const sum = usable.reduce((total, row) => total + Math.max(0, row.input), 0);
  for (const row of rows) {
    if (!row.included || sum <= 0) continue;
    row.scaled = (Math.max(0, row.input) / sum) * 100;
  }
  return rows;
}

export interface SystemScore {
  score: number | null;
  seed: number | null;
  rows: CategoryUse[];
  penaltyApplied: number;
  formula: string;
}

export function systemScore(stock: StockInput, settings: Settings): SystemScore {
  const rows = categoryUses(stock, settings.weights);
  const penaltyCap = settings.subs.g3_penalty_cap ? 15 : Number.POSITIVE_INFINITY;
  const penaltyApplied = Math.min(Math.max(0, stock.penalty || 0), penaltyCap);
  const usable = rows.filter((row) => row.included && row.ratio != null && row.scaled > 0);
  if (usable.length === 0) {
    return {
      score: null,
      seed: stock.systemSeed,
      rows,
      penaltyApplied,
      formula: "可用權重是 0，本系統這檔沒有可計算的分數。",
    };
  }
  const weighted = usable.reduce((sum, row) => sum + (row.ratio as number) * row.scaled, 0);
  const score = clamp(weighted - penaltyApplied);
  return {
    score,
    seed: stock.systemSeed,
    rows,
    penaltyApplied,
    formula:
      "完成比例 = 已得點數 ÷ 該項可用滿分；乘上調整成合計 100 的權重；再扣風險分。整項未驗證的不計入，不把缺資料當成 0 分。",
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function round1(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "未驗證";
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function vetoReasons(stock: StockInput, settings: Settings): string[] {
  if (!settings.gates.g2) return [];
  const reasons: string[] = [];
  if (settings.subs.g2_accounting && stock.accountingVeto) reasons.push("重大會計疑慮");
  if (settings.subs.g2_fcf && stock.fcfAllNegative) reasons.push("連續四個單季自由現金流各自為負");
  if (settings.subs.g2_disposal && stock.disposed) reasons.push("評估當天正被處置");
  return reasons;
}

export function finalLight(stock: StockInput, settings: Settings): Light {
  if (vetoReasons(stock, settings).length > 0) return "red";
  if (stock.completeness < 60 && stock.light === "green") return "yellow";
  return stock.light;
}

export function riskStatus(stock: StockInput, settings: Settings): "pass" | "warn" | "veto" {
  if (vetoReasons(stock, settings).length > 0) return "veto";
  const forensic = stock.forensic || "";
  const forensicHit = forensic.length > 0 && !forensic.includes("未觸門檻");
  if ((stock.penalty || 0) > 0 || forensicHit) return "warn";
  return "pass";
}

export function starsFrom(avg: number | null, veto: boolean): number | null {
  if (veto || avg == null) return null;
  if (avg >= 80) return 5;
  if (avg >= 70) return 4;
  if (avg >= 60) return 3;
  if (avg >= 50) return 2;
  return 1;
}

export function starLabel(stars: number | null): string {
  if (stars == null) return "不評星";
  return "★".repeat(stars);
}

export function comboText(stars: number | null, light: Light, veto: boolean): string {
  if (veto) return "觸發硬否決，先別碰";
  if (stars == null) return "沒有可計算的平均分數";
  if (light === "red") return "先別碰";
  if (stars >= 5 && light === "green") return "好公司，時機也對";
  if (stars >= 5 && light === "yellow") return "好公司，但等一下";
  if (stars >= 4 && light === "green") return "體質佳，時機也對";
  if (stars >= 4 && light === "yellow") return "體質佳，但等一下";
  if (stars <= 2 && light === "green") return "股價在漲，但公司體質普通";
  if (light === "green") return "時機可以看，體質要一起看";
  if (light === "yellow") return "先等一下";
  return "先別碰";
}

export interface StandardPiece {
  key: "system" | "magic" | "canslim";
  label: string;
  score: number | null;
  selected: boolean;
  included: boolean;
}

export interface ScoredStock {
  stock: StockInput;
  tier: Tier;
  reasons: string[];
  light: Light;
  risk: "pass" | "warn" | "veto";
  system: SystemScore;
  canslim: CanslimResult;
  graham: RuleResult;
  pieces: StandardPiece[];
  sum: number | null;
  avg: number | null;
  stars: number | null;
  combo: string;
  capDomain: string;
}

function piecesOf(stock: StockInput, settings: Settings, system: SystemScore, canslim: CanslimResult): StandardPiece[] {
  return [
    {
      key: "system",
      label: "本系統",
      score: system.score,
      selected: settings.standards.system,
      included: settings.standards.system && system.score != null,
    },
    {
      key: "canslim",
      label: "CAN SLIM",
      score: null,
      selected: settings.canslimGate,
      included: false,
    },
  ];
}

function capDomain(stock: StockInput, settings: Settings): string {
  if (stock.domain === "記憶體/儲存" && !(settings.gates.g6 && settings.subs.g6_memory)) return "半導體業";
  return stock.domain;
}

export function scoreStock(stock: StockInput, settings: Settings): Omit<ScoredStock, "tier" | "reasons"> {
  const safe = normalizeSettings(settings);
  const system = systemScore(stock, safe);
  const canslim = scoreCanslim(stock, safe);
  const graham = assessGraham(stock.quality, {
    on: safe.grahamOn,
    peMax: safe.grahamPeMax,
    pbMax: safe.grahamPbMax,
    productMax: safe.grahamProductMax,
    currentMin: safe.grahamCurrentMin,
  });
  const pieces = piecesOf(stock, safe, system, canslim);
  const veto = vetoReasons(stock, safe).length > 0;
  const stars = starsFrom(system.score, veto);
  const sum = system.score;
  const avg = system.score;
  const light = finalLight(stock, safe);
  return {
    stock,
    light,
    risk: riskStatus(stock, safe),
    system,
    canslim,
    graham,
    pieces,
    sum,
    avg,
    stars,
    combo: comboText(stars, light, veto),
    capDomain: capDomain(stock, safe),
  };
}

function failReasons(stock: StockInput, settings: Settings): string[] {
  const reasons: string[] = [];
  if (settings.gates.g1) {
    if (settings.subs.g1_listed && stock.market !== "sii" && stock.market !== "otc") {
      reasons.push("不是上市櫃普通股");
    }
    if (settings.subs.g1_liquidity && !(Number(stock.turnover60) > 0.8)) {
      reasons.push("流動性不足（60日均成交未高於 0.8 億元）");
    }
  }
  if (settings.gates.g4 && settings.subs.g4_completeness && !(stock.completeness >= 70)) {
    reasons.push("資料完整度未達 70%");
  }
  if (settings.gates.g5 && settings.subs.g5_timing) {
    const light = finalLight(stock, settings);
    if (light === "red") reasons.push("時機紅燈");
    else if (light === "yellow") reasons.push("時機黃燈");
  }
  return reasons;
}

export interface RankedBook {
  pool: ScoredStock[];
  core: ScoredStock[];
  reserve: ScoredStock[];
  fail: ScoredStock[];
  veto: ScoredStock[];
  header: string;
}

export function listHeader(settings: Settings): string {
  const safe = normalizeSettings(settings);
  const labels: Record<GateId, string> = { g1: "1", g2: "2", g3: "3", g4: "4", g5: "5", g6: "6" };
  const open = (Object.keys(labels) as GateId[]).filter((gate) => safe.gates[gate]).map((gate) => labels[gate]);
  const closed: string[] = [];
  if (!safe.gates.g1) closed.push("關卡1");
  else {
    if (!safe.subs.g1_listed) closed.push("上市櫃門檻");
    if (!safe.subs.g1_liquidity) closed.push("流動性");
  }
  if (!safe.gates.g3) closed.push("關卡3");
  else {
    if (!safe.subs.g3_dual) closed.push("雙排名");
    if (!safe.subs.g3_governance) closed.push("公司治理加分");
    if (!safe.subs.g3_penalty_cap) closed.push("扣分上限");
  }
  if (!safe.gates.g4) closed.push("關卡4");
  if (!safe.gates.g5) closed.push("關卡5");
  if (!safe.gates.g6) closed.push("關卡6");
  else {
    if (!safe.subs.g6_max30) closed.push("30家上限");
    if (!safe.subs.g6_sector5) closed.push("同領域5家");
    if (!safe.subs.g6_weight25) closed.push("25%上限");
    if (!safe.subs.g6_memory) closed.push("記憶體獨立");
  }
  const method = safe.rankingMethod === "magic" ? "排名：神奇公式" : "排名：本系統";
  const gateText =
    open.length === 6 && closed.length === 0
      ? "關卡 1 2 3 4 5 6 全開"
      : `關卡 ${open.join(" ") || "無"}${closed.length ? `｜已關閉：${closed.join("、")}` : ""}`;
  const canslim = safe.canslimGate ? tickedCanslimLabel(safe) : "CAN SLIM門檻關";
  const graham = safe.grahamGate ? "葛拉漢門檻開" : "葛拉漢門檻關";
  return `${gateText}｜${method}｜${canslim}｜${graham}`;
}

export function weightLine(settings: Settings): string {
  const safe = normalizeSettings(settings);
  const bits = CATEGORIES.map((item) => `${item.short}${safe.weights[item.key]}`);
  const total = weightTotal(safe.weights);
  return `本系統權重 ${bits.join(" ")}，合計 ${total}`;
}

export function tickedCanslimLabel(settings: Settings): string {
  const safe = normalizeSettings(settings);
  const on = CANSLIM_ORDER.filter((key) => safe.canslimOn[key]);
  const off = CANSLIM_ORDER.filter((key) => !safe.canslimOn[key]);
  if (off.length === 0) return `CAN SLIM勾選 ${on.join("、")}`;
  return `CAN SLIM勾選 ${on.join("、")}｜不看 ${off.join("、")}`;
}

export function canslimPasses(result: CanslimResult, settings: Settings): boolean {
  if (!settings.canslimGate) return true;
  const ticked = result.rows.filter((row) => settings.canslimOn[row.key]);
  return ticked.length > 0 && ticked.every((row) => row.pass);
}

export function canslimWeightLine(settings: Settings): string {
  const safe = normalizeSettings(settings);
  if (!safe.canslimGate) return `CAN SLIM 門檻關閉，不擋名單。${tickedCanslimLabel(safe)}`;
  return `CAN SLIM 只做門檻、不給分。${tickedCanslimLabel(safe)}`;
}

export function priorityBuys(pool: ScoredStock[]): ScoredStock[] {
  return pool.filter((row) => row.light === "green").slice(0, 5);
}

export function rankUniverse(stocks: StockInput[], settings: Settings): RankedBook {
  const safe = normalizeSettings(settings);
  const veto: ScoredStock[] = [];
  const fail: ScoredStock[] = [];
  const eligible: ScoredStock[] = [];
  for (const stock of stocks) {
    const base = scoreStock(stock, safe);
    const vetoes = vetoReasons(stock, safe);
    if (vetoes.length) {
      veto.push({ ...base, tier: "veto", reasons: vetoes });
      continue;
    }
    const failed = failReasons(stock, safe);
    if (!canslimPasses(base.canslim, safe)) failed.push("CAN SLIM 勾選條件未全過");
    if (!rulePasses(base.graham, safe.grahamGate)) failed.push("葛拉漢勾選條件未全過");
    if (failed.length) {
      fail.push({ ...base, tier: "fail", reasons: failed });
      continue;
    }
    eligible.push({ ...base, tier: "core", reasons: [] });
  }
  const byScore = (a: ScoredStock, b: ScoredStock) => {
    const av = a.sum == null ? Number.NEGATIVE_INFINITY : a.sum;
    const bv = b.sum == null ? Number.NEGATIVE_INFINITY : b.sum;
    if (bv !== av) return bv - av;
    return a.stock.id.localeCompare(b.stock.id);
  };
  eligible.sort(byScore);
  fail.sort(byScore);
  veto.sort(byScore);

  const core: ScoredStock[] = [];
  const reserve: ScoredStock[] = [];
  const counts: Record<string, number> = {};
  for (const row of eligible) {
    const reasons: string[] = [];
    if (safe.gates.g6 && safe.subs.g6_max30 && core.length >= 30) reasons.push("超過 30 家");
    const count = counts[row.capDomain] || 0;
    if (safe.gates.g6 && safe.subs.g6_sector5 && count >= 5) reasons.push("同領域已達 5 家");
    if (reasons.length) {
      reserve.push({ ...row, tier: "reserve", reasons });
      continue;
    }
    core.push(row);
    counts[row.capDomain] = count + 1;
  }

  if (safe.gates.g6 && safe.subs.g6_weight25) {
    let guard = 0;
    while (core.length >= 4 && guard < 40) {
      guard += 1;
      const overcrowded = new Map<string, ScoredStock>();
      for (const domain of new Set(core.map((row) => row.capDomain))) {
        const members = core.filter((row) => row.capDomain === domain);
        if (members.length / core.length > 0.25) {
          const lowest = [...members].sort(byScore)[members.length - 1];
          overcrowded.set(domain, lowest);
        }
      }
      if (overcrowded.size === 0) break;
      const victim = [...overcrowded.values()].sort(byScore).at(-1)!;
      const index = core.findIndex((row) => row.stock.id === victim.stock.id);
      if (index < 0) break;
      core.splice(index, 1);
      reserve.push({ ...victim, tier: "reserve", reasons: ["領域資金超過 25%"] });
    }
    reserve.sort(byScore);
  }

  return { pool: eligible, core, reserve, fail, veto, header: listHeader(safe) };
}

export function overlapIds(left: string[], right: string[]): string[] {
  const have = new Set(right);
  return left.filter((id) => have.has(id));
}

export function lightLabel(light: Light): string {
  if (light === "green") return "綠燈・目前可以看";
  if (light === "yellow") return "黃燈・不建議現在買";
  return "紅燈・先別碰";
}

export function riskLabel(risk: "pass" | "warn" | "veto"): string {
  if (risk === "pass") return "通過";
  if (risk === "warn") return "有扣分提醒";
  return "觸發硬否決";
}
