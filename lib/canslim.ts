import type { CanslimItemInput, StockInput } from "./engine";
import type { BundleStock } from "./types";

export interface CanslimFacts {
  drawdown52: number | null;
  rs3m: number | null;
  inst20: number | null;
  lightDate: string;
  priceSource: string;
  instSource: string;
  instWindow: string;
}

function clip(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function unverified(key: CanslimItemInput["key"], detail: string): CanslimItemInput {
  return { key, status: "unverified", partial: null, pass: false, detail, source: null, date: null };
}

export function assessCanslim(stock: CanslimFacts): CanslimItemInput[] {
  const items: CanslimItemInput[] = [
    unverified("C", "沒有單季每股盈餘年增率。營收年增不能拿來代替。未驗證。"),
    unverified("A", "沒有連續年度每股盈餘。未驗證。"),
  ];
  if (stock.drawdown52 == null) {
    items.push(unverified("N", "52 週高點沒有數字。未驗證。"));
  } else {
    items.push({
      key: "N",
      status: "verified",
      partial: clip(100 - stock.drawdown52 * 2),
      pass: stock.drawdown52 <= 15,
      detail: `距 52 週高點 ${stock.drawdown52.toFixed(2)}%（參考價鏈，${stock.lightDate}）。15% 以內才算過。部分分數是依跌幅換算，不是 O'Neil 的原始分數。`,
      source: stock.priceSource,
      date: stock.lightDate,
    });
  }
  items.push(
    unverified("S", "流通股和量價結構沒有完整公開序列。60 日成交金額只用於流動性關卡，不拿來充當供需。未驗證。"),
  );
  items.push(
    unverified(
      "L",
      "L 要同業營收或市占前三名，不必是第一。沒有附來源和日期的同業排名，不能用全市場市值名次或相對大盤代替。未驗證，算沒過。",
    ),
  );
  if (stock.inst20 == null) {
    items.push(unverified("I", "20 日外資加投信沒有數字。未驗證。"));
  } else {
    items.push({
      key: "I",
      status: "verified",
      partial: stock.inst20 > 0 ? 80 : 40,
      pass: stock.inst20 > 0,
      detail: `20 日外資加投信淨買超 ${Math.round(stock.inst20).toLocaleString("zh-TW")} 股（${stock.instWindow}）。大於 0 才算過。`,
      source: stock.instSource,
      date: stock.instWindow,
    });
  }
  items.push(unverified("M", "加權指數的均線還沒有足夠交易日可判定方向。未驗證，這項算沒過。"));
  return items;
}

export function toInput(stock: BundleStock): StockInput {
  return {
    id: stock.id,
    name: stock.name,
    domain: stock.domain,
    market: stock.market,
    completeness: stock.completeness,
    turnover60: stock.turnover60,
    light: stock.light,
    penalty: stock.penalty,
    parts: stock.parts,
    unverifiedItems: stock.unverifiedItems,
    valueUnverified: stock.valueUnverified,
    fcfAllNegative: stock.fcfAllNegative,
    disposed: stock.disposed,
    accountingVeto: stock.accountingVeto,
    systemSeed: stock.systemSeed,
    canslimItems: assessCanslim(stock),
    magic: { score: stock.magic?.score ?? null },
    forensic: stock.forensic || "",
  };
}
