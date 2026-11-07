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

export const BUFFETT_NOTE =
  "用合理價格買護城河深的好公司，長期持有，重品質。";
export const BUFFETT_TRADEOFF =
  "好處是少碰體質差的公司。限制是護城河沒有官方數字；下面是我們把公開原則量化的近似，不是巴菲特的原話清單。";
export const GRAHAM_NOTE =
  "巴菲特的老師。用遠低於價值的價格買、留安全邊際，重便宜。";
export const GRAHAM_TRADEOFF =
  "好處是買得不夠便宜就不進場。限制是很多便宜指標這份種子沒有；沒有就標未驗證、不算過。這同樣是我們的量化近似，不是《智慧型股票投資人》的逐條原文。";

export interface BuffettCaps {
  on: { roe: boolean; debt: boolean; fcf: boolean; margin: boolean };
  roeMin: number;
  debtMax: number;
}

export interface GrahamCaps {
  on: { pe: boolean; pb: boolean; current: boolean; earnings: boolean; dividend: boolean };
  peMax: number;
  pbMax: number;
  productMax: number;
  currentMin: number;
}

export const DEFAULT_BUFFETT_ON: BuffettCaps["on"] = { roe: true, debt: true, fcf: true, margin: true };
export const DEFAULT_GRAHAM_ON: GrahamCaps["on"] = { pe: true, pb: true, current: true, earnings: true, dividend: true };

function unverified(key: string, label: string, detail: string): RuleRow {
  return { key, label, status: "unverified", pass: false, detail, source: null, date: null };
}

function parseSeries(text: string): { period: string; value: number }[] {
  return (text || "")
    .split("/")
    .map((part) => part.trim())
    .map((part) => {
      const [period, raw] = part.split(":");
      const value = Number(String(raw || "").replace("%", "").trim());
      return { period: (period || "").trim(), value };
    })
    .filter((item) => item.period && Number.isFinite(item.value));
}

export function assessBuffett(stock: QualityFacts, caps: BuffettCaps): RuleResult {
  const rows: RuleRow[] = [];
  if (stock.roe == null) {
    rows.push(unverified("roe", "ROE", "沒有已驗證的 ROE，連一年都沒有，未驗證。"));
  } else {
    const pass = stock.roe >= caps.roeMin;
    rows.push({
      key: "roe",
      label: "ROE",
      status: "verified",
      pass,
      detail: `只驗到 1 個 ROE ${stock.roe}%（${stock.reportQuarter}），沒有連續五年。已驗到的要 ≥ ${caps.roeMin}%。`,
      source: stock.statementSource,
      date: stock.reportQuarter,
    });
  }
  if (stock.debt == null) {
    rows.push(unverified("debt", "負債比", "沒有負債比，未驗證。"));
  } else {
    rows.push({
      key: "debt",
      label: "負債比",
      status: "verified",
      pass: stock.debt < caps.debtMax,
      detail: `負債比 ${stock.debt}%（${stock.reportQuarter}）。要低於 ${caps.debtMax}%。`,
      source: stock.statementSource,
      date: stock.reportQuarter,
    });
  }
  const fcf = stock.fcfQuarters.filter((item) => item.v != null);
  if (fcf.length < 2) {
    rows.push(unverified("fcf", "自由現金流", "沒有足夠的近期自由現金流，也沒有年度序列，未驗證。"));
  } else {
    const positive = fcf.filter((item) => (item.v as number) > 0).length;
    rows.push({
      key: "fcf",
      label: "自由現金流",
      status: "verified",
      pass: positive / fcf.length > 0.5,
      detail: `近 ${fcf.length} 季裡 ${positive} 季為正。沒有年度自由現金流，這是用已驗證季度代替「近年」的近似，過半才算過。`,
      source: stock.fcfSource,
      date: fcf[fcf.length - 1]?.q || stock.reportQuarter,
    });
  }
  const margins = parseSeries(stock.gmTrend);
  if (margins.length < 2) {
    rows.push(unverified("margin", "毛利率", "毛利率序列不足，未驗證。"));
  } else {
    const first = margins[0];
    const last = margins[margins.length - 1];
    rows.push({
      key: "margin",
      label: "毛利率",
      status: "verified",
      pass: last.value >= first.value,
      detail: `${first.period} ${first.value}% → ${last.period} ${last.value}%。持平或上升才算過。這是四季，不是五年。`,
      source: stock.statementSource,
      date: last.period,
    });
  }
  return pack(rows, caps.on);
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
