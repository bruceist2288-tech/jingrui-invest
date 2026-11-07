export const GRAHAM_NOTE = "巴菲特的老師。用遠低於價值的價格買、留安全邊際，重便宜。";
export const GRAHAM_TRADEOFF =
  "好處是安全邊際高的排前面。限制是葛拉漢數用 22.5 乘上每股盈餘與每股淨值再開根號，每股盈餘用收盤價除以官方本益比、每股淨值用收盤價除以官方股價淨值，這是我們的換算，不是公司另公布的原值。本益比或股價淨值沒有、或算出來的盈餘或淨值為負，就列未驗證、不適用，不進這張排名。";

export interface GrahamInput {
  price: number | null;
  pe: number | null;
  pb: number | null;
  priceDate: string | null;
  priceSource: string | null;
  valuationDate: string | null;
  valuationSource: string | null;
}

export interface GrahamResult {
  state: "ranked" | "excluded";
  reason: string;
  grahamNumber: number | null;
  price: number | null;
  margin: number | null;
  eps: number | null;
  bvps: number | null;
  pe: number | null;
  pb: number | null;
  priceDate: string | null;
  priceSource: string | null;
  valuationDate: string | null;
  valuationSource: string | null;
}

export function computeGraham(input: GrahamInput): GrahamResult {
  const base = {
    grahamNumber: null,
    price: input.price,
    margin: null,
    eps: null,
    bvps: null,
    pe: input.pe,
    pb: input.pb,
    priceDate: input.priceDate,
    priceSource: input.priceSource,
    valuationDate: input.valuationDate,
    valuationSource: input.valuationSource,
  };
  if (input.price == null || input.price <= 0) {
    return { ...base, state: "excluded", reason: "未驗證/不適用：股價沒有" };
  }
  if (input.pe == null || input.pb == null) {
    return { ...base, state: "excluded", reason: "未驗證/不適用：官方本益比或股價淨值沒有" };
  }
  if (input.pe <= 0 || input.pb <= 0) {
    return { ...base, state: "excluded", reason: "未驗證/不適用：每股盈餘或每股淨值為負" };
  }
  const eps = input.price / input.pe;
  const bvps = input.price / input.pb;
  const grahamNumber = Math.sqrt(22.5 * eps * bvps);
  if (!Number.isFinite(grahamNumber) || grahamNumber <= 0) {
    return { ...base, eps, bvps, state: "excluded", reason: "未驗證/不適用：葛拉漢數算不出來" };
  }
  return {
    ...base,
    state: "ranked",
    reason: "",
    grahamNumber,
    eps,
    bvps,
    margin: (grahamNumber - input.price) / grahamNumber,
  };
}

export const BUFFETT_NOTE = "依巴菲特公開原則量化，非本人公式；權重為我們訂定、未回測。";
export const BUFFETT_TRADEOFF = "好處是把品質和現金流折現放在同一張分數表。限制是沒有連續多年 ROE，這項先排除；折現率和成長率是你設的假設，不是財報數字。";

export interface BuffettFacts {
  roe: number | null;
  debt: number | null;
  fcfQuarters: { q: string; v: number | null }[];
  fcfTtm: number | null;
  gmTrend: string;
  mcapBillion: number | null;
  reportQuarter: string;
  priceDate: string;
  statementSource: string;
  fcfSource: string;
}

export interface BuffettAssumptions {
  weights: { roe: number; debt: number; fcf: number; margin: number; dcf: number };
  roeMin: number;
  debtCap: number;
  growth: number;
  discount: number;
}

export interface BuffettItem {
  key: "roe" | "debt" | "fcf" | "margin" | "dcf";
  label: string;
  status: "verified" | "unverified";
  score: number | null;
  weight: number;
  scaled: number;
  detail: string;
  source: string | null;
  date: string | null;
}

export interface BuffettResult {
  score: number | null;
  completeness: number;
  verifiedWeight: number;
  items: BuffettItem[];
}

export const DEFAULT_BUFFETT_WEIGHTS: BuffettAssumptions["weights"] = {
  roe: 20,
  debt: 15,
  fcf: 15,
  margin: 10,
  dcf: 40,
};

