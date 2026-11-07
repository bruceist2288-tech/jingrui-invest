import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toInput } from "../lib/canslim";
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
const sample = scored[0];
assert.equal(sample.graham.rows.find((row) => row.key === "pb")?.status, "unverified");
assert.equal(sample.graham.rows.find((row) => row.key === "dividend")?.pass, false);
const strictGraham = rankUniverse(inputs, normalizeSettings({ ...openGate, grahamGate: true, grahamPeMax: 0 }));
assert.ok(strictGraham.pool.length < opened.pool.length);

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
