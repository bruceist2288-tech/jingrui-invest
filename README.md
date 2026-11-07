# 璟睿投資理財

台股研究頁。先看關卡，再選一種排名。不會自動下單。

公開網站預計在 [https://bruceist2288-tech.github.io/jingrui-invest/](https://bruceist2288-tech.github.io/jingrui-invest/)。路徑前綴是 `/jingrui-invest`。

## 怎麼改

```bash
npm install
npm run dev
```

本機打開 [http://127.0.0.1:43123/jingrui-invest/](http://127.0.0.1:43123/jingrui-invest/)。

`npm run build` 會輸出靜態檔到 `out/`。推上 `main` 後，`.github/workflows/pages.yml` 會建置並發到 GitHub Pages。

## 目錄

- `app/`：頁面、版面、PWA manifest
- `components/AppClient.tsx`：六個分頁與個股詳情
- `lib/engine.ts`：關卡、本系統分數、名單
- `lib/masters.ts`：葛拉漢、巴菲特
- `lib/formulas.ts`：公式說明
- `lib/canslim.ts`：CAN SLIM 門檻
- `data/bundle.json`：30 檔種子
- `data/valuation.json`：官方本益比、股價淨值
- `next.config.ts`：`basePath` 與 `assetPrefix` 都是 `/jingrui-invest`

排名在「我的」用單選切換：本系統、神奇公式、葛拉漢、巴菲特。缺資料標未驗證，不補數字。