function parseMargins(text: string): { period: string; value: number }[] {
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

export function computeBuffett(stock: BuffettFacts, assumptions: BuffettAssumptions): BuffettResult {
  const raw = assumptions.weights;
  const sumW = Math.max(0, raw.roe) + Math.max(0, raw.debt) + Math.max(0, raw.fcf) + Math.max(0, raw.margin) + Math.max(0, raw.dcf);
  const scale = sumW > 0 ? 100 / sumW : 0;
  const weight = {
    roe: Math.max(0, raw.roe) * scale,
    debt: Math.max(0, raw.debt) * scale,
    fcf: Math.max(0, raw.fcf) * scale,
    margin: Math.max(0, raw.margin) * scale,
    dcf: Math.max(0, raw.dcf) * scale,
  };
  const items: BuffettItem[] = [];
  items.push({
    key: "roe",
    label: "長期 ROE",
    status: "unverified",
    score: null,
    weight: weight.roe,
    scaled: 0,
    detail: stock.roe == null
      ? "沒有 ROE，未驗證。"
      : `只驗到 1 個 ROE ${stock.roe}%（${stock.reportQuarter}），沒有連續多年，不能評「長期穩定」。這項排除。`,
    source: stock.roe == null ? null : stock.statementSource,
    date: stock.roe == null ? null : stock.reportQuarter,
  });
  if (stock.debt == null) {
    items.push({ key: "debt", label: "低負債", status: "unverified", score: null, weight: weight.debt, scaled: 0, detail: "沒有負債比，未驗證。", source: null, date: null });
  } else {
    const score = stock.debt >= assumptions.debtCap ? 0 : 100 * (1 - stock.debt / assumptions.debtCap);
    items.push({
      key: "debt",
      label: "低負債",
      status: "verified",
      score,
      weight: weight.debt,
      scaled: 0,
      detail: `負債比 ${stock.debt.toFixed(2)}%（${stock.reportQuarter}）。低於 ${assumptions.debtCap}% 才有分，越低越高。`,
      source: stock.statementSource,
      date: stock.reportQuarter,
    });
  }
  const fcf = stock.fcfQuarters.filter((item) => item.v != null);
  if (fcf.length < 2) {
    items.push({ key: "fcf", label: "自由現金流", status: "unverified", score: null, weight: weight.fcf, scaled: 0, detail: "近期自由現金流少於兩季，未驗證。", source: null, date: null });
  } else {
    const positive = fcf.filter((item) => (item.v as number) > 0).length;
    const first = fcf[0].v as number;
    const last = fcf[fcf.length - 1].v as number;
    let score = (positive / fcf.length) * 100;
    if (last < first) score *= 0.5;
    items.push({
      key: "fcf",
      label: "自由現金流",
      status: "verified",
      score,
      weight: weight.fcf,
      scaled: 0,
      detail: `近 ${fcf.length} 季有 ${positive} 季為正，首季 ${first}、末季 ${last}（億元）。沒有年度序列，這是季度近似。末季低於首季時分數減半。`,
      source: stock.fcfSource,
      date: fcf[fcf.length - 1].q,
    });
  }
  const margins = parseMargins(stock.gmTrend);
  if (margins.length < 2) {
    items.push({ key: "margin", label: "毛利率", status: "unverified", score: null, weight: weight.margin, scaled: 0, detail: "毛利率序列不足，未驗證。", source: null, date: null });
  } else {
    const first = margins[0];
    const last = margins[margins.length - 1];
    const score = last.value >= first.value ? 100 : Math.max(0, Math.min(100, first.value === 0 ? 0 : (last.value / first.value) * 100));
    items.push({
      key: "margin",
      label: "毛利率",
      status: "verified",
      score,
      weight: weight.margin,
      scaled: 0,
      detail: `${first.period} ${first.value.toFixed(2)}% → ${last.period} ${last.value.toFixed(2)}%。持平或上升給滿分。`,
      source: stock.statementSource,
      date: last.period,
    });
  }
  const g = assumptions.growth;
  const r = assumptions.discount;
  if (stock.fcfTtm == null || stock.fcfTtm <= 0 || stock.mcapBillion == null || stock.mcapBillion <= 0 || !(r > g)) {
    items.push({
      key: "dcf",
      label: "現金流折現",
      status: "unverified",
      score: null,
      weight: weight.dcf,
      scaled: 0,
      detail: "近四季自由現金流或市值不足，或折現率沒有高過成長率，無法折現。未驗證。",
      source: null,
      date: null,
    });
  } else {
    const value = (stock.fcfTtm * (1 + g)) / (r - g);
    const margin = (value - stock.mcapBillion) / value;
    const score = Math.max(0, Math.min(100, (margin / 0.5) * 100));
    items.push({
      key: "dcf",
      label: "現金流折現",
      status: "verified",
      score,
      weight: weight.dcf,
      scaled: 0,
      detail: `假設成長 ${(g * 100).toFixed(1)}%、折現 ${(r * 100).toFixed(1)}%。自由現金流 ${stock.fcfTtm.toFixed(2)} 億、市值 ${stock.mcapBillion.toFixed(2)} 億，折現價值 ${value.toFixed(2)} 億，相對折價 ${(margin * 100).toFixed(1)}%。折價 50% 給滿分。`,
      source: stock.fcfSource,
      date: stock.priceDate,
    });
  }
  const verified = items.filter((item) => item.status === "verified" && item.score != null);
  const verifiedWeight = verified.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    item.scaled = item.status === "verified" && verifiedWeight > 0 ? (item.weight / verifiedWeight) * 100 : 0;
  }
  const score = verifiedWeight > 0 ? verified.reduce((sum, item) => sum + ((item.score as number) / 100) * item.scaled, 0) : null;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  return { score, completeness: totalWeight > 0 ? (verifiedWeight / totalWeight) * 100 : 0, verifiedWeight, items };
}

export function buffettLine(result: BuffettResult): string {
  if (result.score == null) return "巴菲特：未驗證，可計分項目不足，不進這張排名。";
  const bits = result.items.map((item) => `${item.label}${item.status === "verified" ? item.score?.toFixed(0) : "未驗證"}`).join("、");
  return `巴菲特 ${result.score.toFixed(1)} 分（完整度 ${result.completeness.toFixed(0)}%，已驗證項目才計入）。${bits}。${BUFFETT_NOTE}`;
}

export function grahamLine(result: GrahamResult, rank: number | null = null): string {
  if (result.state !== "ranked" || result.grahamNumber == null || result.price == null || result.margin == null) {
    return `葛拉漢：${result.reason || "未驗證/不適用"}`;
  }
  const marginPct = (result.margin * 100).toFixed(1);
  const place = rank == null ? "不在這次預備名單的名次裡" : `依安全邊際排名第 ${rank} 名`;
  return `葛拉漢數 ${result.grahamNumber.toFixed(2)}、股價 ${result.price.toFixed(2)}、安全邊際 ${marginPct}%（${place}）。每股盈餘 ${result.eps?.toFixed(2)}＝股價／本益比 ${result.pe}，每股淨值 ${result.bvps?.toFixed(2)}＝股價／股價淨值 ${result.pb}。股價 ${result.priceDate} ${result.priceSource}。本益比與股價淨值 ${result.valuationDate} ${result.valuationSource}。`;
}
