import { CATEGORIES, weightTotal, type MagicStatus, type ScoredStock, type Settings } from "./engine";
import type { BuffettResult, GrahamResult } from "./masters";
import type { BundleStock } from "./types";

export interface FormulaBlock {
  id: string;
  title: string;
  lines: string[];
}

function n(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "未驗證";
  return value.toFixed(digits);
}

export function formulaGuide(settings: Settings): FormulaBlock[] {
  const total = weightTotal(settings.weights);
  return [
    {
      id: "system",
      title: "本系統",
      lines: [
        "每一項先算完成比例。完成比例 = 已得點數 ÷ 該項可用滿分。",
        "權重再調成合計 100。調整後權重 = 原權重 ÷ 有納入的權重合計 × 100。",
        `預設七項是獲利 20、成長 20、國際 15、估值 15、籌碼 10、技術 10、動能 5，合計 95。七項都納入時，調整後權重 = 原權重 ÷ 95 × 100。`,
        `你現在設的權重合計是 ${total}。整項未驗證的先從分母拿掉，再用剩下的合計去除。缺資料不當成 0 分。`,
        "本系統分數 = 各項（完成比例 × 調整後權重）加總 − 風險扣分。扣分上限開啟時，最多扣 15 分。",
        "星等只看這個分數：80 以上 5 顆，70 以上 4 顆，60 以上 3 顆，50 以上 2 顆，其餘 1 顆。",
      ],
    },
    {
      id: "magic",
      title: "神奇公式",
      lines: [
        "資本報酬率 ROC = 近四季息稅前利潤 EBIT ÷ 投入資本。投入資本 = 淨營運資金 + 淨固定資產。",
        "盈餘殖利率 EY = 近四季 EBIT ÷ 企業價值。企業價值 = 市值 + 有息負債 − 超額現金。",
        "ROC 由高到低排名，EY 由高到低排名。綜合 = ROC 名次 + EY 名次，數字愈小愈前面。",
        "金融、保險、油電燃氣、公用事業依原法排除。沒有已驗證的 EBIT、投入資本或企業價值，就不排名，也不用 ROE 或本益比代替。",
      ],
    },
    {
      id: "graham",
      title: "葛拉漢",
      lines: [
        "每股盈餘 EPS = 收盤價 ÷ 官方本益比。",
        "每股淨值 BVPS = 收盤價 ÷ 官方股價淨值。",
        "葛拉漢數 Graham Number = √(22.5 × EPS × BVPS)。",
        "安全邊際 = (葛拉漢數 − 股價) ÷ 葛拉漢數。安全邊際愈高，名次愈前面。",
        "本益比或股價淨值沒有，或算出來的盈餘、淨值不是正數，就列未驗證、不適用，不進這張排名。",
      ],
    },
    {
      id: "buffett",
      title: "巴菲特",
      lines: [
        "依巴菲特公開原則量化，非本人公式。權重是我們訂的，沒有回測。",
        `長期 ROE：要連續多年 ROE ≥ ${settings.buffettRoeMin}%。只有單一年度或單季，這項排除，不計分。`,
        `低負債：負債比 < ${settings.buffettDebtCap}% 才有分。分數 = 100 × (1 − 負債比 ÷ ${settings.buffettDebtCap})。達到或超過上限就是 0 分。`,
        "自由現金流：至少兩季才計。分數 = 正數季數 ÷ 季數 × 100。末季低於首季，再乘上 0.5。",
        "毛利率：末期 ≥ 初期給 100 分，否則分數 = 100 × 末期毛利率 ÷ 初期毛利率。",
        `現金流折現：價值 = 近四季自由現金流 × (1 + 成長率) ÷ (折現率 − 成長率)。現在的假設是成長 ${(settings.buffettGrowth * 100).toFixed(1)}%、折現 ${(settings.buffettDiscount * 100).toFixed(1)}%。`,
        "折價 = (價值 − 市值) ÷ 價值。折現分數 = 折價 ÷ 0.5 × 100，最高 100、最低 0。折價 50% 才滿。",
        "自由現金流不是正數、市值沒有，或折現率沒有高過成長率，折現這項排除。",
        "未驗證項目先拿掉。分數 = 已驗證項目的（該項分數 ÷ 100 × 該項調整後權重）加總。完整度 = 已驗證權重 ÷ 全部權重。",
      ],
    },
    {
      id: "canslim",
      title: "CAN SLIM",
      lines: [
        "CAN SLIM 只做門檻，不給分數，也不加進任何排名。勾選的每一項都要過，才算通過。未驗證等於沒過。",
        "C 當季盈餘：最新一季每股盈餘比去年同季增加。沒有年增率就不算過。",
        "A 年度盈餘：近年年度每股盈餘要成長。沒有年度序列就不算過。",
        "N 新高：收盤價距 52 週高點的跌幅 ≤ 15% 才過。",
        "S 供需：要有流通股和量價結構。60 日成交金額只用於流動性關卡，不拿來充當這一項。",
        "L 領導：同業營收或市占前三名，要附來源和日期。不用全市場市值名次代替。",
        "I 法人：近 20 日外資加投信淨買超股數 > 0 才過。",
        "M 大盤：加權指數站在均線之上才過。交易日不夠判定方向就是未驗證。",
      ],
    },
  ];
}

