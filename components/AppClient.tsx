"use client";

import { useEffect, useMemo, useState } from "react";
import rawBundle from "@/data/bundle.json";
import { toInput } from "@/lib/canslim";
import { BUFFETT_NOTE, BUFFETT_TRADEOFF, GRAHAM_NOTE, GRAHAM_TRADEOFF, summarizeRules } from "@/lib/masters";
import {
  CANSLIM_LABEL,
  CANSLIM_NORM_NOTE,
  CANSLIM_ORDER,
  CANSLIM_THRESHOLD_NOTE,
  MAGIC_SEPARATE_NOTE,
  POOL_NOTE,
  RANKING_NOTE,
  CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  ORIGIN_NOTES,
  canslimStatLines,
  formatTotal,
  gapIsCore,
  lightLabel,
  listHeader,
  magicLine,
  missingPhrase,
  rankMagic,
  normalizeSettings,
  overlapIds,
  priorityBuys,
  rankUniverse,
  riskLabel,
  round1,
  starLabel,
  summarizeCanslim,
  tickedCanslimLabel,
  weightTotal,
  type CanslimKey,
  type CanslimMissStat,
  type DisplayLevel,
  type GateId,
  type ScoredStock,
  type Settings,
  type SubId,
} from "@/lib/engine";
import { copyText, exportReport, lineHref } from "@/lib/report";
import { downloadJson, loadPersisted, savePersisted } from "@/lib/storage";
import type { Bundle, BundleStock, Holding, NewsItem, RuleLog, UserDate } from "@/lib/types";
import { GLOSSARY, entryChecks, experts, fmt, reportLines, shareText, technicalLights, topReasons } from "@/lib/present";

const bundle = rawBundle as unknown as Bundle;
const stocks = bundle.stocks;
const inputs = stocks.map(toInput);
const byId = new Map(stocks.map((stock) => [stock.id, stock]));

const TABS = [
  ["home", "首頁"],
  ["rank", "總排行"],
  ["industry", "產業"],
  ["explore", "探索"],
  ["risk", "風險"],
  ["me", "我的"],
] as const;
type Tab = (typeof TABS)[number][0];

const GATES: { id: GateId; label: string; subs: { id: SubId; label: string }[] }[] = [
  { id: "g1", label: "1 基本門檻", subs: [{ id: "g1_listed", label: "上市櫃普通股" }, { id: "g1_liquidity", label: "流動性：60日均成交 > 0.8 億" }] },
  { id: "g2", label: "2 硬否決（鎖定）", subs: [{ id: "g2_accounting", label: "重大會計疑慮" }, { id: "g2_fcf", label: "連續四季自由現金流各為負" }, { id: "g2_disposal", label: "當天被處置" }] },
  { id: "g3", label: "3 評分規則", subs: [{ id: "g3_dual", label: "雙排名（未驗證，不加分）" }, { id: "g3_governance", label: "公司治理前 20%（未驗證，不加分）" }, { id: "g3_penalty_cap", label: "風險扣分最多 15" }] },
  { id: "g4", label: "4 資料完整度", subs: [{ id: "g4_completeness", label: "完整度 ≥ 70% 才進排名" }] },
  { id: "g5", label: "5 時機燈號", subs: [{ id: "g5_timing", label: "只有綠燈列入名單" }] },
  { id: "g6", label: "6 組合限制", subs: [{ id: "g6_max30", label: "最多 30 家" }, { id: "g6_sector5", label: "同領域最多 5 家" }, { id: "g6_weight25", label: "領域資金 25%" }, { id: "g6_memory", label: "記憶體獨立計算" }] },
];

