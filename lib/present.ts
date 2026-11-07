import {
  CATEGORIES,
  ORIGIN_NOTES,
  type Light,
  type ScoredStock,
  type Settings,
  canslimWeightLine,
  lightLabel,
  missingPhrase,
  riskLabel,
  round1,
  starLabel,
  weightLine,
} from "./engine";
import { rulePhrase } from "./masters";
import type { BundleStock } from "./types";

export { ORIGIN_NOTES };

export const GLOSSARY: Record<string, string> = {
  星等: "看公司體質。80 分以上五顆星，70、60、50 分各降一顆。分數不是叫你買賣。",
  燈號: "看現在的價格時機。綠燈是股價在月線上、月線在季線上；紅燈是跌破季線而且離高點很遠，或正在被處置。",
  硬否決: "只有三種：重大會計疑慮、連續四季自由現金流都是負的、當天被交易所處置。中了就剔除、不評星。",
  資料完整度: "已查到的項目占全部項目的比例。未滿 70% 不進排名；低於 60% 燈號最高只到黃燈。",
  自由現金流: "公司賺到的現金扣掉維持營運和資本支出之後剩下的錢。這裡用財報上的近四季數字。",
  ROE: "股東權益報酬率，看公司用股東的錢賺得兇不兇。",
  神奇公式: ORIGIN_NOTES.magic,
  "CAN SLIM": ORIGIN_NOTES.canslim,
  本系統: ORIGIN_NOTES.system,
  流動性: "用近 60 日平均每天成交金額，門檻是高於 0.8 億元。近 1 個月和近 6 個月分開取低的官方序列這份快照沒有，所以不用假數字補。",
};

const PART_LABEL: Record<string, string> = {
  品質_ROE: "ROE",
  品質_FCF: "自由現金流",
  品質_負債: "負債比",
  品質_四季GM同比: "毛利率",
  成長_單季營收: "單季營收",
  成長_單季淨利: "單季淨利",
  成長_月營收: "月營收",
  成長_連三月: "連三月營收",
  國際接軌: "國際接軌",
  估值: "估值",
  籌碼_20日: "20日法人",
  籌碼_大戶融資: "大戶與融資",
  產業技術: "產業技術",
  價格_60MA: "季線",
  價格_RS: "相對強弱",
  價格_量能: "量能",
};

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "未驗證";
  return value.toLocaleString("zh-TW", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function reasonLine(stock: BundleStock, key: string): string {
  const points = stock.parts[key] ?? 0;
  if (key === "品質_ROE" && stock.roe != null) {
    return `ROE ${fmt(stock.roe)}%（財報 ${stock.reportQuarter}），這項 ${points} 分。來源：公開資訊觀測站。`;
  }
  if (key === "品質_FCF" && stock.fcfTtm != null) {
    return `近四季自由現金流合計 ${fmt(stock.fcfTtm)} 億元，這項 ${points} 分。日期對應財報 ${stock.reportQuarter}。`;
  }
  if (key === "品質_負債" && stock.debt != null) {
    return `負債比 ${fmt(stock.debt)}%，這項 ${points} 分。`;
  }
  if (key === "成長_月營收" && stock.revenueYoy != null) {
    return `月營收年增 ${fmt(stock.revenueYoy)}%（${stock.revenueMonth}），這項 ${points} 分。來源：公開資訊觀測站月營收。`;
  }
  if (key === "成長_連三月") {
    return `近三月營收年增：${stock.revenueRecent}，這項 ${points} 分。`;
  }
  if (key === "籌碼_20日" && stock.inst20 != null) {
    return `20 日外資加投信淨買超 ${fmt(stock.inst20, 0)} 股（${stock.instWindow}），這項 ${points} 分。`;
  }
  if (key === "價格_RS" && stock.rs3m != null) {
    return `近 3 個月相對加權指數 ${fmt(stock.rs3m)} 個百分點，這項 ${points} 分。`;
  }
  if (key === "國際接軌") {
    return points > 0
      ? `國際接軌拿到 ${points} 分。證據：${stock.intlText}（${stock.intlDate}）。`
      : "國際接軌 0 分。具名合作或訂單沒有完整驗證。";
  }
  return `${PART_LABEL[key] || key} ${points} 分。`;
}

export function topReasons(stock: BundleStock): string[] {
  return Object.entries(stock.parts)
    .filter(([, points]) => points > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key]) => reasonLine(stock, key));
}

export function missedPoints(stock: BundleStock): string[] {
  return Object.entries(stock.parts)
    .filter(([, points]) => points <= 0)
    .map(([key]) => {
      const unverified = stock.unverifiedItems.some((item) => item.includes(key.split("_")[0]) || item.includes(PART_LABEL[key] || "___"));
      return `${PART_LABEL[key] || key}：0 分${unverified ? "（相關子項有未驗證）" : ""}`;
    });
}

