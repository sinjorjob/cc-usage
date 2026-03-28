# コンテキスト空間可視化ダッシュボード 設計書

> モック画面: [`docs/mock-dashboard.html`](./mock-dashboard.html) をブラウザで開いて確認

## 1. 概要

Claude Codeの`/context`コマンドが出力するコンテキスト空間情報を、**独立したElectronアプリ**としてわかりやすく可視化するダッシュボードを開発する。

### 現状の課題
- `/context`の出力はテキストベースで視認性が低い
- カテゴリ別のトークン消費量の比率が直感的に把握しにくい
- 残りコンテキスト空間の余裕度が一目でわからない

### ゴール
- コンテキスト使用状況をグラフィカルに可視化
- カテゴリ別の内訳を色分けで直感的に把握可能にする
- ボタン一つで最新データを取得・反映

### 設計方針
- **cc-usageガジェットとは独立した別アプリ**として開発
- データソースを抽象化し、モックデータで開発 → 本番データソースに差し替え可能
- Hook機能は使用しない（企業PC制約）

---

## 2. データソース設計

### 2.1 データ取得方式

**`claude -p "/context"` によるCLI実行**

Claude Code CLIの `-p`（print）モードを利用し、`/context`コマンドの出力をプログラムから取得する。

```
[Electron App]
  child_process.execFile('claude', ['-p', '/context'])
       ↓
  stdout にテキスト出力
       ↓
  context-parser.js でパース
       ↓
  JSON化してRendererへIPC送信
       ↓
  ダッシュボード表示更新
```

**トリガー方式:**

| トリガー | 説明 |
|---------|------|
| **手動更新ボタン** | ダッシュボード上の更新ボタンを押して即時取得 |
| **起動時** | アプリ起動直後に初回取得 |

### 2.2 データプロバイダー抽象化

データソースをインターフェースで抽象化し、差し替え可能にする。

```javascript
// data-provider.js（インターフェース）
class ContextDataProvider {
  async fetch() {
    // returns: { model, totalTokens, usedTokens, categories, mcpTools, ... }
    throw new Error('Not implemented');
  }
}

// mock-provider.js（開発用モックデータ）
class MockProvider extends ContextDataProvider {
  async fetch() {
    return MOCK_DATA; // 固定のサンプルデータを返す
  }
}

// cli-provider.js（本番用: claude -p "/context" 実行）
class CliProvider extends ContextDataProvider {
  async fetch() {
    const output = await exec('claude -p "/context"');
    return ContextParser.parse(output);
  }
}
```

**プロバイダー切替:**
```javascript
// main.js での初期化
const provider = config.useMock
  ? new MockProvider()
  : new CliProvider();
```

### 2.3 パーサー設計

`claude -p "/context"` のテキスト出力をJSONに変換するパーサーモジュール。

```
context-parser.js
  入力: /context のプレーンテキスト出力（ANSIエスケープ付き）
  出力: 構造化JSON
  処理:
    1. ANSI escape sequence を除去
    2. 正規表現でモデル名・トークン総量を抽出
    3. カテゴリ行を順次パースしてトークン数・%を抽出
    4. MCP tools / Memory files / Skills セクションを分割パース
```

### 2.4 JSONデータフォーマット（パース後）

```jsonc
{
  "timestamp": "2026-03-28T12:00:00.000Z",
  "model": "claude-opus-4-6[1m]",
  "totalTokens": 1000000,
  "usedTokens": 161000,
  "usagePercent": 16.1,
  "categories": {
    "systemPrompt":   { "tokens": 6300,   "percent": 0.6  },
    "systemTools":    { "tokens": 7300,   "percent": 0.7  },
    "memoryFiles":    { "tokens": 25100,  "percent": 2.5  },
    "skills":         { "tokens": 1500,   "percent": 0.2  },
    "messages":       { "tokens": 121100, "percent": 12.1 },
    "freeSpace":      { "tokens": 806000, "percent": 80.6 },
    "autocompact":    { "tokens": 33000,  "percent": 3.3  }
  },
  "mcpTools": [
    { "name": "mcp__github__add_issue_comment", "status": "available" }
  ],
  "memoryFileDetails": [
    { "path": "~/.claude/CLAUDE.md", "tokens": 1700 }
  ],
  "skillDetails": [
    { "name": "xlsx", "tokens": 113, "category": "user" },
    { "name": "ppt-creator", "tokens": 91, "category": "plugin" }
  ]
}
```

