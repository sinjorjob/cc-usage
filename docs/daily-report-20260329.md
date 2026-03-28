# Daily Report - 2026-03-29

## セッション概要: Messages リアルタイム追跡 + Cosmos UI改善 + セッション検出安定化

### 前日からの課題
- `/context` の Messages 値がダッシュボードに反映されていなかった（常に 0.0%）
- Cosmos ビューのコンポーネント重なり問題
- `/compact` `/clear` 後のデータ更新問題

---

## 意思決定の流れ

### 1. Messages トークン取得方法の確定
- `/context` の Messages は会話の進行で変動する唯一のカテゴリ
- `claude -p "/context"` は毎回新セッションを作るため Messages ≈ 0 になる
- **JSONL 直接読み取り方式**を採用: `~/.claude/projects/{encoded-cwd}/{session-id}.jsonl` の `cache_read + cache_creation` から算出

### 2. Messages 計算ロジック
```
Messages = JSONL(cache_read + cache_creation) - baseline
baseline = System prompt + System tools + Memory files + Skills
         （deferred カテゴリと autocompact buffer は除外）
```

### 3. セッション検出の試行錯誤
| アプローチ | 結果 |
|-----------|------|
| file mtime でソート | compact が古いファイルに書き込むため誤検出 |
| file birthtime でソート | cli-provider のセッションを誤検出 |
| birthtime + フレッシュセッション fallback | cli-provider を拾ってしまう |
| **assistant timestamp でソート** | 最も信頼性が高い → 採用 |

### 4. セッション固定方針の決定
- Refresh のたびに autoDetect が走ると別セッションに切り替わる問題
- → **起動時のみ autoDetect、Refresh ではセッション固定**に決定
- セッション切り替えたい場合は cc-usage を再起動

---

## 実装の成果

### JSONL ベース Messages 追跡
- **SessionProvider** (`context/session-provider.js`): 全プロジェクトの JSONL を走査し、最新の assistant メッセージの timestamp でアクティブセッションを特定
- **auto-detect**: `_readLastAssistantUsage()` で最後の non-sidechain assistant メッセージから cache 値を取得
- **Messages 計算**: JSONL total - baseline（deferred/autocompact 除外）

### JSONL ファイルウォッチャー
- 10 秒間隔で JSONL の mtime を監視
- ファイル変更を検知したら baseline キャッシュを使って軽量リフレッシュ（cli-provider 再実行不要 = トークン消費なし）
- セッション切り替えはウォッチャーでは行わない（ピンポン問題の防止）

### Cosmos ビュー改善
| 改善項目 | 内容 |
|---------|------|
| たこ足（tendrils）削除 | 紙のように見えるため完全削除 |
| オーロラプラズマリボン | カテゴリ間リンクを 3 層ベジェ曲線 + ドリフトパーティクルに |
| 固定位置マップ | トークン量ソート依存 → カテゴリ名ベースの固定座標に |
| deferred フィルタリング | JSONL null 時（/clear 直後）も deferred カテゴリを除外 |

### 固定位置マップ（Cosmos ビュー）
| カテゴリ | 配置 |
|---------|------|
| Messages | 中央やや右 |
| Memory files | 右 |
| System prompt | 左下 |
| System tools | 右下 |
| Skills | 左 |
| Autocompact buffer | 左上 |

---

## コミット履歴（本日分）

| Hash | 内容 |
|------|------|
| `4be0c37` | JSONL ベース Messages 追跡 + Cosmos UI 修正 |
| `2ef0484` | JSONL auto-watch + compact 検知 + Cosmos ビジュアル改善 |
| `06bbcda` | セッション検出安定化 + 固定レイアウト + ウォッチャー修正 |
| `54639fb` | SKILL.md に /compact /clear 制約を明記 |

---

## 確定した設計方針

- **Messages 取得**: JSONL 直接読み取り（cache_read + cache_creation - baseline）
- **セッション検出**: assistant message timestamp 順でソート、起動時に確定
- **Refresh**: baseline 再取得 + JSONL 再読み込み（セッション切り替えなし）
- **ウォッチャー**: 現在ファイルの mtime 変更のみ監視（10 秒間隔）
- **Cosmos 配置**: カテゴリ名ベースの固定座標マップ

---

## 既知の制約

- `/compact` `/clear` 実行後は cc-usage の再起動が必要（セッション ID が変わるため）
- Messages の値は `/context` と比べて約 1-2K トークンの誤差がある（JSONL キャッシュ値と /context 推定値の計算方法の違い）
- baseline は cc-usage 起動元の CWD で算出されるため、異なるプロジェクトの CLAUDE.md 設定差で ~500 トークンの誤差が生じうる

---

## 残課題

- [ ] baseline を対象セッションの CWD で算出する改善（誤差 ~500 トークン削減）
- [ ] `/context` と完全一致する Messages 取得方法の調査（Claude Code 内部 API / countTokens API）
- [ ] Chart View のデータ表示改善
- [ ] 使用率バーのスタイル修正
