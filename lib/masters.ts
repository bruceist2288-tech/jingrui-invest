export interface QualityFacts {
  roe: number | null;
  debt: number | null;
  fcfQuarters: { q: string; v: number | null }[];
  gmTrend: string;
  pe: number | null;
  reportQuarter: string;
  priceDate: string;
  statementSource: string;
  peSource: string;
  fcfSource: string;
}

export interface RuleRow {
  key: string;
  label: string;
  status: "verified" | "unverified";
  pass: boolean;
  detail: string;
  source: string | null;
  date: string | null;
}

export interface RuleResult {
  qualified: boolean;
  met: number;
  checked: number;
  missing: RuleRow[];
  rows: RuleRow[];
}

export const GRAHAM_NOTE =
  "巴菲特的老師。用遠低於價值的價格買、留安全邊際，重便宜。";
export const GRAHAM_TRADEOFF =
  "好處是買得不夠便宜就不進場。限制是很多便宜指標這份種子沒有；沒有就標未驗證、不算過。這同樣是我們的量化近似，不是《智慧型股票投資人》的逐條原文。";

export interface GrahamCaps {
  on: { pe: boolean; pb: boolean; current: boolean; earnings: boolean; dividend: boolean };
  peMax: number;
  pbMax: number;
  productMax: number;
  currentMin: number;
}

export const DEFAULT_GRAHAM_ON: GrahamCaps["on"] = { pe: true, pb: true, current: true, earnings: true, dividend: true };

function unverified(key: string, label: string, detail: string): RuleRow {
  return { key, label, status: "unverified", pass: false, detail, source: null, date: null };
}

export function assessGraham(stock: QualityFacts, caps: GrahamCaps): RuleResult {
  const rows: RuleRow[] = [];
  if (stock.pe == null) {
    rows.push(unverified("pe", "本益比", "沒有官方本益比，未驗證。"));
  } else {
    rows.push({
      key: "pe",
      label: "本益比",
      status: "verified",
      pass: stock.pe > 0 && stock.pe <= caps.peMax,
      detail: `官方本益比 ${stock.pe}（${stock.priceDate}）。要大於 0 且 ≤ ${caps.peMax}。`,
      source: stock.peSource,
      date: stock.priceDate,
    });
  }
  rows.push(
    unverified(
      "pb",
      "股價淨值",
      `沒有股價淨值，也無法計算本益比 × 股價淨值是否 ≤ ${caps.productMax}。未驗證。門檻仍可調（淨值 ≤ ${caps.pbMax}）。`,
    ),
  );
  rows.push(unverified("current", "流動比率", `沒有流動比率。未驗證。門檻仍可調（≥ ${caps.currentMin}）。`));
  rows.push(unverified("earnings", "近年盈餘", "沒有近幾年稅後淨利序列。單季 ROE 的正負不能代替。未驗證。"));
  rows.push(unverified("dividend", "股利", "沒有股利發放紀錄。未驗證。"));
  return pack(rows, caps.on as Record<string, boolean>);
}

function pack(rows: RuleRow[], on: Record<string, boolean>): RuleResult {
  const ticked = rows.filter((row) => on[row.key] !== false);
  const missing = ticked.filter((row) => !row.pass);
  return {
    qualified: ticked.length > 0 && missing.length === 0,
    met: ticked.filter((row) => row.pass).length,
    checked: ticked.length,
    missing,
    rows,
  };
}

export function rulePasses(result: RuleResult, enabled: boolean): boolean {
  if (!enabled) return true;
  return result.qualified;
}

export function rulePhrase(name: string, result: RuleResult, enabled: boolean): string {
  if (!enabled) return `${name}門檻：關閉（不擋名單）`;
  if (result.qualified) return `${name}門檻：通過（不給分）`;
  const bits = result.missing.map((row) => `${row.label}${row.status === "unverified" ? "（未驗證）" : ""}`);
  return `${name}門檻：沒過（不給分），缺：${bits.join("、")}`;
}

export interface RuleMissRow {
  key: string;
  label: string;
  missed: number;
  unverified: number;
  failed: number;
  passed: number;
}

export function summarizeRules(results: RuleResult[]): RuleMissRow[] {
  const keys = results[0]?.rows.map((row) => ({ key: row.key, label: row.label })) || [];
  return keys.map((item) => {
    let unverified = 0;
    let failed = 0;
    let passed = 0;
    for (const result of results) {
      const row = result.rows.find((entry) => entry.key === item.key);
      if (!row || row.status !== "verified") unverified += 1;
      else if (row.pass) passed += 1;
      else failed += 1;
    }
    return { ...item, missed: unverified + failed, unverified, failed, passed };
  });
}