export default function AppClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("home");
  const [openId, setOpenId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [dates, setDates] = useState<UserDate[]>([]);
  const [log, setLog] = useState<RuleLog[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [domain, setDomain] = useState("全部");

  useEffect(() => {
    loadPersisted().then((saved) => {
      if (saved?.settings) setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, ...(saved.settings as Settings) }));
      if (Array.isArray(saved?.holdings)) setHoldings(saved.holdings as Holding[]);
      if (Array.isArray(saved?.favorites)) setFavorites(saved.favorites as string[]);
      if (Array.isArray(saved?.news)) setNews(saved.news as NewsItem[]);
      if (Array.isArray(saved?.dates)) setDates(saved.dates as UserDate[]);
      if (Array.isArray(saved?.log)) setLog(saved.log as RuleLog[]);
      setReady(true);
    });
    const sync = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/stock/")) setOpenId(hash.slice("#/stock/".length));
      else if (hash.startsWith("#/tab/")) {
        const next = hash.slice("#/tab/".length) as Tab;
        if (TABS.some((item) => item[0] === next)) setTab(next);
        setOpenId(null);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    savePersisted({ settings, holdings, favorites, news, dates, log });
  }, [ready, settings, holdings, favorites, news, dates, log]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const ranked = useMemo(() => rankUniverse(inputs, settings), [settings]);
  const all = useMemo(() => [...ranked.core, ...ranked.reserve, ...ranked.fail, ...ranked.veto], [ranked]);
  const miss = useMemo(() => summarizeCanslim(all.map((row) => row.canslim)), [all]);
  const magic = useMemo(
    () =>
      rankMagic(
        all.map((row) => ({
          id: row.stock.id,
          industry: byId.get(row.stock.id)?.industry || "",
          roc: null as number | null,
          ey: null as number | null,
          gatePass: row.tier === "core" || row.tier === "reserve",
        })),
      ),
    [all],
  );
  const header = listHeader(settings);

  function commit(next: Settings, note: string) {
    const safe = normalizeSettings(next);
    setSettings(safe);
    setLog((prev) => [{ at: new Date().toISOString(), text: note }, ...prev].slice(0, 40));
  }

  function go(next: Tab) {
    setTab(next);
    setOpenId(null);
    history.replaceState(null, "", `#/tab/${next}`);
  }

  function open(id: string) {
    setOpenId(id);
    history.replaceState(null, "", `#/stock/${id}`);
  }

  const opened = openId ? all.find((row) => row.stock.id === openId) : undefined;
  const openedStock = openId ? byId.get(openId) : undefined;

  return (
    <div className="app" data-testid="app-ready">
      <nav className="tabbar">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" data-testid={`tab-${id}`} aria-current={tab === id ? "page" : undefined} onClick={() => go(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="brand">排雷選股<small>總裁個人版 · 不自動下單</small></h1>
          </div>
          <div className="levels" data-testid="display-level">
            {(["novice", "advanced", "pro"] as DisplayLevel[]).map((level) => (
              <button key={level} type="button" data-testid={`level-${level}`} aria-pressed={settings.display === level} onClick={() => commit({ ...settings, display: level }, `顯示層級 ${level}`)}>
                {level === "novice" ? "新手" : level === "advanced" ? "進階" : "專業"}
              </button>
            ))}
          </div>
        </header>
        <p className="header-line" data-testid="list-header">{header}</p>
        <p className="muted" data-testid="no-auto-trade">分數不等於買賣建議。預備名單不是買進清單。這個程式不會自動下單，也不會自行把訊息送到 Line。</p>
        <label className="muted">搜尋<input data-testid="search" type="search" placeholder="代號或名稱" onChange={(event) => {
          const query = event.target.value.trim();
          const hit = stocks.find((stock) => stock.id === query || stock.name.includes(query));
          if (hit) open(hit.id);
        }} /></label>
        {tab === "home" && <Home ranked={ranked} miss={miss} settings={settings} open={open} go={go} setDomain={setDomain} />}
        {tab === "rank" && <Rank rows={ranked} all={all} miss={miss} magic={magic} settings={settings} open={open} onMethod={(method) => commit({ ...settings, rankingMethod: method }, `排名改為 ${method}`)} />}
        {tab === "industry" && <Industry all={ranked.pool} domain={domain} setDomain={setDomain} settings={settings} open={open} />}
        {tab === "explore" && <Explore all={all} news={news} setNews={setNews} open={open} />}
        {tab === "risk" && <Risk all={all} open={open} />}
        {tab === "me" && (
          <Me
            settings={settings}
            commit={commit}
            miss={miss}
            ranked={ranked}
            all={all}
            holdings={holdings}
            setHoldings={setHoldings}
            favorites={favorites}
            news={news}
            dates={dates}
            setDates={setDates}
            log={log}
            open={open}
            toast={setToast}
            setFavorites={setFavorites}
            setNews={setNews}
            setLog={setLog}
            setSettings={setSettings}
          />
        )}
        <p className="muted">價格 {bundle.priceDate} · 重算 {bundle.recalcDate} · 擷取 {bundle.fetchedDate}。種子：{bundle.universeNote}</p>
      </main>
      {opened && openedStock && (
        <Detail
          row={opened}
          stock={openedStock}
          settings={settings}
          magicText={magicLine(magic.byId.get(opened.stock.id))}
          favorite={favorites.includes(opened.stock.id)}
          onClose={() => go(tab)}
          onFav={() => setFavorites((prev) => (prev.includes(opened.stock.id) ? prev.filter((id) => id !== opened.stock.id) : [...prev, opened.stock.id]))}
          toast={setToast}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Missing({ row }: { row: ScoredStock }) {
  if (row.canslim.missing.length === 0) return row.canslim.qualified ? <span>勾選的條件都過了</span> : null;
  return (
    <span data-testid="missing-items">
      缺：
      {row.canslim.missing.map((item, index) => (
        <span key={item.key} data-testid={gapIsCore(item.key) ? `missing-${item.key.toLowerCase()}` : undefined} className={gapIsCore(item.key) ? "missing-core missing-m" : undefined}>
          {index ? "、" : ""}
          {item.key}
          {item.status === "unverified" ? "（未驗證）" : ""}
        </span>
      ))}
    </span>
  );
}

function Card({ row, settings, open }: { row: ScoredStock & { bothLists?: boolean }; settings: Settings; open: (id: string) => void }) {
  const stock = byId.get(row.stock.id)!;
  return (
    <article className="card" data-testid="stock-card" data-stock-id={stock.id}>
      <button type="button" className="btn" onClick={() => open(stock.id)}>
        {stock.id} {stock.name}
      </button>
      <div className="row">
        <span className="stars">{starLabel(row.stars)}</span>
        <span className={`light ${row.light}`}>{lightLabel(row.light)}</span>
        <span className="tag">{riskLabel(row.risk)}</span>
        <span className="tag">{stock.domain}</span>
      </div>
      <p>{row.combo}</p>
      {stock.dataGapLabel && <p className="muted">快照：{stock.dataGapLabel} · 完整度 {fmt(stock.completeness, 0)}%</p>}
      <p>本系統 <b data-testid="system-score">{round1(row.system.score)}</b>
        {" "}CAN SLIM 門檻 <b data-testid="canslim-score">{row.canslim.qualified ? "通過" : "沒過"}</b>
        {row.bothLists && <b data-testid="both-badge"> 兩種預備名單都有</b>}</p>
      <p><Missing row={row} /></p>
      {settings.buffettGate && !row.buffett.qualified && <p data-testid="buffett-miss">巴菲特缺：{row.buffett.missing.map((item) => `${item.label}${item.status === "unverified" ? "（未驗證）" : ""}`).join("、")}</p>}
      {settings.grahamGate && !row.graham.qualified && <p data-testid="graham-miss">葛拉漢缺：{row.graham.missing.map((item) => `${item.label}${item.status === "unverified" ? "（未驗證）" : ""}`).join("、")}</p>}
      {settings.display !== "novice" && (
        <div data-testid="card-reasons">
          {topReasons(stock).map((reason) => <p key={reason} className="muted">{reason}</p>)}
          <p className="muted">最大風險：{stock.riskText}</p>
        </div>
      )}
      {settings.display === "pro" && <p className="muted">種子分數 {round1(stock.systemSeed)} · {stock.recalcDate}</p>}
    </article>
  );
}

function MissBlock({ miss }: { miss: CanslimMissStat }) {
  return (
    <section className="panel" data-testid="canslim-miss-stats">
      <h2>CAN SLIM 未過原因統計</h2>
      <p className="muted">研究池 <span data-testid="canslim-universe">{miss.universe}</span> 家。七項全過 <b data-testid="canslim-pass-all">{miss.passAll}</b> 家。沒過＝未驗證＋查了但沒過。這些數字來自這 30 家的已標來源資料，沒有另造。</p>
      <table>
        <thead><tr><th>項目</th><th>沒過</th><th>未驗證</th><th>查了但沒過</th><th>過了</th></tr></thead>
        <tbody>
          {miss.rows.map((row) => (
            <tr key={row.key}>
              <td>{row.key} {row.label}</td>
              <td data-testid={`miss-${row.key}-missed`}>{row.missed}</td>
              <td data-testid={`miss-${row.key}-unverified`}>{row.unverified}</td>
              <td data-testid={`miss-${row.key}-failed`}>{row.failed}</td>
              <td>{row.passed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Home({ ranked, miss, settings, open, go, setDomain }: { ranked: ReturnType<typeof rankUniverse>; miss: CanslimMissStat; settings: Settings; open: (id: string) => void; go: (tab: Tab) => void; setDomain: (value: string) => void }) {
  const domains = [...new Set(stocks.map((stock) => stock.domain))];
  return (
    <div>
      <Priority pool={ranked.pool.slice(0, 30)} settings={settings} open={open} />
      <section className="panel" data-testid="home-picks">
        <h2>預備名單</h2>
        <p className="muted">{POOL_NOTE}</p>
        <p data-testid="pool-home-count">{ranked.pool.slice(0, 30).length}</p>
        {ranked.pool.length === 0 && <p>留現金。目前沒有公司同時通過啟用的關卡和 CAN SLIM 門檻，不多補。</p>}
        {ranked.pool.slice(0, 30).map((row) => <Card key={row.stock.id} row={row} settings={settings} open={open} />)}
        <button type="button" className="btn solid" onClick={() => go("rank")}>前往總排行</button>
      </section>
      <section className="panel" data-testid="home-risk">
        <h2>風險提醒</h2>
        <p>硬否決 {ranked.veto.length} 家。紅燈 {allLights(ranked, "red")} 家，黃燈 {allLights(ranked, "yellow")} 家，綠燈 {allLights(ranked, "green")} 家。</p>
        <p className="muted">這 30 家的處置欄都是已查官方公告、評估日沒有被處置。資料不足標籤來自研究快照，不是新造的警訊。</p>
      </section>
      <section className="panel" data-testid="home-week">
        <h2>本週新增／剔除</h2>
        <p className="muted">沒有上一週的入選名單，不編造誰新加入、誰被剔除。可以看的是種子分數和前一輪分數的差。</p>
      </section>
      <section className="panel">
        <h2>新手指南</h2>
        <p>先看有沒有硬否決，再看關卡過不過，最後才看分數。星等是體質，燈號是時機，風險狀態是有沒有雷。三者分開。</p>
      </section>
      <div className="row">
        {domains.map((name) => (
          <button key={name} type="button" className="chip" onClick={() => { setDomain(name); go("industry"); }}>{name}</button>
        ))}
      </div>
      <MissBlock miss={miss} />
    </div>
  );
}

function allLights(ranked: ReturnType<typeof rankUniverse>, light: string) {
  return [...ranked.core, ...ranked.reserve, ...ranked.fail, ...ranked.veto].filter((row) => row.light === light).length;
}

function Priority({ pool, settings, open }: { pool: ScoredStock[]; settings: Settings; open: (id: string) => void }) {
  const picks = priorityBuys(pool);
  return (
    <section className="panel" data-testid="priority-buys" style={{ borderColor: "#8f2d2d" }}>
      <h2>優先買進 3–5 家</h2>
      <p className="muted">只從預備名單裡挑燈號是綠燈的前幾家，最多 5 家。這是整理出來給你看的，不會自動下單。</p>
      <p data-testid="priority-count">{picks.length}</p>
      {picks.length === 0 && <p data-testid="priority-note">預備名單裡沒有綠燈，所以這裡是空的，不拿黃燈或紅燈來湊。</p>}
      {picks.length > 0 && picks.length < 3 && <p data-testid="priority-note">綠燈只有 {picks.length} 家，就列 {picks.length} 家，不補成 3 家。</p>}
      {picks.map((row) => <Card key={row.stock.id} row={row} settings={settings} open={open} />)}
    </section>
  );
}

function Rank({ rows, all, miss, magic, settings, open, onMethod }: { rows: ReturnType<typeof rankUniverse>; all: ScoredStock[]; miss: CanslimMissStat; magic: ReturnType<typeof rankMagic>; settings: Settings; open: (id: string) => void; onMethod: (method: "system" | "magic") => void }) {
  const [sort, setSort] = useState("sum");
  const view = settings.rankingMethod;
  const shown = rows.pool.slice(0, 30);
  const ordered = [...all].sort((a, b) => compare(a, b, sort));
  const text = `${rows.header}\n${tickedCanslimLabel(settings)}\n${MAGIC_SEPARATE_NOTE}\n${canslimStatLines(miss).join("\n")}\n${ordered.slice(0, 10).map((row) => `${row.stock.id} ${byId.get(row.stock.id)?.name} CAN SLIM ${round1(row.canslim.score)} ${missingPhrase(row.canslim)} ${magicLine(magic.byId.get(row.stock.id))}`).join("\n")}`;
  return (
    <div>
      <div className="row">
        <button type="button" className={view === "system" ? "chip on" : "chip"} data-testid="rank-mode-score" onClick={() => onMethod("system")}>本系統分數</button>
        <button type="button" className={view === "magic" ? "chip on" : "chip"} data-testid="rank-mode-magic" onClick={() => onMethod("magic")}>神奇公式名次</button>
      </div>
      <p className="muted">名單內 {rows.core.length} · 候補 {rows.reserve.length} · 未過關 {rows.fail.length} · 剔除 {rows.veto.length}</p>
      <label>排序<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="sum">總分</option><option value="stars">星等</option><option value="light">燈號</option><option value="yoy">營收成長</option><option value="complete">資料完整度</option></select></label>
      <div className="row">
        <a className="btn" data-testid="rank-share-line" href={lineHref(text)}>用 Line 分享名單</a>
        <button type="button" className="btn" data-testid="rank-export-pdf" onClick={() => exportReport("排雷名單", "排雷選股名單", text.split("\n"), "pdf")}>匯出 PDF</button>
      </div>
      <MissBlock miss={miss} />
      {view === "magic" && (
        <section data-testid="magic-list">
          <h2>神奇公式預備名單</h2>
          <p data-testid="magic-note">{MAGIC_SEPARATE_NOTE} {RANKING_NOTE}</p>
          <p className="muted">{POOL_NOTE}</p>
          <p className="muted">同一套關卡。通過關卡、又有已驗證資本報酬率與盈餘殖利率的公司，才依名次取前 30。金融與油電燃氣、公用事業排除。</p>
          {magic.top.length === 0 && <p data-testid="magic-empty">目前沒有可排名的公司。資本報酬率與盈餘殖利率未驗證，不能把本益比或 ROE 拿來冒充，所以不編名次。</p>}
          {magic.top.map((item) => item.state === "ranked" && (
            <p key={item.id}><button type="button" onClick={() => open(item.id)}>{item.id} {byId.get(item.id)?.name}</button> {magicLine(item)}</p>
          ))}
        </section>
      )}
      {view === "system" && <h2>預備名單</h2>}
      {view === "system" && <p className="muted">{POOL_NOTE} 同時在兩種方法前段的有 <span data-testid="both-count">{overlapIds(shown.map((row) => row.stock.id), magic.top.map((item) => item.id)).length}</span> 家。</p>}
      {view === "system" && <p data-testid="core-count">{shown.length}</p>}
      {view === "system" && <p>留現金。預備名單 {shown.length} 家，不補到 30。</p>}
      {view === "system" && shown.map((row) => <Card key={row.stock.id} row={{ ...row, bothLists: magic.top.some((item) => item.id === row.stock.id) }} settings={settings} open={open} />)}
      {view === "system" && <h2>未過關</h2>}
      {view === "system" && ordered.filter((row) => row.tier === "fail").map((row) => (
        <div key={row.stock.id}>
          <Card row={row} settings={settings} open={open} />
          <p className="muted">{row.reasons.join("、")}</p>
        </div>
      ))}
      {view === "system" && <h2>剔除</h2>}
      {view === "system" && rows.veto.length === 0 && <p>目前沒有觸發硬否決的公司。</p>}
    </div>
  );
}

function compare(a: ScoredStock, b: ScoredStock, sort: string) {
  const stockA = byId.get(a.stock.id)!;
  const stockB = byId.get(b.stock.id)!;
  if (sort === "stars") return (b.stars || 0) - (a.stars || 0);
  if (sort === "light") return a.light.localeCompare(b.light);
  if (sort === "yoy") return (stockB.revenueYoy || -999) - (stockA.revenueYoy || -999);
  if (sort === "complete") return stockB.completeness - stockA.completeness;
  return (b.sum || -1) - (a.sum || -1);
}

function Industry({ all, domain, setDomain, settings, open }: { all: ScoredStock[]; domain: string; setDomain: (value: string) => void; settings: Settings; open: (id: string) => void }) {
  const domains = ["全部", ...new Set(stocks.map((stock) => stock.domain))];
  const rows = all.filter((row) => domain === "全部" || row.stock.domain === domain).slice(0, 10);
  const counts = new Map<string, number>();
  for (const row of all.filter((item) => item.tier === "core")) counts.set(row.capDomain, (counts.get(row.capDomain) || 0) + 1);
  return (
    <div>
      <label>主計算領域<select data-testid="industry-select" value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map((name) => <option key={name}>{name}</option>)}</select></label>
      <p className="muted">記憶體／儲存獨立計算上限。主題用成長類型，只做篩選，不加分。</p>
      {[...counts.entries()].map(([name, count]) => <p key={name} className={count > 5 ? "warn" : ""}>{name} 名單內 {count} 家</p>)}
      {rows.map((row) => (
        <div key={row.stock.id}>
          <Card row={row} settings={settings} open={open} />
          {byId.get(row.stock.id)?.discounted && <p className="warn">已打折：成長含原物料或一次性因素</p>}
        </div>
      ))}
      {rows.length === 0 && <p>這個領域沒有公司。</p>}
    </div>
  );
}

function Explore({ all, news, setNews, open }: { all: ScoredStock[]; news: NewsItem[]; setNews: (items: NewsItem[]) => void; open: (id: string) => void }) {
  const [mode, setMode] = useState<"a" | "b" | "c">("a");
  const [cond, setCond] = useState("yoy");
  const [giant, setGiant] = useState("nvda");
  const [draft, setDraft] = useState({ title: "", source: "", date: "", stockId: "" });
  const metrics: Record<string, (stock: BundleStock) => number | null> = {
    yoy: (stock) => stock.revenueYoy,
    roe: (stock) => stock.roe,
    fcf: (stock) => stock.fcfTtm,
    pe: (stock) => stock.pe,
    inst: (stock) => stock.inst20,
  };
  const picked = [...all].filter((row) => metrics[cond](byId.get(row.stock.id)!) != null).sort((a, b) => (metrics[cond](byId.get(b.stock.id)!) || 0) - (metrics[cond](byId.get(a.stock.id)!) || 0)).slice(0, 10);
  const suppliers = giant === "nvda" ? stocks.filter((stock) => stock.id === "2395" && !stock.intlText.includes("未驗證")) : [];
  return (
    <div>
      <div className="row">
        <button type="button" className="chip" data-testid="explore-a" onClick={() => setMode("a")}>基本面條件</button>
        <button type="button" className="chip" data-testid="explore-b" onClick={() => setMode("b")}>美國訂單連動</button>
        <button type="button" className="chip" data-testid="explore-c" onClick={() => setMode("c")}>新聞匯入</button>
      </div>
      {mode === "a" && (
        <section>
          <select value={cond} onChange={(event) => setCond(event.target.value)}>
            <option value="yoy">營收年增</option><option value="roe">ROE</option><option value="fcf">自由現金流</option><option value="pe">官方本益比</option><option value="inst">20日法人</option>
          </select>
          <p className="muted">最多 10 家。官方本益比不是同業比較，估值仍未驗證、不加分。</p>
          {picked.map((row) => <p key={row.stock.id}><button type="button" onClick={() => open(row.stock.id)}>{row.stock.id} {byId.get(row.stock.id)?.name}</button> {fmt(metrics[cond](byId.get(row.stock.id)!))} · {row.combo}</p>)}
        </section>
      )}
      {mode === "b" && (
        <section>
          <select value={giant} onChange={(event) => setGiant(event.target.value)}>
            {["nvda 輝達", "aapl 蘋果", "msft 微軟", "googl 谷歌", "amzn 亞馬遜", "meta Meta", "tsla 特斯拉"].map((item) => <option key={item} value={item.split(" ")[0]}>{item}</option>)}
          </select>
          {suppliers.length === 0 && <p>沒有已驗證的供應證據，不把傳聞算進來。</p>}
          {suppliers.map((stock) => <p key={stock.id}><button type="button" onClick={() => open(stock.id)}>{stock.id} {stock.name}</button> {stock.intlText}（{stock.intlDate}，{stock.intlSource}）</p>)}
        </section>
      )}
      {mode === "c" && (
        <section>
          <p className="muted">沒有內建新聞。貼上的內容只存在這台裝置，不計分。</p>
          <input placeholder="標題" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <input placeholder="來源" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} />
          <input placeholder="日期" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          <input placeholder="代號" value={draft.stockId} onChange={(event) => setDraft({ ...draft, stockId: event.target.value })} />
          <button type="button" className="btn solid" onClick={() => {
            if (!draft.title || !draft.source || !draft.date) return;
            setNews([{ id: `${Date.now()}`, ...draft, note: "使用者匯入，不計分" }, ...news]);
            setDraft({ title: "", source: "", date: "", stockId: "" });
          }}>匯入</button>
          {news.map((item) => <p key={item.id}>{item.date} {item.title}（{item.source}） <button type="button" onClick={() => item.stockId && open(item.stockId)}>{item.stockId}</button></p>)}
        </section>
      )}
    </div>
  );
}

function Risk({ all, open }: { all: ScoredStock[]; open: (id: string) => void }) {
  const [id, setId] = useState(all[0]?.stock.id || "2330");
  const stock = byId.get(id) || stocks[0];
  return (
    <div>
      <label>公司<select data-testid="risk-select" value={stock.id} onChange={(event) => setId(event.target.value)}>{stocks.map((item) => <option key={item.id} value={item.id}>{item.id} {item.name}</option>)}</select></label>
      <section className="panel">
        <h2>硬否決</h2>
        <p>重大會計疑慮：{stock.accountingVeto ? "觸發" : "未觸發"}。{stock.accountingStatus}</p>
        <p>連續四季自由現金流各為負：{stock.fcfAllNegative ? "觸發" : "未觸發"}。{stock.fcfQuarters.map((item) => `${item.q}:${item.v}`).join(" / ")}</p>
        <p>處置：{stock.disposed ? "觸發" : "未觸發"}。{stock.disposal}（{stock.disposalSource}）</p>
      </section>
      <section className="panel">
        <h2>扣分檢查</h2>
        <p>風險扣分 {stock.penalty}。{stock.riskText}</p>
        <p>鑑識：{stock.forensic}</p>
        <p>會計師：{stock.auditor}（{stock.auditorQuarter}，{stock.auditorDate}）</p>
        <button type="button" onClick={() => open(stock.id)}>看個股</button>
      </section>
      <section className="panel">
        <h2>資料健康</h2>
        <p>完整度 {fmt(stock.completeness, 1)}% · 加權 {fmt(stock.weightedCompleteness, 1)}%</p>
        <p>未驗證：{stock.unverifiedItems.join("、") || "無"}</p>
        <p className="muted">{stock.staleNote} · {stock.snapshotNote}</p>
      </section>
    </div>
  );
}

function Me(props: {
  settings: Settings;
  commit: (next: Settings, note: string) => void;
  miss: CanslimMissStat;
  ranked: ReturnType<typeof rankUniverse>;
  all: ScoredStock[];
  holdings: Holding[];
  setHoldings: (items: Holding[]) => void;
  favorites: string[];
  setFavorites: (items: string[]) => void;
  news: NewsItem[];
  setNews: (items: NewsItem[]) => void;
  dates: UserDate[];
  setDates: (items: UserDate[]) => void;
  log: RuleLog[];
  setLog: (items: RuleLog[]) => void;
  setSettings: (settings: Settings) => void;
  open: (id: string) => void;
  toast: (text: string) => void;
}) {
  const { settings, commit, miss, holdings, setHoldings, favorites, dates, setDates, log, toast, open } = props;
  const [hold, setHold] = useState({ id: "2330", shares: "1", cost: "2500" });
  const totalW = weightTotal(settings.weights);

  function toggleCanslim(key: CanslimKey) {
    const next = { ...settings.canslimOn, [key]: !settings.canslimOn[key] };
    if (!CANSLIM_ORDER.some((item) => next[item])) {
      toast("至少留一項 CAN SLIM 條件");
      return;
    }
    commit({ ...settings, canslimOn: next }, `CAN SLIM 條件 ${key}`);
  }

  return (
    <div>
      <section className="panel">
        <h2>我的資產</h2>
        <form data-testid="holding-form" onSubmit={(event) => { event.preventDefault(); setHoldings([...holdings.filter((item) => item.id !== hold.id), { id: hold.id, shares: Number(hold.shares), cost: Number(hold.cost) }]); }}>
          <input data-testid="holding-id" value={hold.id} onChange={(event) => setHold({ ...hold, id: event.target.value })} />
          <input data-testid="holding-shares" value={hold.shares} onChange={(event) => setHold({ ...hold, shares: event.target.value })} />
          <input data-testid="holding-cost" value={hold.cost} onChange={(event) => setHold({ ...hold, cost: event.target.value })} />
          <button className="btn solid" type="submit">加入持股</button>
        </form>
        {holdings.map((item) => {
          const stock = byId.get(item.id);
          const drop = stock?.close && item.cost ? (item.cost - stock.close) / item.cost : null;
          return (
            <p key={item.id}>
              <button type="button" onClick={() => open(item.id)}>{item.id} {stock?.name}</button> {item.shares} 股，成本 {item.cost}，現價 {fmt(stock?.close ?? null)}
              {drop != null && drop >= 0.1 && <span data-testid="stop-warning" className="warn"> 較成本低 {fmt(drop * 100)}%，已進入 10%–15% 停損帶</span>}
              <button type="button" onClick={() => setHoldings(holdings.filter((row) => row.id !== item.id))}>移除</button>
            </p>
          );
        })}
        <p className="muted">價格用種子收盤價，不會自動賣出。</p>
        <div className="bar" aria-label="資金配置"><span style={{ width: "60%" }} /><span style={{ width: "30%" }} /><span style={{ width: "10%" }} /></div>
        <p className="muted">60% 積極、30% 0056／00878／00919、10% 現金。ETF 淨值未驗證，不顯示假價格。名單不滿 30 家時，空著的積極部位留現金。</p>
        <h3>收藏</h3>
        {favorites.length === 0 && <p className="muted">還沒有收藏。</p>}
        {favorites.map((id) => <button key={id} type="button" onClick={() => open(id)}>{id} {byId.get(id)?.name}</button>)}
      </section>
      <section className="panel">
        <h2>每週換股條件</h2>
        {props.ranked.core.slice(0, 5).map((row) => (
          <div key={row.stock.id}>
            <b>{row.stock.id}</b>
            {entryChecks(byId.get(row.stock.id)!).map((item) => <p key={item.label} className="muted">{item.label}：{item.status === "yes" ? "符合" : item.status === "no" ? "不符合" : "未驗證"} · {item.detail}</p>)}
          </div>
        ))}
        {props.ranked.core.length === 0 && <p className="muted">目前沒有入選公司。</p>}
      </section>
      <section className="panel">
        <h2>重要日期</h2>
        <p className="muted">月營收慣例在次月 10 日前公布，這不是個別公司的已驗證日期。</p>
        {dates.map((item) => <p key={item.id}>{item.date} {item.label} {item.stockId}</p>)}
        <button type="button" className="btn" onClick={() => setDates([...dates, { id: `${Date.now()}`, label: "自訂提醒", date: bundle.priceDate, stockId: "" }])}>加一筆日期</button>
      </section>
      <section className="panel">
        <h2>歷史與回測</h2>
        <p className="muted">組合報酬與虧損年份未驗證，不顯示模擬績效。下面只列種子裡的一年最大跌幅參考。</p>
        {stocks.slice(0, 5).map((stock) => <p key={stock.id}>{stock.id} 前輪 {fmt(stock.previousScore)} → 種子 {fmt(stock.systemSeed)}，一年 MDD {fmt(stock.mdd)}%</p>)}
      </section>
      <section className="panel" data-testid="standards-panel">
        <h2>排名方法</h2>
        <p>{RANKING_NOTE}</p>
        <label><input data-testid="rank-radio-system" type="radio" name="rank-method" checked={settings.rankingMethod === "system"} onChange={() => commit({ ...settings, rankingMethod: "system" }, "排名改為本系統")} /> 本系統 100 分表</label>
        <label><input data-testid="rank-radio-magic" type="radio" name="rank-method" checked={settings.rankingMethod === "magic"} onChange={() => commit({ ...settings, rankingMethod: "magic" }, "排名改為神奇公式")} /> 神奇公式名次</label>
        <h2>本系統權重</h2>
        <p data-testid="origin-system">{ORIGIN_NOTES.system}</p>
        <h3>神奇公式是另一張名次名單</h3>
        <p data-testid="origin-magic">{ORIGIN_NOTES.magic}</p>
        <p data-testid="magic-separate">{MAGIC_SEPARATE_NOTE}</p>
        <label><input data-testid="canslim-gate" type="checkbox" checked={settings.canslimGate} onChange={() => commit({ ...settings, canslimGate: !settings.canslimGate }, "CAN SLIM 門檻")} /> 用 CAN SLIM 當門檻</label>
        <p data-testid="origin-canslim">{ORIGIN_NOTES.canslim}</p>
        <p data-testid="canslim-norm-note">{CANSLIM_NORM_NOTE}</p>
        <p>{CANSLIM_THRESHOLD_NOTE}</p>
        <h3>CAN SLIM 條件</h3>
        {CANSLIM_ORDER.map((key) => {
          const stat = miss.rows.find((row) => row.key === key)!;
          return (
            <div key={key}>
              <label>
                <input data-testid={`canslim-on-${key}`} type="checkbox" checked={settings.canslimOn[key]} onChange={() => toggleCanslim(key)} /> {key} {CANSLIM_LABEL[key]}
              </label>
              <span data-testid={`canslim-fail-${key}`}> 沒過 {stat.missed}（未驗證 {stat.unverified}、查了但沒過 {stat.failed}）</span>
              {gapIsCore(key) && !settings.canslimOn[key] && <p className="warn" data-testid={`canslim-core-warn-${key}`}>這是核心項。你已取消勾選，達標時不再要求它。</p>}
            </div>
          );
        })}
        <h3>本系統權重</h3>
        {CATEGORIES.map((item) => (
          <div className="weight" key={item.key}>
            <span>{item.short}</span>
            <input type="range" min={0} max={100} value={settings.weights[item.key]} onChange={(event) => commit({ ...settings, weights: { ...settings.weights, [item.key]: Number(event.target.value) } }, "調整本系統權重")} />
            <input data-testid={`weight-${item.key}`} type="number" min={0} max={100} value={settings.weights[item.key]} onChange={(event) => {
              if (event.target.value === "") return;
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              commit({ ...settings, weights: { ...settings.weights, [item.key]: next } }, "調整本系統權重");
            }} />
          </div>
        ))}
        <p data-testid="weight-total">合計 {formatTotal(totalW)}</p>
        {Math.abs(totalW - 100) >= 0.05 && <p data-testid="weight-warning" className="warn">合計必須是 100。現在是 {formatTotal(totalW)}，排名會自動調整成 100。</p>}
        <button
          type="button"
          data-testid="weight-reset"
          className="btn"
          onMouseDown={(event) => {
            event.preventDefault();
            commit({ ...settings, weights: { ...DEFAULT_WEIGHTS } }, "恢復本系統預設權重");
          }}
        >
          恢復預設
        </button>
        <p className="muted">CAN SLIM 不計分。勾選條件全過才進預備名單。目前全過 {props.all.filter((row) => row.canslim.qualified).length} 家。</p>
        <MasterSet
          title="巴菲特門檻"
          gateId="buffett-gate"
          enabled={settings.buffettGate}
          onToggle={() => commit({ ...settings, buffettGate: !settings.buffettGate }, "巴菲特門檻")}
          principle={BUFFETT_NOTE}
          tradeoff={BUFFETT_TRADEOFF}
          rows={summarizeRules(props.all.map((row) => row.buffett))}
          flags={settings.buffettOn}
          onFlag={(key) => commit({ ...settings, buffettOn: { ...settings.buffettOn, [key]: !settings.buffettOn[key as keyof typeof settings.buffettOn] } }, `巴菲特 ${key}`)}
          prefix="buffett"
          caps={[
            { id: "buffett-roe-min", label: "ROE 下限 %", value: settings.buffettRoeMin, set: (value) => commit({ ...settings, buffettRoeMin: value }, "巴菲特 ROE") },
            { id: "buffett-debt-max", label: "負債比上限 %", value: settings.buffettDebtMax, set: (value) => commit({ ...settings, buffettDebtMax: value }, "巴菲特負債") },
          ]}
        />
        <MasterSet
          title="葛拉漢門檻"
          gateId="graham-gate"
          enabled={settings.grahamGate}
          onToggle={() => commit({ ...settings, grahamGate: !settings.grahamGate }, "葛拉漢門檻")}
          principle={GRAHAM_NOTE}
          tradeoff={GRAHAM_TRADEOFF}
          rows={summarizeRules(props.all.map((row) => row.graham))}
          flags={settings.grahamOn}
          onFlag={(key) => commit({ ...settings, grahamOn: { ...settings.grahamOn, [key]: !settings.grahamOn[key as keyof typeof settings.grahamOn] } }, `葛拉漢 ${key}`)}
          prefix="graham"
          caps={[
            { id: "graham-pe-max", label: "本益比上限", value: settings.grahamPeMax, set: (value) => commit({ ...settings, grahamPeMax: value }, "葛拉漢本益比") },
            { id: "graham-pb-max", label: "股價淨值上限", value: settings.grahamPbMax, set: (value) => commit({ ...settings, grahamPbMax: value }, "葛拉漢淨值") },
            { id: "graham-product-max", label: "本益比×淨值上限", value: settings.grahamProductMax, set: (value) => commit({ ...settings, grahamProductMax: value }, "葛拉漢乘積") },
            { id: "graham-current-min", label: "流動比率下限", value: settings.grahamCurrentMin, set: (value) => commit({ ...settings, grahamCurrentMin: value }, "葛拉漢流動比率") },
          ]}
        />
      </section>
      <section className="panel" data-testid="gates-panel">
        <h2>關卡設定</h2>
        <p className="muted">硬否決鎖定開啟，因為它擋的是做假帳、燒錢、被處置。</p>
        {GATES.map((gate) => (
          <div key={gate.id}>
            <label>
              <input data-testid={`gate-${gate.id}`} type="checkbox" checked={settings.gates[gate.id]} disabled={gate.id === "g2"} onChange={() => commit({ ...settings, gates: { ...settings.gates, [gate.id]: !settings.gates[gate.id] } }, `關卡 ${gate.id}`)} /> {gate.label}
            </label>
            {gate.subs.map((sub) => (
              <label key={sub.id} className="muted">
                <input data-testid={`sub-${sub.id}`} type="checkbox" checked={settings.subs[sub.id]} disabled={gate.id === "g2"} onChange={() => commit({ ...settings, subs: { ...settings.subs, [sub.id]: !settings.subs[sub.id] } }, sub.label)} /> {sub.label}
              </label>
            ))}
          </div>
        ))}
        <button type="button" className="btn" onClick={() => commit(DEFAULT_SETTINGS, "恢復全部預設")}>恢復預設規則</button>
      </section>
      <section className="panel" data-testid="notify-stub">
        <h2>Line 推播</h2>
        <p className="warn">尚未連接：沒有設定 Line Messaging API，不會推播。下面的開關只會把提醒留在這台裝置。</p>
        <label><input type="checkbox" checked={settings.notify.enabled} onChange={() => commit({ ...settings, notify: { ...settings.notify, enabled: !settings.notify.enabled } }, "通知開關")} /> 在本機保留提醒</label>
      </section>
      <section className="panel">
        <h2>備份</h2>
        <button type="button" className="btn" data-testid="export-backup" onClick={() => downloadJson("pailei-backup.json", { settings, holdings, favorites: props.favorites, news: props.news, dates, log })}>匯出備份</button>
        <input data-testid="import-backup" type="file" accept="application/json" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const data = JSON.parse(await file.text());
          if (data.settings) props.setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, ...data.settings }));
          if (Array.isArray(data.holdings)) setHoldings(data.holdings);
          if (Array.isArray(data.favorites)) props.setFavorites(data.favorites);
          if (Array.isArray(data.news)) props.setNews(data.news);
          if (Array.isArray(data.dates)) setDates(data.dates);
          if (Array.isArray(data.log)) props.setLog(data.log);
          toast("已匯入備份");
        }} />
        <h3>規則紀錄</h3>
        {log.slice(0, 6).map((item) => <p key={item.at} className="muted">{item.text}</p>)}
      </section>
      <Plain term="硬否決" />
    </div>
  );
}

function Detail({ row, stock, settings, magicText, favorite, onClose, onFav, toast }: { row: ScoredStock; stock: BundleStock; settings: Settings; magicText: string; favorite: boolean; onClose: () => void; onFav: () => void; toast: (text: string) => void }) {
  const text = `${shareText(row, stock, settings, magicText)}\n${missingPhrase(row.canslim)}`;
  return (
    <div className="overlay" data-testid="detail">
      <button type="button" className="btn" onClick={onClose}>返回</button>
      <h2>{stock.id} {stock.name}</h2>
      <div className="row">
        <span className="stars">{starLabel(row.stars)}</span>
        <span className={`light ${row.light}`}>{lightLabel(row.light)}</span>
        <span className="tag">{riskLabel(row.risk)}</span>
      </div>
      <p>{row.combo}</p>
      <p>層級：{row.tier === "core" ? "名單內" : row.tier === "reserve" ? "候補" : row.tier === "fail" ? "未過關" : "剔除"} {row.reasons.join("、")}</p>
      <p data-testid="detail-system-score">本系統 {round1(row.system.score)}（種子 {round1(stock.systemSeed)}）</p>
      <p data-testid="detail-canslim-score">CAN SLIM 門檻 {row.canslim.qualified ? "通過" : "沒過"}（不給分，{row.canslim.met}/{row.canslim.minimum}）</p>
      <p data-testid="detail-magic-rank">{magicText}</p>
      <p><Missing row={row} /></p>
      <p data-testid="detail-weights">本系統權重 {CATEGORIES.map((item) => `${item.short}${settings.weights[item.key]}`).join(" ")}</p>
      <p data-testid="detail-canslim-weights">{tickedCanslimLabel(settings)}</p>
      <p className="muted">{CANSLIM_NORM_NOTE}</p>
      {row.canslim.rows.map((item) => <p key={item.key} className={gapIsCore(item.key) && !item.pass && settings.canslimOn[item.key] ? "missing-core" : "muted"}>{item.key} {item.label}：{settings.canslimOn[item.key] ? (item.pass ? "過" : item.status === "unverified" ? "未驗證" : "沒過") : "不看"}。{item.detail}</p>)}
      <h3>巴菲特</h3>
      <p data-testid="detail-buffett">{BUFFETT_NOTE} {row.buffett.qualified ? "門檻通過" : "門檻沒過"}（不給分）</p>
      {row.buffett.rows.map((item) => <p key={item.key} className="muted">{item.label}：{settings.buffettOn[item.key as keyof typeof settings.buffettOn] ? (item.pass ? "過" : item.status === "unverified" ? "未驗證" : "沒過") : "不看"}。{item.detail}</p>)}
      <h3>葛拉漢</h3>
      <p data-testid="detail-graham">{GRAHAM_NOTE} {row.graham.qualified ? "門檻通過" : "門檻沒過"}（不給分）</p>
      {row.graham.rows.map((item) => <p key={item.key} className="muted">{item.label}：{settings.grahamOn[item.key as keyof typeof settings.grahamOn] ? (item.pass ? "過" : item.status === "unverified" ? "未驗證" : "沒過") : "不看"}。{item.detail}</p>)}
      <div className="row">
        <button type="button" className="btn" onClick={onFav}>{favorite ? "已收藏" : "收藏"}</button>
        <a className="btn" data-testid="detail-share-line" href={lineHref(text)}>用 Line 分享</a>
        <button type="button" className="btn" data-testid="detail-share-web" onClick={async () => {
          if (navigator.share) {
            try { await navigator.share({ title: `${stock.id} ${stock.name}`, text }); return; } catch { /* user cancelled */ }
          }
          await copyText(text);
          toast("已複製摘要");
        }}>系統分享</button>
        <button type="button" className="btn" onClick={() => copyText(text)}>複製</button>
        <button type="button" className="btn" data-testid="detail-export-pdf" onClick={() => exportReport(stock.id, `${stock.id} ${stock.name}`, reportLines(row, stock, settings), "pdf")}>匯出 PDF</button>
        <button type="button" className="btn" data-testid="detail-export-image" onClick={() => exportReport(stock.id, `${stock.id} ${stock.name}`, reportLines(row, stock, settings), "image")}>匯出圖片</button>
      </div>
      <h3>市值參考</h3>
      <p>{fmt(stock.mcapBillion)} 億元，母體排名 {stock.mcapRank ?? "未驗證"}／{stock.mcapUniverse ?? "未驗證"}。指數：{stock.indexMember}。外陸資 {fmt(stock.foreignPct)}%（{stock.foreignDate}）。</p>
      <h3>燈號理由</h3>
      <p>{stock.lightReason}（{stock.lightDate}）</p>
      {technicalLights(stock).map((item) => <p key={item.name} className="muted">{item.name}：{item.detail}</p>)}
      <p className="muted">3 個月均價 {fmt(stock.avg3m)}，6 個月均價 {fmt(stock.avg6m)}。</p>
      <h3>基本面</h3>
      <p>ROE {fmt(stock.roe)}% · 負債比 {fmt(stock.debt)}% · 營收年增 {fmt(stock.revenueYoy)}%（{stock.revenueMonth}）· 本益比 {fmt(stock.pe)}</p>
      {settings.display !== "novice" && topReasons(stock).map((reason) => <p key={reason}>{reason}</p>)}
      {settings.display === "pro" && (
        <details>
          <summary>18 位專家</summary>
          {experts(stock).map((expert) => <p key={expert.id}>{expert.id}. {expert.name}（{expert.status}）：{expert.text}</p>)}
        </details>
      )}
      <p className="muted">ChatGPT 對照只記種子裡的標記「{stock.externalAi}」，沒有對照原文，不計分、不另寫意見。</p>
      <Plain term="星等" />
    </div>
  );
}

function MasterSet({ title, gateId, enabled, onToggle, principle, tradeoff, rows, flags, onFlag, prefix, caps }: {
  title: string;
  gateId: string;
  enabled: boolean;
  onToggle: () => void;
  principle: string;
  tradeoff: string;
  rows: { key: string; label: string; missed: number; unverified: number; failed: number }[];
  flags: Record<string, boolean>;
  onFlag: (key: string) => void;
  prefix: string;
  caps: { id: string; label: string; value: number; set: (value: number) => void }[];
}) {
  return (
    <div>
      <h3>{title}</h3>
      <p data-testid={`${prefix}-note`}>{principle}</p>
      <p data-testid={`${prefix}-tradeoff`}>{tradeoff}</p>
      <label><input data-testid={gateId} type="checkbox" checked={enabled} onChange={onToggle} /> 用這組當門檻（預設關）</label>
      {rows.map((row) => (
        <div key={row.key}>
          <label>
            <input data-testid={`${prefix}-on-${row.key}`} type="checkbox" checked={flags[row.key] !== false} onChange={() => onFlag(row.key)} /> {row.label}
          </label>
          <span data-testid={`${prefix}-fail-${row.key}`}> 沒過 {row.missed}（未驗證 {row.unverified}、查了但沒過 {row.failed}）</span>
        </div>
      ))}
      {caps.map((cap) => (
        <label key={cap.id} className="muted">{cap.label}
          <input data-testid={cap.id} type="number" value={cap.value} onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) cap.set(next);
          }} />
        </label>
      ))}
    </div>
  );
}

function Plain({ term }: { term: string }) {
  return <details><summary>白話：{term}</summary><p>{GLOSSARY[term]}</p></details>;
}
