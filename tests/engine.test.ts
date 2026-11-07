import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toInput } from "../lib/canslim";
import { computeBuffett, computeGraham } from "../lib/masters";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  overlapIds,
  priorityBuys,
  rankMagic,
  rankUniverse,
  scoreCanslim,
  scoreStock,
  summarizeCanslim,
  type CanslimItemInput,
  type CanslimKey,
  type ScoredStock,
} from "../lib/engine";
import type { BundleStock } from "../lib/types";

const bundle = JSON.parse(readFileSync(new URL("../data/bundle.json", import.meta.url), "utf8")) as { stocks: BundleStock[] };
const settings = normalizeSettings(DEFAULT_SETTINGS);
const inputs = bundle.stocks.map((stock) => toInput(stock));
const scored = inputs.map((stock) => scoreStock(stock, settings));
const stat = summarizeCanslim(scored.map((row) => row.canslim));

mkdirSync(new URL("../test-artifacts/", import.meta.url), { recursive: true });
writeFileSync(new URL("../test-artifacts/canslim-stats.json", import.meta.url), JSON.stringify(stat, null, 2));

assert.equal(stat.universe, 30);
assert.equal(stat.passAll, 0);
for (const row of stat.rows) {
  assert.equal(row.missed, row.unverified + row.failed);
  assert.equal(row.passed + row.missed, 30);
}
assert.equal(stat.rows.find((row) => row.key === "C")?.unverified, 30);
assert.equal(stat.rows.find((row) => row.key === "L")?.unverified, 30);
assert.equal(stat.rows.find((row) => row.key === "M")?.unverified, 30);

const tsmc = scored.find((row) => row.stock.id === "2330");
assert.ok(tsmc);
assert.equal(tsmc.pieces.some((piece) => piece.key === "magic"), false);
assert.equal(tsmc.pieces.find((piece) => piece.key === "canslim")?.included, false);
assert.equal(tsmc.sum, tsmc.system.score);
const book = rankUniverse(inputs, settings);
assert.equal(book.pool.length, 0);
assert.equal(book.core.length, 0);
const openGate = normalizeSettings({ ...settings, canslimGate: false, gates: { ...settings.gates, g5: false } });
const opened = rankUniverse(inputs, openGate);
assert.equal(opened.pool.length, 5);
assert.equal(opened.core.length, 3);
assert.ok(opened.pool.length < 30);
assert.ok(priorityBuys(opened.core).every((row: ScoredStock) => row.light === "green"));
assert.deepEqual(overlapIds(["a", "b"], ["b", "c"]), ["b"]);
const tsmcStock = bundle.stocks.find((stock) => stock.id === "2330");
assert.ok(tsmcStock);
const graham = computeGraham({
  price: tsmcStock.close,
  pe: 24.75,
  pb: 8.61,
  priceDate: tsmcStock.priceDate,
  priceSource: tsmcStock.priceSource,
  valuationDate: "2026-11-06",
  valuationSource: "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
});
assert.equal(graham.state, "ranked");
assert.ok((graham.grahamNumber || 0) > 0);
assert.ok(graham.margin != null);
const negativeBook = computeGraham({
  price: 100,
  pe: 10,
  pb: -1,
  priceDate: "2026-11-06",
  priceSource: "test",
  valuationDate: "2026-11-06",
  valuationSource: "test",
});
assert.equal(negativeBook.state, "excluded");
assert.match(negativeBook.reason, /不適用/);
const missingValuation = computeGraham({
  price: 100,
  pe: null,
  pb: 1,
  priceDate: "2026-11-06",
  priceSource: "test",
  valuationDate: null,
  valuationSource: null,
});
assert.equal(missingValuation.state, "excluded");
assert.match(missingValuation.reason, /未驗證/);