export interface ExpertView {
  id: number;
  name: string;
  status: "pass" | "fail" | "unverified" | "note";
  text: string;
}

export function experts(stock: BundleStock): ExpertView[] {
  const roeOk = stock.roe != null && stock.roe > 15;
  const debtOk = stock.debt != null && stock.debt < 50;
  const fcfOk = stock.fcfTtm != null && stock.fcfTtm > 0;
  const yoy = stock.revenueYoy;
  const months = (stock.revenueRecent || "")
    .split("/")
    .map((part) => part.split(":")[1] || "")
    .map((part) => Number(String(part).replace("%", "").trim()))
    .filter((value) => !Number.isNaN(value));
  const threeUp = months.length >= 3 && months.every((value) => value > 0);
  return [
    {
      id: 1,
      name: "產業趨勢研究員",
      status: "unverified",
      text: "產業 3 年複合成長和營收占比沒有在這份公開快照裡，這項不計分。",
    },
    {
      id: 2,
      name: "籌碼分析師",
      status: stock.inst20 == null ? "unverified" : stock.inst20 > 0 ? "pass" : "fail",
      text:
        stock.inst20 == null
          ? "20 日外資加投信沒有數字。"
          : `20 日外資加投信淨買超 ${fmt(stock.inst20, 0)} 股。融資使用率 ${stock.margin == null ? "未驗證" : `${fmt(stock.margin)}%`}。千張大戶週增減：${stock.bigHolderNote || "未驗證"}。`,
    },
    {
      id: 3,
      name: "國際資金觀察員",
      status: "unverified",
      text: "外資持股不等於 MSCI 權重或海外 ETF 加碼。這項維持未驗證。",
    },
    {
      id: 4,
      name: "供應鏈與訂單專家",
      status: stock.intlText.includes("未驗證") ? "unverified" : "note",
      text: `${stock.intlText}（${stock.intlDate}，${stock.intlSource}）`,
    },
    {
      id: 5,
      name: "基本面分析師",
      status: roeOk && debtOk && fcfOk ? "pass" : "fail",
      text: `ROE ${fmt(stock.roe)}%、負債比 ${fmt(stock.debt)}%、自由現金流 TTM ${fmt(stock.fcfTtm)} 億元。門檻是 ROE 大於 15、負債比低於 50、自由現金流為正。`,
    },
    {
      id: 6,
      name: "科技前瞻專家",
      status: stock.rd == null ? "unverified" : stock.rd > 5 ? "pass" : "fail",
      text:
        stock.rd == null
          ? `研發占營收未驗證（${stock.rdPeriod || "無期間"}）。量產與護城河沒有另計分數。`
          : `研發占營收 ${fmt(stock.rd)}%（${stock.rdPeriod}）。超過 5% 才過這一個門檻，不代表護城河已驗證。`,
    },
    {
      id: 7,
      name: "技術面分析師",
      status: stock.close != null && stock.ma60 != null && stock.close > stock.ma60 ? "pass" : "fail",
      text: `收盤 ${fmt(stock.close)}、20 日均價 ${fmt(stock.ma20)}、60 日均價 ${fmt(stock.ma60)}（${stock.priceDate}）。近 3 個月相對大盤 ${fmt(stock.rs3m)} 個百分點。`,
    },
    {
      id: 8,
      name: "風險控管長",
      status: (stock.turnover60 || 0) > 1 && stock.mdd != null && stock.mdd < 40 ? "pass" : "fail",
      text: `60 日均成交 ${fmt(stock.turnover60)} 億元。一年最大跌幅參考 ${fmt(stock.mdd)}%。`,
    },
    {
      id: 9,
      name: "總經策略師",
      status: "unverified",
      text: "利率、匯率、油價敏感度沒有測量值。台塑化的油價扣分是研究註記，不是已測到的 beta。",
    },
    {
      id: 10,
      name: "另類數據分析師",
      status: threeUp ? "pass" : "fail",
      text: threeUp
        ? `近三月營收年增都是正的：${stock.revenueRecent}。客戶資本支出沒有另驗證。`
        : `近三月營收沒有連續為正，或數字不足：${stock.revenueRecent || "未驗證"}。`,
    },
    {
      id: 11,
      name: "基金經理人",
      status: "unverified",
      text: `官方本益比 ${fmt(stock.pe)}（${stock.priceDate}）。同業中位數和 PEG 未驗證，所以估值不加分。`,
    },
    {
      id: 12,
      name: "首席策略長",
      status: "note",
      text: "只整理其他人的結論，不另投一票，也不另給分數。",
    },
    {
      id: 13,
      name: "國際財經新聞專家",
      status: "unverified",
      text: "沒有把新聞寫進分數。沒有已核對的美國龍頭發言可引用。",
    },
    {
      id: 14,
      name: "台灣財經新聞專家",
      status: "unverified",
      text: "沒有內建新聞。法說會與產業報導要自行貼上，而且不計分。",
    },
    {
      id: 15,
      name: "台灣政治與政策專家",
      status: "unverified",
      text: "沒有足夠的政策文件可對這檔打分。",
    },
    {
      id: 16,
      name: "法遵與資訊揭露專家",
      status: stock.auditor.includes("無保留") ? "pass" : "note",
      text: `會計師意見：${stock.auditor}（${stock.auditorQuarter}，報告日 ${stock.auditorDate}）。初查：${stock.accountingStatus}`,
    },
    {
      id: 17,
      name: "量化回測分析師",
      status: "unverified",
      text: "這套權重還沒有回測。可以看的只有已驗證的一年最大跌幅，沒有模擬報酬。",
    },
    {
      id: 18,
      name: "會計鑑識專家",
      status: stock.forensic.includes("未觸門檻") ? "pass" : "note",
      text: `已核指標：${stock.forensic}。營運現金對淨利 ${fmt(stock.ocfNi)}。`,
    },
  ];
}

