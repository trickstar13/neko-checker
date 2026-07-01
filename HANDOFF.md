# Neko Checker — Claude Code 移行用ハンドオフドキュメント

## プロジェクト概要

ウェブ制作の現場で気づきにくいトラブルを、ツールバーの黒猫アイコンで即座に可視化するChrome拡張機能。

### 検出対象

1. 作業用 `console.log` / `console.info` / `console.debug` / `console.warn` がページに残っている
2. `console.error` や未キャッチの例外（`window.onerror`、`unhandledrejection`）が発生している
3. `og:image` がリンク切れになっている
4. `og:description` や `og:title` が空または未設定

### UIコンセプト

- ツールバーアイコンはピクセルアートの黒猫
- 問題がなければ猫の顔だけが表示される
- 問題が検出されると、猫の周囲にインジケータが出現する
  - 左（黄色）: OGタグの問題
  - 中央（グレー）: console.log 系の出力がある
  - 右（赤）: エラーがある
- クリックでポップアップが開き、詳細なリストを確認できる
- ホバーでツールチップにサマリーが表示される
- デジタルレトロなピクセルアートの可愛い雰囲気を目指している

---

## アーキテクチャ

Manifest V3 準拠。4層構成。

```
┌────────────────────────────────────────┐
│          Service Worker (background.js)          │
│  - タブごとの状態管理 (Map)                        │
│  - OffscreenCanvas でアイコン動的描画              │
│  - chrome.action.setIcon / setTitle              │
│  - ポップアップへのデータ提供                       │
└─────────────┬──────────────────────────┘
              │ chrome.runtime.sendMessage
┌─────────────┴──────────────────────────┐
│     Content Script - ISOLATED world              │
│            (content-isolated.js)                 │
│  - OG メタタグの読み取り・検証                      │
│  - og:image の Image element による到達確認         │
│  - MAIN world からの CustomEvent 受信→転送         │
│  - document_start で実行                          │
│    （OG チェックは DOMContentLoaded 後に遅延実行）   │
└─────────────┬──────────────────────────┘
              │ document.dispatchEvent(CustomEvent)
              │ ※ detail は JSON 文字列で受け渡し
┌─────────────┴──────────────────────────┐
│      Content Script - MAIN world                 │
│            (content-main.js)                     │
│  - console.log/info/debug/warn/error のラップ     │
│  - window error / unhandledrejection リスナー     │
│  - document_start で実行（ページスクリプトより先）    │
└────────────────────────────────────────┘
```

### なぜ MAIN world が必要か

Content Script はデフォルトで ISOLATED world で実行され、ページの `console` オブジェクトにアクセスできない。`console.log` をフックするには、ページと同じ JavaScript コンテキスト（MAIN world）にスクリプトを注入する必要がある。Chrome 111+ の `"world": "MAIN"` 宣言で実現。

### アイコン描画の仕組み

Service Worker 内で `OffscreenCanvas` を使い、16×16 と 32×32 の両サイズでアイコンを描画。ベースの猫ピクセルアートは文字列グリッドとして `background.js` に埋め込まれており、状態に応じてインジケータドットを重ねて描画する。`chrome.action.setIcon({ tabId, imageData: { '16': ..., '32': ... } })` でタブごとに更新。

---

## ファイル構成

```
neko-checker/
├── manifest.json          # MV3 マニフェスト
├── background.js          # Service Worker（状態管理・アイコン描画）
├── content-main.js        # MAIN world（console 傍受）
├── content-isolated.js    # ISOLATED world（OG 検査・メッセージ中継）
├── popup.html             # ポップアップ UI
├── popup.css              # ポップアップスタイル（レトロ調）
├── popup.js               # ポップアップロジック
├── generate_icons.py      # アイコン PNG 生成スクリプト（開発用）
├── icons/
│   ├── icon16.png         # 16×16（ツールバー）
│   ├── icon32.png         # 32×32（HiDPI ツールバー）
│   ├── icon48.png         # 48×48（拡張機能管理画面）
│   └── icon128.png        # 128×128（Chrome Web Store）
└── HANDOFF.md             # このドキュメント
```

---

## 技術的な判断とその根拠

### console.log 検出方式 → MAIN world injection + monkey-patching

他の方式（chrome.debugger API など）も検討したが、debugger API はユーザーに警告バーが表示されるため常時使用には不向き。MAIN world での console オブジェクトのラップが最も自然で、Tampermonkey 等のメジャーな拡張でも採用されている実績のある方式。

### MAIN world と ISOLATED world の通信方式 → CustomEvent + JSON string

当初 `window.postMessage` を使用していたが、Chrome の world 間で `event.source` の同一性比較が不安定な場合があるため、`document.dispatchEvent(new CustomEvent(...))` に変更。`detail` にオブジェクトを直接渡すと world 間のクローン処理で問題が出る可能性があるため、JSON 文字列化して受け渡している。

### 動的アイコン → OffscreenCanvas（事前生成PNGではなく）

8パターン（2³）の静的 PNG を事前生成する方式も検討したが、将来的にカウント表示やアニメーション的な要素を追加する拡張性を考慮して OffscreenCanvas による動的描画を選択。Chrome 公式ドキュメントでも推奨されている方式。

### ポップアップのスタイル → ダーク・モノスペース・レトロ調

ピクセルアートのアイコンとの統一感を出すため、ダーク背景 + モノスペースフォント + 角ばったUI要素でレトロターミナル風に。

---

## 現在の状態（v0.1.0 プロトタイプ）

### 動作するもの

