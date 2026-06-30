# NEKO Checker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](https://chromewebstore.google.com/detail/neko-checker/epcdbchhjbmpmhmkdpmadiaadhfoojdn)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-%E3%82%A4%E3%83%B3%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AB-4285F4.svg?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/neko-checker/epcdbchhjbmpmhmkdpmadiaadhfoojdn)
![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow.svg?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E.svg?logo=javascript&logoColor=black)

**Notice Every Kind of Oversight**

[English](README.md)

Web制作の現場で気づきにくいトラブルを、ツールバーの黒猫アイコンで即座に可視化するChrome拡張機能です。

## 検出対象

- `console.log` / `info` / `debug` / `warn` がページに残っている
- `console.error` や未キャッチの例外が発生している
- `og:title` / `og:description` / `og:image` / `og:url` の問題
- `og:image` のリンク切れ
- HTTP 4xx / 5xx ネットワークエラー
- 接続失敗（DNS解決失敗、接続拒否等）

## 猫の表情で状態がわかる

| 状態       | 表情       | 背景色       |
| ---------- | ---------- | ------------ |
| 問題なし   | 正面顔     | 透明         |
| OGタグ異常 | 左上を見る | 黄色         |
| ログあり   | 上を見る   | 灰色         |
| エラーあり | 右上を見る | 赤色         |
| 複数の問題 | 怒り顔     | 最も深刻な色 |

## インストール

### Chrome Web Store

[NEKO Checker - Chrome Web Store](https://chromewebstore.google.com/detail/neko-checker/epcdbchhjbmpmhmkdpmadiaadhfoojdn) からインストール

### 開発版

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `neko-checker` フォルダを選択

## 使い方

- 任意のページを開くと、ツールバーの猫アイコンが問題に応じて変化します
- アイコンをクリックするとポップアップで検出内容の詳細を確認できます
- アイコンにホバーすると件数のサマリーがツールチップで表示されます

## 設定

検出項目は細かくON/OFFできます。ポップアップ下部の「設定」ボタンから設定画面を開けます。

| カテゴリ     | 設定項目                                                             |
| ------------ | -------------------------------------------------------------------- |
| OGタグ       | `og:title` / `og:description` / `og:image` / `og:url` 個別に切替可能 |
| Consoleログ  | `log` / `info` / `debug` / `warn` 個別に切替可能                     |
| エラー       | `console.error` / 未キャッチ例外 / 未処理rejection 個別に切替可能    |
| ネットワーク | HTTP 4xx / HTTP 5xx / 接続エラー 個別に切替可能                      |

## テスト

Puppeteer による E2E テストが用意されています。

```bash
npm install
npm test
```

## ファイル構成

```
manifest.json          MV3 マニフェスト
background.js          Service Worker（状態管理・アイコン描画）
content-main.js        MAIN world（console傍受）
content-isolated.js    ISOLATED world（OG検査・メッセージ中継）
popup.html/css/js      ポップアップ UI
options.html/css/js    設定画面
welcome.html/css/js    ウェルカムページ
_locales/              i18n（日本語・英語）
icons/                 猫アイコン（表情5種 + マニフェスト用）
test/                  Puppeteer E2E テスト + フィクスチャ
```

## 技術構成

- Chrome Extension Manifest V3
- 外部ライブラリなし（すべて素のJavaScript）
- OffscreenCanvas で表情PNGに背景色を合成してアイコン描画
- MAIN world でconsoleオブジェクトをラップ（ページと同じ実行コンテキスト）
- `chrome.webRequest` でネットワークエラーを監視
- `chrome.storage.sync` で設定を永続化
- `chrome.i18n` で日本語・英語対応

## 動作環境

Chrome 111 以降（content_scripts の `"world": "MAIN"` に対応）

## ライセンス

MIT