export function technicalLights(stock: BundleStock): { name: string; light: Light | "none"; detail: string }[] {
  const above =
    stock.close != null && stock.ma20 != null && stock.ma60 != null && stock.close > stock.ma20 && stock.ma20 > stock.ma60;
  const stretch =
    stock.close != null && stock.ma20 != null && stock.ma20 !== 0 && (stock.close - stock.ma20) / stock.ma20 > 0.15;
  return [
    {
      name: "均線排列",
      light: above ? "green" : "yellow",
      detail: `收盤 ${fmt(stock.close)}、月線 ${fmt(stock.ma20)}、季線 ${fmt(stock.ma60)}。`,
    },
    {
      name: "量價配合",
      light: "none",
      detail: "上漲日量相對 20 日均量沒有逐日資料，這盞燈未驗證。",
    },
    {
      name: "相對強弱",
      light: stock.rs3m == null ? "none" : stock.rs3m > 0 ? "green" : "yellow",
      detail: stock.rs3m == null ? "近 3 個月相對大盤未驗證。" : `相對加權指數 ${fmt(stock.rs3m)} 個百分點。`,
    },
    {
      name: "距 52 週高點",
      light: stock.drawdown52 == null ? "none" : stock.drawdown52 <= 15 ? "green" : "yellow",
      detail:
        stock.drawdown52 == null
          ? "52 週高點未驗證。"
          : `參考價鏈高點 ${stock.high52}，回落 ${fmt(stock.drawdown52)}%（${stock.lightDate}）。`,
    },
    {
      name: "乖離率",
      light: stock.close == null || stock.ma20 == null ? "none" : stretch ? "yellow" : "green",
      detail: stretch ? "股價比月線高出 15% 以上，別追高。" : "沒有比月線高出 15% 以上。",
    },
  ];
}

export interface CheckRow {
  label: string;
  status: "yes" | "no" | "unverified";
  detail: string;
}

export function entryChecks(stock: BundleStock): CheckRow[] {
  const months = (stock.revenueRecent || "")
    .split("/")
    .map((part) => Number(String(part.split(":")[1] || "").replace("%", "").trim()))
    .filter((value) => !Number.isNaN(value));
  return [
    {
      label: "月營收年增超過 20%",
      status: stock.revenueYoy == null ? "unverified" : stock.revenueYoy > 20 ? "yes" : "no",
      detail: stock.revenueYoy == null ? "沒有年增率" : `${fmt(stock.revenueYoy)}%（${stock.revenueMonth}）`,
    },
    {
      label: "外資加投信連續 5 日買超",
      status: "unverified",
      detail: "只有 20 日合計，沒有連續 5 個交易日各自的買賣超，不能當成符合或不符合。",
    },
    {
      label: "新的國際訂單",
      status: "unverified",
      detail: stock.intlText.includes("未驗證")
        ? "沒有已驗證的新訂單。"
        : `${stock.intlText}。認證或協議不等於新訂單，這項仍不計成符合。`,
    },
    {
      label: "股價站上月線",
      status: stock.close != null && stock.ma20 != null ? (stock.close > stock.ma20 ? "yes" : "no") : "unverified",
      detail: `收盤 ${fmt(stock.close)}、20 日均價 ${fmt(stock.ma20)}（${stock.priceDate}）。`,
    },
    {
      label: "近 3 個月漲幅贏過大盤",
      status: stock.rs3m == null ? "unverified" : stock.rs3m > 0 ? "yes" : "no",
      detail: stock.rs3m == null ? "相對大盤未驗證。" : `${fmt(stock.rs3m)} 個百分點。`,
    },
  ];
  void months;
}

