---
name: cc-usage
description: Claude Codeの使用率をリアルタイム表示する3Dキャラクターガジェットを起動する。「使用率」「usage」「ガジェット」などと依頼された時に使用。
argument-hint: "[start]"
allowed-tools: Bash(npx electron *)
---

# CC-Usage: Claude Code 使用率3Dキャラクターガジェット

デスクトップ上にかわいい3Dキャラクターを表示し、Claude Codeの使用率をリアルタイムで監視するElectronガジェット。

## 起動方法

```bash
cd ~/.claude/skills/cc-usage/scripts && npx electron .
```

## 機能

- 3Dキャラクターが使用率に応じてアニメーション変化
  - 0-50%: happy (緑ゲージ)
  - 50-80%: worried (黄ゲージ)
  - 80-100%: panic (赤ゲージ)
- 5分間隔で自動更新
- ドラッグで移動可能
- 右クリックメニュー（リフレッシュ/終了）
- Ctrl+Shift+U でトグル表示
- システムトレイ常駐

## 使用率の取得

`~/.claude/.credentials.json` のOAuthトークンを使い、`GET https://api.anthropic.com/api/oauth/usage` APIから正確な使用率を取得する（`/usage` 画面と同じデータソース）。
