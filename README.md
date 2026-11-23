# Moonlight Trainer

ベートーヴェン《月光ソナタ》第3楽章の冒頭を、鍵盤の位置と右手の指の動きで覚える練習アプリです。[GitHub Pages で開く](https://keni0506-afk.github.io/moonlight-trainer/)

## 使い方

1. iPhone では画面を横向きにします。鍵盤は一画面に収まり、練習や再生中も移動しません。
2. 4・8・15音を選び、黄色い鍵盤を順に押します。「指の目安」は練習用の運指です。間違えると同じ音に留まり、正しく押すと次へ進みます。
3. 「練習のお手本」で、選んだ長さの右手を再生します。速度は音の間隔が 1,100・750・430 ms の3段階です。右手の最初の16分休符にも同じ長さを使います。
4. 「高速 ♩=168」で、冒頭2小節を両手で再生します。168 BPM はこのアプリで使う目安です。練習音数と速度の設定に関係なく再生し、表示範囲内の右手音を光らせます。
5. 「次の音」で練習中の音を確認できます。再生中のボタンを押すと停止し、「最初から」で練習位置をリセットします。

## 譜面と音源

- Ludwig van Beethoven、ピアノソナタ第14番 嬰ハ短調 Op. 27 No. 2、第3楽章 *Presto agitato*、第1・2小節。Universal Edition の Wiener 版（譜面 p. 42）と、Mutopia Project の掲載譜（Winterberger 校訂、p. 8）で、音高・発音位置・音価・休符・スタッカートを照合しました。[Wiener 版（IMSLP）](https://s9.imslp.org/files/imglnks/usimg/8/82/IMSLP508466-PMLP1458-Beethoven.op27no2.sonata.no14.moonlight.wiener.pdf) · [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=276)
- 第1小節の右手は16分休符から入り、G♯2 から始まる16分音符15音が続きます。第2小節は右手の16分音符12音と、スタッカートの8分和音2つです。両小節の左手はスタッカートの8分音符で進み、第2小節末尾付近には低音のオクターブがあります。
- 音は Web Audio API で三角波を合成しています。スタッカートの発音時間は譜面上の音価の半分とし、残りの時間を空けます。実演録音や外部の音声・楽譜ファイルの配信はありません。

## 構成とテスト

- `index.html` に画面、固定鍵盤、練習ロジック、冒頭の音列、音声合成が入っています。ビルドなしでブラウザーから開けます。
- `tests/trainer.test.cjs` は WebKit と Chromium で、練習操作、再生タイミング、中断、横画面の固定表示を検証します。Web Audio を搭載しないテストブラウザーでは、代替APIでスケジューリングを検証します。Node.js 22 で以下を実行します。

```sh
npm ci
npx playwright install chromium webkit
npm test
```

## GitHub Pages

公開元は `main` のルートです。変更を `main` に push すると、Actions の **pages build and deployment** が実行されます。成功後に公開URLを開き、最新の内容を確認してください。新規設定時は **Settings → Pages → Deploy from a branch → main → /(root)** を選びます。[公開元の設定手順](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