export function exitChecks(stock: BundleStock, cost: number | null): CheckRow[] {
  const months = (stock.revenueRecent || "")
    .split("/")
    .map((part) => Number(String(part.split(":")[1] || "").replace("%", "").trim()))
    .filter((value) => !Number.isNaN(value));
  const lastTwo = months.slice(-2);
  const down = lastTwo.length === 2 && lastTwo.every((value) => value < 0);
  let costStatus: CheckRow["status"] = "unverified";
  let costDetail = "這檔不在持股裡，沒有成本可算。";
  if (cost != null && stock.close != null && cost > 0) {
    const drop = (cost - stock.close) / cost;
    costStatus = drop >= 0.1 ? "yes" : "no";
    costDetail = `現價 ${fmt(stock.close)}、成本 ${fmt(cost)}，較成本 ${fmt(drop * 100)}%。`;
  }
  return [
    {
      label: "月營收連 2 個月衰退",
      status: lastTwo.length < 2 ? "unverified" : down ? "yes" : "no",
      detail: stock.revenueRecent || "沒有近月年增",
    },
    {
      label: "法人連 5 日同步賣超",
      status: "unverified",
      detail: "沒有連續 5 日的三大法人明細。",
    },
    { label: "比成本低 10%–15% 或更多", status: costStatus, detail: costDetail },
    { label: "失去重要客戶", status: "unverified", detail: "沒有已驗證的客戶流失公告。" },
  ];
}

export function shareText(row: ScoredStock, stock: BundleStock, settings: Settings, magic = "神奇公式排名：未驗證（獨立名單，不進累加）"): string {
  const reasons = topReasons(stock);
  const lines = [
    `【排雷選股】${stock.id} ${stock.name}`,
    weightLine(settings),
    canslimWeightLine(settings),
    magic,
    ...row.pieces.map((piece) => {
      if (!piece.selected) return `${piece.label}：未勾選`;
      if (piece.score == null) return `${piece.label}：未驗證（不計入）`;
      if (piece.key === "canslim") {
        const gap = missingPhrase(row.canslim);
        return `CAN SLIM 門檻：${row.canslim.qualified ? "通過" : "沒過"}（不給分${gap ? `，${gap}` : ""}）`;
      }
      return `${piece.label}：${round1(piece.score)}`;
    }),
    `本系統分數：${round1(row.system.score)}｜星等只看本系統：${starLabel(row.stars)}｜${lightLabel(row.light)}｜風險：${riskLabel(row.risk)}`,
    rulePhrase("葛拉漢", row.graham, settings.grahamGate),
    `系統結論：${row.combo}。${stock.reasonText}`,
    "前 3 個理由：",
    ...reasons.map((reason, index) => `${index + 1}. ${reason}`),
    `來源與日期：種子分數重算 ${stock.recalcDate}；股價 ${stock.priceDate} ${stock.priceSource}；營收 ${stock.revenueMonth} ${stock.revenueSource}；財報 ${stock.reportQuarter}。`,
    "分數不等於買賣建議。沒有自動下單。",
  ];
  return lines.join("\n");
}

export function listShareText(rows: ScoredStock[], stocks: Map<string, BundleStock>, settings: Settings): string {
  const head = [`【排雷選股】名單摘要`, weightLine(settings), "分數不等於買賣建議。沒有自動下單。"];
  const body = rows.slice(0, 10).map((row, index) => {
    const stock = stocks.get(row.stock.id)!;
    const bits = row.pieces
      .filter((piece) => piece.selected)
      .map((piece) => `${piece.label}${piece.score == null ? "未驗證" : round1(piece.score)}`)
      .join("／");
    const gap = missingPhrase(row.canslim);
    return `${index + 1}. ${stock.id} ${stock.name} ${bits} ${gap} 平均${round1(row.avg)} ${starLabel(row.stars)} ${lightLabel(row.light)}`.replace(/\s+/g, " ");
  });
  if (rows.length === 0) body.push("目前沒有通過關卡的公司，未用到的部位留現金，不硬湊。");
  return [...head, ...body].join("\n");
}

export function reportLines(row: ScoredStock, stock: BundleStock, settings: Settings): string[] {
  const weights = row.system.rows
    .map((item) => `${item.short}${item.input}${item.included ? `→計算${round1(item.scaled)}` : "排除"}`)
    .join(" ");
  return [
    ...shareText(row, stock, settings).split("\n"),
    `這檔實際權重：${weights}`,
    `種子快照分數：${round1(stock.systemSeed)}（不隨權重改變）`,
    `計算式：${row.system.formula}`,
    `最大風險：${stock.riskText}`,
    `資料完整度：${fmt(stock.completeness, 1)}%`,
    `燈號理由：${stock.lightReason}（${stock.lightDate}）`,
  ];
}

export function categoryHelp(): string {
  return CATEGORIES.map((item) => `${item.short}${item.max}`).join("、");
}