- console.log / info / debug / warn / error の検出と分類
- window.onerror / unhandledrejection の検出
- og:title, og:description, og:image, og:url の有無チェック
- og:description / og:title の空チェック
- og:image の到達確認（Image element による検証）
- タブごとの状態管理
- OffscreenCanvas による動的アイコン描画（16×16, 32×32）
- ツールチップへのサマリー表示
- ポップアップでの詳細リスト表示
- ページ遷移時の状態リセット

### v0.1.0 → v0.1.1 で修正した不具合

- ISOLATED world の Content Script を `document_idle` → `document_start` に変更。ページのインラインスクリプトによる console.log 等が、ISOLATED world のリスナー登録前に発火して取りこぼされる問題を解消。
- MAIN world → ISOLATED world の通信を `window.postMessage` から `document.dispatchEvent(new CustomEvent(...))` + JSON 文字列に変更。world 間の postMessage が正しく受信されない場合がある問題に対応。
- og:image のリンク切れ確認を `fetch HEAD` から `Image` 要素に変更。CORS 制約を回避。

### 注意事項

- `file://` で開いたローカル HTML でテストする場合は、`chrome://extensions` で「ファイルの URL へのアクセスを許可する」をONにする必要がある。

### 未実装・改善が必要なもの

- アイコンの吹き出しデザイン（現状はドット表示。元の要望は「！」「…」入りの吹き出し形状）
- 32×32 での吹き出しの視認性向上（現状のインジケータが小さい可能性）
- 猫のピクセルアートの洗練（耳の形、表情のバリエーションなど）
- console.log の除外パターン設定（拡張機能自身のログや特定のライブラリのログを無視する機能）
- SPA（Single Page Application）でのルート変更検知
- Twitter Card メタタグ（twitter:card, twitter:image 等）の検査
- 設定画面（有効/無効の切り替え、検出対象のカスタマイズ）
- 日英切り替え対応

---

## 動作確認手順

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `neko-checker` フォルダを選択
5. 任意のウェブページを開き、ツールバーのアイコンを確認
6. DevTools のコンソールで `console.log("test")` を実行して、アイコンが変化することを確認

### テスト用 HTML（OGタグの問題を確認する場合）

```html
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="テストページ">
  <meta property="og:description" content="">
  <meta property="og:image" content="https://example.com/nonexistent.jpg">
</head>
<body>
  <script>
    console.log("これはテストログです");
    console.warn("これは警告です");
    console.error("これはエラーです");
  </script>
</body>
</html>
```

---

## Claude Code での作業に適した改善タスク

以下はローカルで `chrome://extensions` にリロードしながら反復的に調整するのに向いたタスク。

1. **アイコンデザインの調整** — 32×32 での吹き出し形状をより「吹き出し」らしくする。fillCircle の代わりに吹き出し形のパスを描画する。猫のピクセルアートの精度向上。
2. **ポップアップ UI の改善** — スクロール挙動、項目のコピー機能、フィルタリング、タイムスタンプ表示など。
3. **SPA 対応** — `history.pushState` / `popstate` をフックしてルート変更を検知し、OGタグを再チェックする。
4. **除外パターン** — `chrome.storage.sync` を使った設定の永続化と、特定パターンのログ除外機能。
5. **Twitter Card 対応** — `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` の検査を追加。
6. **パフォーマンス** — 大量のログが発生するページでのメモリ使用量制御（ログの上限設定、古いエントリの破棄）。

---

## 依存関係

外部ライブラリなし。すべて素の JavaScript で実装。アイコン生成スクリプトのみ Python + Pillow に依存（開発時のみ）。

## ライセンス

未定（個人プロジェクト）。

---

*このドキュメントは 2026-06-26 時点の状態を反映しています。*

---

## v0.2.0 デザイン変更 — 表情パターン方式

### 概要

インジケータドット（黄・グレー・赤の点）を猫に重ねる方式から、猫自身の表情で状態を伝える方式に変更。

### 5パターンのアイコン

| ファイル名 | 状態 | 猫の表情 |
|---|---|---|
| `neko-base.png` | 問題なし | 正面顔 |
| `neko-og.png` | OG異常のみ | 左上を見る、左耳伏せ |
| `neko-logs.png` | ログのみ | 上を見る |
| `neko-errors.png` | エラーのみ | 右上を見る、右耳伏せ |
| `neko-multi.png` | 2つ以上の問題 | イカ耳 |

すべて 32×32 背景透過 PNG。`icons/` フォルダに配置済み。

### 状態→パターンのマッピング（background.js で実装が必要）

```javascript
function getIconPath(state) {
  const hasOg     = state.ogIssues.length > 0;
  const hasLogs   = state.logs.length > 0;
  const hasErrors = state.errors.length > 0;

  const count = [hasOg, hasLogs, hasErrors].filter(Boolean).length;

  if (count === 0) return 'icons/neko-base.png';
  if (count >= 2)  return 'icons/neko-multi.png';
  if (hasOg)       return 'icons/neko-og.png';
  if (hasLogs)     return 'icons/neko-logs.png';
  if (hasErrors)   return 'icons/neko-errors.png';
}
```

### Claude Code での作業内容

1. `background.js` の `updateIcon` 関数を OffscreenCanvas 描画 → `chrome.action.setIcon({ path })` 方式に書き換え
2. `renderIcon` 関数と `CAT_GRID` / `PALETTE` データ、`fillCircle` 関数を削除
3. 上記の `getIconPath` ロジックを実装
4. 静的アイコン（icon16/32/48/128.png）はマニフェスト用で変更不要