const facts = {
  roe: tsmcStock.roe,
  debt: tsmcStock.debt,
  fcfQuarters: tsmcStock.fcfQuarters,
  fcfTtm: tsmcStock.fcfTtm,
  gmTrend: tsmcStock.gmTrend,
  mcapBillion: tsmcStock.mcapBillion,
  reportQuarter: tsmcStock.reportQuarter,
  priceDate: tsmcStock.priceDate,
  statementSource: tsmcStock.statementSource,
  fcfSource: tsmcStock.fcfSource,
};
const assumptions = {
  weights: settings.buffettWeights,
  roeMin: settings.buffettRoeMin,
  debtCap: settings.buffettDebtCap,
  growth: settings.buffettGrowth,
  discount: settings.buffettDiscount,
};
const buffett = computeBuffett(facts, assumptions);
assert.equal(buffett.items.find((item) => item.key === "roe")?.status, "unverified");
assert.match(buffett.items.find((item) => item.key === "roe")?.detail || "", /不能評/);
assert.equal(buffett.items.find((item) => item.key === "debt")?.status, "verified");
assert.equal(buffett.items.find((item) => item.key === "fcf")?.status, "verified");
assert.equal(buffett.items.find((item) => item.key === "margin")?.status, "verified");
assert.equal(buffett.items.find((item) => item.key === "dcf")?.status, "verified");
assert.ok(buffett.score != null);
assert.equal(Math.round(buffett.completeness), 80);
const heavy = computeBuffett(facts, { ...assumptions, weights: { ...assumptions.weights, dcf: 80 } });
assert.notEqual(Math.round((heavy.score || 0) * 10), Math.round((buffett.score || 0) * 10));
const noDiscount = computeBuffett(facts, { ...assumptions, growth: 0.1, discount: 0.1 });
assert.equal(noDiscount.items.find((item) => item.key === "dcf")?.status, "unverified");
assert.ok(noDiscount.completeness < buffett.completeness);
const onlyDebt = computeBuffett(facts, { ...assumptions, weights: { roe: 20, debt: 15, fcf: 0, margin: 0, dcf: 0 } });
const debtScore = onlyDebt.items.find((item) => item.key === "debt")?.score || 0;
assert.ok(onlyDebt.score != null);
assert.ok(Math.abs(onlyDebt.score - debtScore) < 0.01);
assert.equal(settings.rankingMethod, "system");
const buffettRank = normalizeSettings({ ...openGate, rankingMethod: "buffett" });
assert.equal(buffettRank.rankingMethod, "buffett");
assert.equal(buffettRank.buffettWeights.dcf, 40);

const ranked = rankMagic([
  { id: "A", industry: "半導體業", roc: 30, ey: 10, gatePass: true },
  { id: "B", industry: "半導體業", roc: 10, ey: 30, gatePass: true },
  { id: "U", industry: "油電燃氣業", roc: 99, ey: 99, gatePass: true },
  { id: "F", industry: "金融保險業", roc: 80, ey: 80, gatePass: true },
  { id: "D", industry: "半導體業", roc: null, ey: 5, gatePass: true },
  { id: "E", industry: "半導體業", roc: 50, ey: 50, gatePass: false },
]);
assert.equal(ranked.byId.get("U")?.state, "excluded");
assert.equal(ranked.byId.get("F")?.state, "excluded");
assert.equal(ranked.byId.get("D")?.state, "unverified");
assert.equal(ranked.byId.get("E")?.state, "gated");
assert.equal(ranked.top.length, 2);
assert.equal(ranked.byId.get("A")?.state, "ranked");
assert.equal(ranked.byId.get("B")?.state, "ranked");
const rankA = ranked.byId.get("A");
const rankB = ranked.byId.get("B");
if (rankA?.state === "ranked" && rankB?.state === "ranked") {
  assert.equal(rankA.combined, rankB.combined);
  assert.equal(rankA.rank, 1);
  assert.equal(rankB.rank, 2);
} else {
  assert.fail("expected ranked A and B");
}

function item(key: CanslimKey, pass: boolean): CanslimItemInput {
  return { key, status: pass ? "verified" : "unverified", partial: pass ? 100 : null, pass, detail: pass ? "過" : "未驗證", source: pass ? "test" : null, date: pass ? "2026-11-06" : null };
}
const base = { ...inputs[0], canslimItems: (["C", "A", "N", "S", "L", "I", "M"] as CanslimKey[]).map((key) => item(key, key !== "C")) };
const blocked = scoreCanslim(base, settings);
assert.equal(blocked.qualified, false);
assert.equal(blocked.score, 0);
assert.ok(blocked.missing.some((row) => row.key === "C"));
const relaxed = scoreCanslim(base, normalizeSettings({ ...settings, canslimOn: { ...settings.canslimOn, C: false } }));
assert.equal(relaxed.qualified, true);
assert.ok(relaxed.score > 0);
assert.equal(relaxed.missing.some((row) => row.key === "C"), false);

const weights = normalizeSettings({
  ...settings,
  canslimOn: { C: false, A: false, N: true, S: false, L: false, I: true, M: false },
  canslimWeights: { C: 10, A: 10, N: 20, S: 10, L: 10, I: 80, M: 10 },
});
const weighted = scoreCanslim({ ...base, canslimItems: (["C", "A", "N", "S", "L", "I", "M"] as CanslimKey[]).map((key) => item(key, true)) }, weights);
assert.equal(weighted.qualified, true);
assert.equal(Math.round(weighted.score), 100);

const fpcc = ranked;
void fpcc;
console.log(JSON.stringify(stat));