export function stockCalculations(stock: BundleStock, row: ScoredStock, settings: Settings, graham: GrahamResult, buffett: BuffettResult, magic: MagicStatus | undefined): FormulaBlock[] {
  const total = weightTotal(settings.weights);
  const included = row.system.rows.filter((item) => item.included);
  const includedSum = included.reduce((sum, item) => sum + Math.max(0, item.input), 0);
  const systemLines = [
    "完成比例 = 已得點數 ÷ 該項可用滿分。",
    "調整後權重 = 原權重 ÷ 有納入的權重合計 × 100。",
    `預設權重合計 95。七項都納入時，調整後權重 = 原權重 ÷ 95 × 100。`,
    `這檔你設的權重合計 ${total}。有納入的原權重合計 ${includedSum}，所以這檔用的是原權重 ÷ ${includedSum} × 100。`,
    "本系統分數 = 各項（完成比例 × 調整後權重）加總 − 風險扣分。",
  ];
  for (const item of row.system.rows) {
    const category = CATEGORIES.find((entry) => entry.key === item.key);
    const partText = category ? category.parts.map((key) => `${key} ${n(stock.parts[key], 1)}`).join("、") : "";
    if (!item.included || item.ratio == null) {
      systemLines.push(`${item.label}：未驗證，這項排除，不把缺資料當 0 分。原權重 ${item.input}。${item.note}`);
      continue;
    }
    const got = item.ratio * item.scaled;
    systemLines.push(
      `${item.label}：已得 ${n(item.earned, 1)} 分，可用滿分 ${item.max}，完成比例 = ${n(item.earned, 1)} ÷ ${item.max} = ${n(item.ratio * 100, 1)}%。原權重 ${item.input}，調整後 ${n(item.scaled, 1)}，這項貢獻 ${n(got, 1)}。細項 ${partText}。${item.note}`,
    );
  }
  const pieces = included
    .filter((item) => item.ratio != null)
    .map((item) => n((item.ratio as number) * item.scaled, 1));
  systemLines.push(
    `加總 ${pieces.join(" + ") || "0"} − 風險扣分 ${n(row.system.penaltyApplied, 1)} = ${row.system.score == null ? "未驗證" : n(row.system.score, 1)}。原始風險扣分 ${n(stock.penalty, 1)}。`,
  );
  systemLines.push(`點數來源：財報 ${stock.reportQuarter} ${stock.statementSource}；股價 ${stock.priceDate} ${stock.priceSource}。種子快照分數 ${n(stock.systemSeed, 1)} 不隨權重改變。`);

  const magicLines = [
    "ROC = 近四季 EBIT ÷ 投入資本。EY = 近四季 EBIT ÷ 企業價值。",
    "綜合 = ROC 名次 + EY 名次。愈小愈前面。",
  ];
  if (!magic || magic.state === "unverified") {
    magicLines.push("這檔 ROC 未驗證，EY 也未驗證。沒有 ROC 名次，也沒有 EY 名次，所以不進神奇公式排名。沒有用 ROE 或本益比代替。");
  } else if (magic.state === "excluded") {
    magicLines.push(`這檔不列入。${magic.reason}。沒有 ROC 名次，也沒有 EY 名次。`);
  } else if (magic.state === "gated") {
    magicLines.push("這檔還沒通過目前關卡，不列入這張名單。ROC 與 EY 若之後有驗證數字，才會各自排名。");
  } else {
    magicLines.push(`這檔 ROC 名次第 ${magic.rocRank}，EY 名次第 ${magic.eyRank}。綜合 = ${magic.rocRank} + ${magic.eyRank} = ${magic.combined}。依綜合排名第 ${magic.rank} 名。`);
  }

  const grahamLines = [
    "EPS = 收盤價 ÷ 官方本益比。BVPS = 收盤價 ÷ 官方股價淨值。",
    "Graham Number = √(22.5 × EPS × BVPS)。",
    "安全邊際 = (Graham Number − 股價) ÷ Graham Number。",
  ];
  if (graham.state !== "ranked" || graham.grahamNumber == null || graham.eps == null || graham.bvps == null || graham.price == null || graham.margin == null) {
    grahamLines.push(`這檔：${graham.reason || "未驗證/不適用"}。`);
  } else {
    grahamLines.push(`股價 ${n(graham.price)}（${graham.priceDate || "無日期"}，${graham.priceSource || "無來源"}）。`);
    grahamLines.push(`本益比 ${graham.pe}、股價淨值 ${graham.pb}（${graham.valuationDate || "無日期"}，${graham.valuationSource || "無來源"}）。`);
    grahamLines.push(`EPS = ${n(graham.price)} ÷ ${graham.pe} = ${n(graham.eps)}。`);
    grahamLines.push(`BVPS = ${n(graham.price)} ÷ ${graham.pb} = ${n(graham.bvps)}。`);
    grahamLines.push(`Graham Number = √(22.5 × ${n(graham.eps)} × ${n(graham.bvps)}) = ${n(graham.grahamNumber)}。`);
    grahamLines.push(`安全邊際 = (${n(graham.grahamNumber)} − ${n(graham.price)}) ÷ ${n(graham.grahamNumber)} = ${n(graham.margin * 100, 1)}%。`);
  }

  const buffettLines = [
    "長期 ROE 要連續多年，單一年度排除。",
    `低負債分數 = 100 × (1 − 負債比 ÷ ${settings.buffettDebtCap})。`,
    "自由現金流分數 = 正數季數 ÷ 季數 × 100；末季低於首季再 × 0.5。",
    "毛利率：末期 ≥ 初期為 100，否則 100 × 末期 ÷ 初期。",
    `折現價值 = 近四季自由現金流 × (1 + ${(settings.buffettGrowth * 100).toFixed(1)}%) ÷ (${(settings.buffettDiscount * 100).toFixed(1)}% − ${(settings.buffettGrowth * 100).toFixed(1)}%)。`,
    "折現分數 = 折價 ÷ 0.5 × 100。折價 = (價值 − 市值) ÷ 價值。",
    "未驗證項目排除後，再把剩下的權重調成合計 100。",
  ];
  for (const item of buffett.items) {
    const source = item.source ? `來源 ${item.source}（${item.date || "無日期"}）。` : "";
    if (item.status !== "verified" || item.score == null) {
      buffettLines.push(`${item.label}：未驗證，這項排除。原權重 ${n(item.weight, 1)}。${item.detail}${source}`);
    } else {
      buffettLines.push(`${item.label}：這項 ${n(item.score, 1)} 分，原權重 ${n(item.weight, 1)}，納入後權重 ${n(item.scaled, 1)}，貢獻 ${n((item.score / 100) * item.scaled, 1)}。${item.detail}${source}`);
    }
  }
  buffettLines.push(
    `巴菲特分數 ${buffett.score == null ? "未驗證" : n(buffett.score, 1)}。完整度 ${n(buffett.completeness, 0)}% = 已驗證權重 ${n(buffett.verifiedWeight, 1)} ÷ 全部權重。`,
  );

  const canslimLines = [
    "勾選的條件全部通過才過門檻。這組不給分。未驗證 = 沒過。",
    "C：當季每股盈餘年增。A：年度每股盈餘成長。N：距 52 週高點 ≤ 15%。S：供需。L：同業營收或市占前三。I：20 日外資加投信 > 0。M：大盤在均線之上。",
  ];
  for (const item of row.canslim.rows) {
    const watched = settings.canslimOn[item.key] ? "有勾" : "沒勾，不擋名單";
    const outcome = !settings.canslimOn[item.key] ? "不看" : item.pass ? "過" : item.status === "unverified" ? "未驗證，沒過" : "查了但沒過";
    const source = item.source ? `來源 ${item.source}（${item.date || "無日期"}）。` : "沒有可引用的來源和日期。";
    canslimLines.push(`${item.key} ${item.label}：${watched}，結果 ${outcome}。${item.detail}${source}`);
  }
  canslimLines.push(`這檔門檻${row.canslim.qualified ? "通過" : "沒過"}。勾選 ${row.canslim.met} 項過，要求 ${row.canslim.minimum} 項。`);

  return [
    { id: "system", title: "公式與計算方式：本系統", lines: systemLines },
    { id: "magic", title: "公式與計算方式：神奇公式", lines: magicLines },
    { id: "graham", title: "公式與計算方式：葛拉漢", lines: grahamLines },
    { id: "buffett", title: "公式與計算方式：巴菲特", lines: buffettLines },
    { id: "canslim", title: "公式與計算方式：CAN SLIM", lines: canslimLines },
  ];
}

export function flattenFormulas(blocks: FormulaBlock[]): string[] {
  return blocks.flatMap((block) => [block.title, ...block.lines]);
}
