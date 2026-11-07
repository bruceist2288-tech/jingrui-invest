import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const shots = "/workspace/test-artifacts";
mkdirSync(shots, { recursive: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> };
    nav.share = async (data) => {
      (window as unknown as { __shared?: unknown }).__shared = data;
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("app-ready")).toBeVisible();
});

test("六個分頁、關卡標題與神奇公式不進累加", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "璟睿投資理財" })).toBeVisible();
  await expect(page.getByTestId("list-header")).toContainText("關卡 1 2 3 4 5 6 全開");
  await expect(page.getByTestId("list-header")).toContainText("排名：本系統");
  await expect(page.getByTestId("list-header")).toContainText("CAN SLIM門檻關");
  await expect(page.getByTestId("list-header")).not.toContainText("＋神奇公式");
  await expect(page.getByTestId("priority-buys")).toContainText("優先買進");
  await expect(page.getByTestId("priority-note")).toContainText("沒有綠燈");
  await expect(page.getByTestId("no-auto-trade")).toContainText("不會自動下單");
  for (const tab of ["home", "rank", "industry", "explore", "risk", "me"]) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute("aria-current", "page");
  }
  await page.screenshot({ path: `${shots}/me.png`, fullPage: true });
});

test("CAN SLIM 未過統計、條件勾選與核心項警告", async ({ page }) => {
  await expect(page.getByTestId("canslim-universe")).toHaveText("30");
  await expect(page.getByTestId("canslim-pass-all")).toHaveText("0");
  await expect(page.getByTestId("miss-C-unverified")).toHaveText("30");
  await expect(page.getByTestId("miss-L-unverified")).toHaveText("30");
  await expect(page.getByTestId("miss-M-unverified")).toHaveText("30");
  await page.getByTestId("tab-me").click();
  await expect(page.getByTestId("canslim-on-C")).not.toBeChecked();
  await expect(page.getByTestId("canslim-on-N")).toBeChecked();
  await expect(page.getByTestId("canslim-on-I")).toBeChecked();
  await expect(page.getByTestId("canslim-gap-C")).toContainText("資料尚未取得，暫不套用");
  await expect(page.getByTestId("canslim-gap-M")).toContainText("資料尚未取得，暫不套用");
  await expect(page.getByTestId("canslim-fail-C")).toContainText("沒過 30");
  await expect(page.getByTestId("canslim-norm-note")).toContainText("不是 O'Neil");
  await expect(page.getByTestId("origin-canslim")).toContainText("O'Neil");
  await expect(page.getByTestId("origin-system")).toContainText("還沒有回測");
  await expect(page.getByTestId("origin-magic")).toContainText("Greenblatt");
  await expect(page.getByTestId("origin-magic")).toContainText("2005");
  await expect(page.getByTestId("magic-separate")).toContainText("名次");
  await page.getByTestId("canslim-gate").check();
  await expect(page.getByTestId("list-header")).toContainText("不看 C");
  await page.screenshot({ path: `${shots}/canslim-ticks.png`, fullPage: true });
});

test("神奇公式獨立名單、詳情名次與分享", async ({ page }) => {
  await page.getByTestId("tab-rank").click();
  await page.getByTestId("rank-mode-magic").click();
  await expect(page.getByTestId("magic-note")).toContainText("不是 0–100 分");
  await expect(page.getByTestId("magic-empty")).toContainText("未驗證");
  await page.screenshot({ path: `${shots}/magic-list.png`, fullPage: true });
  await page.getByTestId("search").fill("2330");
  await expect(page.getByTestId("detail-magic-rank")).toContainText("神奇公式排名：未驗證");
  await expect(page.getByTestId("detail-magic-rank")).toContainText("不進累加");
  await expect(page.getByTestId("detail-canslim-weights")).toContainText("CAN SLIM勾選");
  const href = await page.getByTestId("detail-share-line").getAttribute("href");
  expect(href).toContain("line.me");
  expect(decodeURIComponent(href || "")).toContain("神奇公式排名");
  expect(decodeURIComponent(href || "")).toContain("本系統權重");
  await page.getByTestId("detail-share-web").click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __shared?: { text?: string } }).__shared?.text || "")).toContain("神奇公式排名");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("detail-export-pdf").click()]);
  expect(download.suggestedFilename()).toContain(".pdf");
  const [image] = await Promise.all([page.waitForEvent("download"), page.getByTestId("detail-export-image").click()]);
  expect(image.suggestedFilename()).toContain(".jpg");
  await page.screenshot({ path: `${shots}/detail.png`, fullPage: true });
});