---

## 3. UI/UX設計

### 3.1 アプリ概要

独立した常駐型Electronアプリ。always-on-top対応。

| 項目 | 値 |
|------|-----|
| ウィンドウサイズ | 440 x 620px |
| フレーム | なし（フレームレス） |
| 背景 | 半透明ダーク |
| always-on-top | 設定で切替可 |
| タスクトレイ | アイコン常駐 |

### 3.2 ダッシュボード レイアウト

モック画面 (`mock-dashboard.html`) に基づく確定デザイン:

```
┌──────────────────────────────────────────┐
│ HEADER                                    │
│  claude-opus-4-6[1m]    [🔄] ← 更新ボタン│
│  1,000k tokens                            │
├──────────────────────────────────────────┤
│ ── CONTEXT USAGE ───────────────────     │
│                                           │
│ [████████░░░░░░░░░░░░] ← スタックドバー   │
│                                           │
│ ┌──────────┐  ■ Messages    121.1k 12.1% │
│ │ ドーナツ  │  ■ Autocompact  33.0k  3.3% │
│ │  161k    │  ■ Memory Files 25.1k  2.5% │
│ │ /1,000k  │  ■ System Tools  7.3k  0.7% │
│ │  16.1%   │  ■ System Prompt 6.3k  0.6% │
│ │          │  ■ Skills        1.5k  0.2% │
│ └──────────┘  □ Free Space  806.0k 80.6% │
│                                           │
│ ┌────────┐┌────────┐┌────────┐┌────────┐ │
│ │ 806k   ││ 33k    ││ 26     ││ 10     │ │
│ │Free tok││Autocomp││MCP Tool││Mem File│ │
│ └────────┘└────────┘└────────┘└────────┘ │
├──────────────────────────────────────────┤
│ ── DETAILS ─────────────────────────     │
│ [Memory Files (10)] [Skills (28)] [MCP (26)]│
│ ┌────────────────────────────────────┐   │
│ │ └ ~/.claude/ORCHESTRATOR.md  5.9k  │   │
│ │ └ ~/.claude/PERSONAS.md      4.6k  │   │
│ │ └ ~/.claude/MODES.md         3.2k  │   │
│ │ └ ...                              │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ ● Updated 12:00:00                       │
└──────────────────────────────────────────┘
```

### 3.3 カラーパレット（確定）

テラコッタ調ダークテーマ。モック画面で検証済み。

```javascript
const CONTEXT_COLORS = {
  messages:      '#C75B39', // 赤褐色（最もトークン消費が多い）
  autocompact:   '#9B7DC7', // 薄紫（バッファ）
  memoryFiles:   '#D08050', // テラコッタ
  systemTools:   '#7BA3C9', // 水色
  systemPrompt:  '#8B9DC3', // 薄青灰
  skills:        '#E8B84B', // ゴールド
  freeSpace:     '#222222', // ダークグレー
};
```

### 3.4 コンポーネント仕様

**ドーナツチャート（Canvas 2D）:**
- 外径: 140px, 内径: 90px, Canvas解像度: 300x300
- セグメント間ダークギャップ (0.008rad)
- 中央テキスト: 使用トークン数 / 総トークン数 + %
- 外周グロー: 使用率に応じた色 (green < 50% / yellow < 75% / red)
- ホバー: ツールチップ表示

**スタックドバー:**
- 高さ: 10px, 角丸: 5px
- ホバーで brightness(1.3) + ツールチップ

**サマリーカード (4枚):**
- Free tokens / Autocompact buf / MCP Tools数 / Memory Files数

**詳細タブパネル:**
- [Memory Files] [Skills] [MCP Tools] の3タブ
- タブにカウント数表示
- 最大高さ: 148px（スクロール可能）
- 各項目: ツリー記号 + 名前 + ミニプログレスバー + トークン数
- ソート: トークン数降順

**更新ボタン:**
- ヘッダー右上に配置
- クリックで `claude -p "/context"` 実行
- 実行中はスピナーアニメーション
- 成功/エラーをフッターのタイムスタンプで表示

