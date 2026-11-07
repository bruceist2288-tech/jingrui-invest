#!/usr/bin/env python3
"""Turn the research CSV into data/bundle.json. Does not invent figures."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "uploads" / "watchlist30_normalized_market_a414.csv"
OUT = ROOT / "data" / "bundle.json"

PART_KEYS = [
    "品質_ROE",
    "品質_FCF",
    "品質_負債",
    "品質_四季GM同比",
    "成長_單季營收",
    "成長_單季淨利",
    "成長_月營收",
    "成長_連三月",
    "國際接軌",
    "估值",
    "籌碼_20日",
    "籌碼_大戶融資",
    "產業技術",
    "價格_60MA",
    "價格_RS",
    "價格_量能",
]


def num(value: str | None):
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if text in {"", "未驗證", "—", "-", "N/A", "NA"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_fcf(text: str):
    rows = []
    for part in (text or "").split("/"):
        part = part.strip()
        if ":" not in part:
            continue
        quarter, raw = part.split(":", 1)
        rows.append({"q": quarter.strip(), "v": num(raw)})
    return rows


def parse_parts(text: str):
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = {}
    return {key: float(data.get(key) or 0) for key in PART_KEYS}


CANSLIM_DEFAULTS = [
    (
        "C",
        "當季盈餘",
        "公開彙總表目前看得到的是單一期累計損益，沒有去年同期每股盈餘，無法計算當季盈餘成長。",
    ),
    (
        "A",
        "年度盈餘",
        "沒有抓到連續數年的每股盈餘，無法計算年度盈餘成長。",
    ),
    (
        "N",
        "新高",
        "52 週新高要用來計算的日線還沒從證交所／櫃買抓進這份快照。新產品也沒有已驗證公告。這項先排除。",
    ),
    (
        "S",
        "供需",
        "供需要看一段時間的成交金額與籌碼，這份快照還沒有對應的公開日線統計。這項先排除。",
    ),
    (
        "L",
        "領導股",
        "相對強弱要有個股與大盤同一段期間的報酬，目前還沒有這段公開序列。這項先排除。",
    ),
    (
        "I",
        "法人認同",
        "近端每日三大法人買賣超還沒抓進快照，不能把種子裡的 20 日合計直接當成 CAN SLIM 分數。這項先排除。",
    ),
    (
        "M",
        "大盤方向",
        "大盤方向要有加權指數的均線，目前還沒有抓到足夠的公開交易日。這項先排除。",
    ),
]


def default_canslim():
    return {
        "score": None,
        "items": [
            {
                "key": key,
                "label": label,
                "status": "unverified",
                "score": None,
                "detail": detail,
                "source": None,
                "date": None,
            }
            for key, label, detail in CANSLIM_DEFAULTS
        ],
    }


def default_magic():
    return {
        "score": None,
        "note": "未驗證，不計入。Greenblatt 的資本報酬率要用營業利益除以投入資本，盈餘殖利率要用營業利益除以企業價值。公開彙總表沒有 TTM 營業利益，也沒有把無形資產、有息負債和現金拆開，不能用 ROE 或本益比代替。",
        "facts": [],
    }


def light_of(text: str) -> str:
    if text == "綠燈":
        return "green"
    if text == "黃燈":
        return "yellow"
    if text == "紅燈":
        return "red"
    raise SystemExit(f"unknown light: {text}")


def build():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    stocks = []
    for row in rows:
        parts = parse_parts(row["逐項分數"])
        fcf = parse_fcf(row["近4季FCF億元"])
        fcf_vals = [item["v"] for item in fcf]
        unverified = [item.strip() for item in (row["未驗證子項"] or "").split("、") if item.strip()]
        value_note = row.get("估值15分查核") or ""
        stocks.append(
            {
                "id": row["代號"],
                "name": row["名稱"],
                "domain": row["研究領域"],
                "industry": row["官方產業"],
                "market": row["市場"],
                "close": num(row["11月6日收盤"]),
                "ma20": num(row["20MA未還原"]),
                "ma60": num(row["60MA未還原"]),
                "avg3m": num(row["3月均價未還原"]),
                "avg6m": num(row["6月均價未還原"]),
                "revenueMonth": row["營收月份"],
                "revenueYoy": num(row["營收YoY%"]),
                "revenueRecent": row["近3月營收YoY"],
                "reportQuarter": row["財報季"],
                "roe": num(row["ROE%"]),
                "fcfQuarters": fcf,
                "fcfTtm": num(row["FCF_TTM億元"]),
                "fcfAllNegative": len(fcf_vals) >= 4 and all(v is not None and v < 0 for v in fcf_vals),
                "debt": num(row["負債比%"]),
                "pe": num(row["官方PE"]),
                "rd": num(row["R&D累計%"]),
                "rdPeriod": row["研發期間"],
                "systemSeed": num(row["正規化分數"]),
                "rawPoints": num(row["正項原始分_滿95"]),
                "verifiedMax": num(row["已驗證項最大點數"]),
                "penalty": num(row["風險扣分"]) or 0,
                "parts": parts,
                "unverifiedItems": unverified,
                "valueUnverified": ("估值" in "".join(unverified)) or ("未驗證" in value_note) or parts["估值"] == 0,
                "completeness": num(row["項數完整度%"]),
                "weightedCompleteness": num(row["加權完整度%"]),
                "verifiedCount": int(float(row["已驗證子項數"])),
                "itemCount": int(float(row["子項總數"])),
                "light": light_of(row["燈號"]),
                "lightReason": row["燈號理由"],
                "lightDate": row["燈號資料日期"],
                "seedStars": int(float(row["星數"])),
                "seedStarLabel": row["星等"],
                "growth": row["成長類型"],
                "growthNote": row["標籤性質"],
                "riskText": row["風險"],
                "reasonText": row["原因"],
                "auditor": row["最新季會計師意見"],
                "auditorKind": row["核閱意見類型"],
                "auditorQuarter": row["意見所屬季"],
                "auditorDate": row["核閱報告日"],
                "accountingStatus": row["會計初查狀態"],
                "disposal": row["目前處置"],
                "disposalFuture": row["未來處置"],
                "disposed": not str(row["目前處置"]).startswith("無"),
                "accountingVeto": "已判定重大會計" in (row["會計初查狀態"] or "") or "重大會計疑慮" in (row["否決"] or ""),
                "forensic": row["量化鑑識警訊"],
                "mdd": num(row["一年MDD參考價鏈調整%"]),
                "turnover60": num(row["60日均成交億元"]),
                "vol60": num(row["60日年化波動%"]),
                "rs3m": num(row["3月相對TAIEX百分點"]),
                "drawdown52": num(row["距52週高點跌幅%"]),
                "high52": row["52週高價_參考鏈調整"],
                "foreignPct": num(row["外陸資持股%"]),
                "foreignDate": row["外陸資持股日期"],
                "foreignSource": row["外陸資持股來源"],
                "foreignNote": row["外資口徑"],
                "inst20": num(row["20日外資加投信淨買股"]),
                "instWindow": row["法人20日區間"],
                "margin": num(row["融資使用率參考%"]),
                "marginDate": row["融資日期"],
                "marginSource": row["融資來源"],
                "marginNote": row["融資口徑"],
                "bigHolder": row["千張大戶持股%"],
                "bigHolderNote": row["千張大戶週增減"],
                "indexMember": row["指數成員"],
                "indexDate": row["指數公告生效日"],
                "indexSource": row["指數來源"],
                "indexLimit": row["指數確認限制"],
                "mcapBillion": num(row["市值億元"]),
                "mcapRank": None if num(row["市值母體排名"]) is None else int(float(row["市值母體排名"])),
                "mcapUniverse": None if num(row["市值母體家數"]) is None else int(float(row["市值母體家數"])),
                "mcapDate": row["市值日期"],
                "mcapSource": row["市值來源"],
                "mcapMethod": row["市值計算"],
                "priceDate": row["價格日期"],
                "fetchedDate": row["擷取日期"],
                "recalcDate": row["本輪重算日期"],
                "priceSource": row["來源_行情"],
                "revenueSource": row["來源_營收"],
                "statementSource": row["來源_財報"],
                "fcfSource": row["來源_FCF"],
                "peSource": row["來源_PE"],
                "instSource": row["來源_法人"],
                "disposalSource": row["來源_處置"],
                "intlText": row["國際合作或認證"],
                "intlDate": row["國際證據日期"],
                "intlSource": row["國際證據來源"],
                "staleNote": row["共同基準落後警示"],
                "dataGapLabel": row["資料不足標籤"],
                "previousScore": num(row["前輪分數"]),
                "ocfNi": num(row["OCF_NI單季"]),
                "gmTrend": row["毛利趨勢"],
                "quarterRoe": row["四季單季ROE%"],
                "methodText": row["新計分方法"],
                "externalAi": row["外部AI"],
                "levelSeed": row["層級"],
                "discounted": ("額外扣" in (row["原因"] or "")) or ("已打折" in (row["原因"] or "")),
                "checkDate": row["查核日期"],
                "snapshotNote": row["財報營收快照"],
                "canslim": default_canslim(),
                "magic": default_magic(),
            }
        )

    bundle = {
        "generatedFrom": "uploads/watchlist30_normalized_market_a414.csv",
        "universeNote": "30 檔研究池。數字沿用種子檔已標示的來源與日期，程式不補造缺失值。",
        "priceDate": stocks[0]["priceDate"] if stocks else None,
        "recalcDate": stocks[0]["recalcDate"] if stocks else None,
        "fetchedDate": stocks[0]["fetchedDate"] if stocks else None,
        "publicFetch": None,
        "market": None,
        "stocks": stocks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} stocks={len(stocks)}")


if __name__ == "__main__":
    build()