test("關卡立即重算、權重、持股與 PWA", async ({ page }) => {
  await page.getByTestId("tab-rank").click();
  await expect(page.getByTestId("core-count")).toHaveText("0");
  await expect(page.getByText("留現金")).toBeVisible();
  await page.getByTestId("tab-me").click();
  await page.getByTestId("canslim-gate").uncheck();
  await page.getByTestId("gate-g5").uncheck();
  await page.getByTestId("tab-rank").click();
  await expect(page.getByTestId("core-count")).toHaveText("5");
  await expect(page.getByRole("heading", { name: "預備名單" })).toBeVisible();
  await expect(page.getByTestId("list-header")).toContainText("已關閉：關卡5");
  await page.getByTestId("tab-me").click();
  await expect(page.getByTestId("gate-g2")).toBeDisabled();
  await page.getByTestId("weight-profit").fill("50");
  await expect(page.getByTestId("weight-warning")).toBeVisible();
  await page.getByTestId("weight-reset").click();
  await expect(page.getByTestId("weight-profit")).toHaveValue("20");
  await expect(page.getByTestId("weight-total")).toContainText("95");
  await page.getByTestId("level-advanced").click();
  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("card-reasons").first()).toBeVisible();
  await page.screenshot({ path: `${shots}/home.png`, fullPage: true });
  await page.getByTestId("tab-industry").click();
  await page.getByTestId("industry-select").selectOption("半導體業");
  await page.screenshot({ path: `${shots}/industry.png`, fullPage: true });
  await page.getByTestId("tab-explore").click();
  await page.getByTestId("explore-b").click();
  await expect(page.getByText("沒有已驗證的供應證據").or(page.getByText("NVIDIA"))).toBeVisible();
  await page.getByTestId("explore-c").click();
  await page.screenshot({ path: `${shots}/explore.png`, fullPage: true });
  await page.getByTestId("tab-risk").click();
  await expect(page.getByText("硬否決")).toBeVisible();
  await page.screenshot({ path: `${shots}/risk.png`, fullPage: true });
  await page.getByTestId("tab-me").click();
  await page.getByTestId("holding-id").fill("2330");
  await page.getByTestId("holding-shares").fill("10");
  await page.getByTestId("holding-cost").fill("3000");
  await page.getByTestId("holding-form").locator("button[type=submit]").click();
  await expect(page.getByTestId("stop-warning")).toBeVisible();
  await expect(page.getByTestId("notify-stub")).toContainText("尚未連接");
  const [backup] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-backup").click()]);
  expect(backup.suggestedFilename()).toContain("json");
  const manifest = page.locator("link[rel='manifest']");
  await expect(manifest).toHaveAttribute("href", /manifest/);
  await page.evaluate(async () => navigator.serviceWorker.ready);
});

test("葛拉漢與巴菲特排名", async ({ page }) => {
  await page.getByTestId("tab-me").click();
  await page.getByTestId("gate-g5").uncheck();
  await expect(page.getByTestId("rank-radio-buffett")).not.toBeChecked();
  await expect(page.getByTestId("buffett-note")).toContainText("依巴菲特公開原則量化，非本人公式");
  await expect(page.getByTestId("buffett-note")).toContainText("未回測");
  await expect(page.getByTestId("formula-guide")).toContainText("公式與計算方式");
  await expect(page.getByTestId("formula-guide")).toContainText("÷ 95 × 100");
  await expect(page.getByTestId("buffett-weight-dcf")).toHaveValue("40");
  await expect(page.getByTestId("buffett-weight-roe")).toHaveValue("20");
  await expect(page.getByTestId("buffett-growth")).toHaveValue("3");
  await expect(page.getByTestId("buffett-discount")).toHaveValue("10");
  await page.getByTestId("buffett-weight-dcf").fill("50");
  await expect(page.getByTestId("buffett-weight-warning")).toBeVisible();
  await page.getByTestId("buffett-weight-reset").click();
  await expect(page.getByTestId("buffett-weight-dcf")).toHaveValue("40");
  await expect(page.getByTestId("buffett-weight-total")).toContainText("100");
  await page.getByTestId("rank-radio-graham").check();
  await page.getByTestId("tab-rank").click();
  await expect(page.getByTestId("list-header")).toContainText("排名：葛拉漢");
  await expect(page.getByTestId("graham-list")).toBeVisible();
  await expect(page.getByTestId("graham-note")).toContainText("安全邊際");
  await page.getByTestId("rank-mode-buffett").click();
  await expect(page.getByTestId("list-header")).toContainText("排名：巴菲特");
  await expect(page.getByTestId("buffett-list")).toBeVisible();
  await page.getByTestId("search").fill("2330");
  await expect(page.getByTestId("detail-buffett")).toContainText("非本人公式");
  await expect(page.getByTestId("formula-detail")).toContainText("Graham Number");
  await expect(page.getByTestId("formula-detail")).toContainText("÷ 95 × 100");
  await expect(page.getByTestId("buffett-item-roe")).toContainText("未驗證");
  await expect(page.getByTestId("buffett-item-debt")).toContainText("負債比");
  await expect(page.getByTestId("buffett-item-dcf")).toContainText("折現");
  await expect(page.getByTestId("buffett-completeness")).toContainText("完整度");
  await expect(page.getByTestId("detail-graham")).toContainText("安全邊際");
  const href = await page.getByTestId("detail-share-line").getAttribute("href");
  const text = decodeURIComponent(href || "");
  expect(text).toContain("巴菲特");
  expect(text).toContain("完整度");
  expect(text).toContain("葛拉漢數");
  expect(text).not.toContain("巴菲特門檻");
  await page.screenshot({ path: `${shots}/masters.png`, fullPage: true });
});