---

## 4. アーキテクチャ設計

### 4.1 プロジェクト構成

cc-usageとは独立したプロジェクトとして構成。

```
cc-context-viewer/
  ├── package.json
  ├── main.js                    # Electron main process
  ├── preload.js                 # IPC bridge
  ├── data/
  │   ├── data-provider.js       # プロバイダーインターフェース
  │   ├── mock-provider.js       # モックデータ（開発用）
  │   ├── cli-provider.js        # claude -p "/context" 実行
  │   └── context-parser.js      # テキスト出力パーサー
  └── src/renderer/
      ├── index.html             # ダッシュボードHTML
      ├── app.js                 # エントリポイント + 更新制御
      ├── dashboard.js           # チャート・凡例・タブ描画
      └── dashboard.css          # スタイル
```

### 4.2 IPCメッセージ

```javascript
// Main → Renderer
'context-update'      // パース済みJSONデータ
'context-fetching'    // 取得中シグナル
'context-error'       // エラーメッセージ

// Renderer → Main
'request-refresh'     // 手動更新リクエスト
```

### 4.3 データフロー

```
┌──────────────────────────────────────────────────┐
│                 Main Process                      │
│                                                   │
│  [Manual trigger: 更新ボタン / 起動時]              │
│       ↓                                           │
│  DataProvider.fetch()                             │
│    ├── MockProvider: return MOCK_DATA             │
│    └── CliProvider:                               │
│          execFile('claude', ['-p', '/context'])   │
│               ↓                                   │
│          ContextParser.parse(stdout)              │
│               ↓                                   │
│          バリデーション                            │
│       ↓                                           │
│  IPC: 'context-update' → Renderer                │
└──────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│               Renderer Process                    │
│                                                   │
│  app.js                                           │
│    ├── on 'context-update' → dashboard.js         │
│    ├── on 'context-fetching' → スピナー表示       │
│    └── on 'context-error' → エラー表示            │
│                                                   │
│  dashboard.js                                     │
│    ├── drawDonutChart(canvas, data)               │
│    ├── drawStackedBar(data)                       │
│    ├── updateLegend(data.categories)              │
│    ├── updateSummaryCards(data)                   │
│    └── updateDetailTabs(data)                     │
└──────────────────────────────────────────────────┘
```

---

## 5. パフォーマンス要件

| 項目 | 目標値 |
|------|--------|
| CLI実行 (`claude -p`) | < 5秒 |
| パース処理 | < 50ms |
| ダッシュボード描画 | < 16ms |
| メモリ使用量 | < 80MB (Electron含む) |

---

## 6. 実装フェーズ

### Phase 1: 基盤 + モックデータ
1. プロジェクト初期化 (Electron + package.json)
2. `data-provider.js` - プロバイダーインターフェース
3. `mock-provider.js` - モックデータ実装
4. `main.js` - ウィンドウ作成 + IPC
5. `preload.js` - IPC bridge

### Phase 2: UI描画
6. `dashboard.css` - スタイル（モックHTMLから抽出）
7. `dashboard.js` - ドーナツチャート + スタックドバー
8. `dashboard.js` - カテゴリ凡例 + サマリーカード
9. `dashboard.js` - 詳細タブパネル (Memory/Skills/MCP)
10. `index.html` + `app.js` - 統合 + 更新ボタン

### Phase 3: 本番データソース接続
11. `context-parser.js` - `/context`出力テキストパーサー
12. `cli-provider.js` - `claude -p "/context"` 実行
13. プロバイダー切替設定
14. エラーハンドリング（CLI未インストール、タイムアウト等）

### Phase 4: 仕上げ
15. タスクトレイ常駐
16. 右クリックメニュー（更新 / 設定 / 終了）
17. ウィンドウ位置記憶
18. always-on-top切替

---

## 7. 将来拡張

- **時系列グラフ**: コンテキスト使用量の推移をミニ折れ線グラフで表示
- **アラート通知**: 80%超過時にシステムトースト通知
- **自動圧縮提案**: Autocompact発動タイミングの予測表示
- **セッション比較**: 複数セッションのコンテキスト効率を比較
- **cc-usageガジェット連携**: 3Dキャラクターアプリとのデータ共有
