/**
 * context-parser.js - Parse claude -p "/context" output into structured JSON
 */

function parseContextOutput(text) {
  // Strip ANSI escape codes
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '').trim();

  const result = {
    timestamp: new Date().toISOString(),
    model: '',
    totalTokens: 0,
    usedTokens: 0,
    usagePercent: 0,
    categories: [],
    freeSpace: { tokens: 0, percent: 0 },
    mcpTools: [],
    memoryFileDetails: [],
    skillDetails: [],
  };

  // Parse model
  const modelMatch = clean.match(/\*\*Model:\*\*\s*(.+)/);
  if (modelMatch) result.model = modelMatch[1].trim();

  // Parse total tokens: "39k / 1m (4%)"
  const tokensMatch = clean.match(/\*\*Tokens:\*\*\s*([\d.]+)([km]?)\s*\/\s*([\d.]+)([km]?)\s*\((\d+(?:\.\d+)?)%\)/i);
  if (tokensMatch) {
    result.usedTokens = parseTokenValue(tokensMatch[1], tokensMatch[2]);
    result.totalTokens = parseTokenValue(tokensMatch[3], tokensMatch[4]);
    result.usagePercent = parseFloat(tokensMatch[5]);
  }

  // Color mapping for categories
  const colorMap = {
    'messages':                '#00D4FF',  // 0° シアン (青)
    'memory files':            '#FFB347',  // 45° アンバー (オレンジ)
    'system tools (deferred)': '#E040FB',  // 90° パープル (紫)
    'mcp tools (deferred)':    '#FF8C00',  // 135° ダークオレンジ
    'system tools':            '#00E676',  // 180° ライムグリーン (緑)
    'system prompt':           '#80CBC4',  // 225° ミントグリーン
    'autocompact buffer':      '#FF3CAC',  // 270° マゼンタ (ピンク)
    'skills':                  '#FF6B6B',  // 315° コーラル (赤)
    'free space':              '#222222',
  };

  const jaMap = {
    'system prompt': { ja: 'システムプロンプト', desc: 'Claude Codeの基本動作指示' },
    'system tools': { ja: 'システムツール', desc: 'ツール定義（Read, Edit, Bash等）' },
    'mcp tools (deferred)': { ja: 'MCPツール(遅延)', desc: 'MCP経由の外部ツール定義' },
    'system tools (deferred)': { ja: 'システムツール(遅延)', desc: '遅延読込のシステムツール' },
    'memory files': { ja: 'メモリファイル', desc: 'CLAUDE.md等の設定・指示ファイル' },
    'skills': { ja: 'スキル', desc: 'スラッシュコマンド定義（/commit等）' },
    'messages': { ja: 'メッセージ', desc: '会話の履歴（質問と応答）' },
    'autocompact buffer': { ja: '自動圧縮バッファ', desc: 'コンテキスト圧縮用の予約領域' },
  };

  // Parse category table (handle ## or ### or no header prefix)
  const catTableMatch = clean.match(/#{2,3}\s*Estimated usage by category[\s\S]*?(?=#{2,3}\s|\n\n\n|$)/);
  if (catTableMatch) {
    const lines = catTableMatch[0].split('\n');
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*([\d.,]+)\s*([km])?\s*\|\s*(\d+(?:\.\d+)?)%\s*\|/i);
      if (rowMatch && !rowMatch[1].includes('---') && !rowMatch[1].includes('Category')) {
        const name = rowMatch[1].trim();
        const tokens = parseTokenValue(rowMatch[2].replace(',', ''), rowMatch[3]);
        const percent = parseFloat(rowMatch[4]);
        const key = name.toLowerCase();

        if (key === 'free space') {
          result.freeSpace = { tokens, percent };
        } else {
          result.categories.push({
            key: toCamelCase(name),
            name,
            tokens,
            percent,
            color: colorMap[key] || '#888888',
            ja: jaMap[key]?.ja || name,
            desc: jaMap[key]?.desc || '',
          });
        }
      }
    }
  }

  // Fallback: Parse ANSI-style /context output (from user's chat)
  // Format: "⛁ System prompt: 6.4k tokens (0.6%)" or "Messages: 92k tokens (9.2%)"
  if (result.categories.length === 0) {
    const ansiLines = clean.split('\n');
    for (const line of ansiLines) {
      const ansiMatch = line.match(/(?:⛁|⛀|⛶|⛝)\s*(.+?):\s*([\d.,]+)([km])?\s*tokens?\s*\((\d+(?:\.\d+)?)%\)/i);
      if (ansiMatch) {
        const name = ansiMatch[1].trim();
        const tokens = parseTokenValue(ansiMatch[2].replace(',', ''), ansiMatch[3]);
        const percent = parseFloat(ansiMatch[4]);
        const key = name.toLowerCase();

        if (key === 'free space') {
          result.freeSpace = { tokens, percent };
        } else if (key === 'autocompact buffer') {
          // skip, not a primary category
        } else {
          result.categories.push({
            key: toCamelCase(name),
            name,
            tokens,
            percent,
            color: colorMap[key] || '#888888',
            ja: jaMap[key]?.ja || name,
            desc: jaMap[key]?.desc || '',
          });
        }
      }
    }

    // Parse total tokens from ANSI: "125k/1000k tokens" or "132k/1000k"
    const totalMatch = clean.match(/([\d.,]+)([km])?\s*\/\s*([\d.,]+)([km])?\s*(?:tokens)?\s*\((\d+(?:\.\d+)?)%\)/i);
    if (totalMatch) {
      result.usedTokens = parseTokenValue(totalMatch[1].replace(',', ''), totalMatch[2]);
      result.totalTokens = parseTokenValue(totalMatch[3].replace(',', ''), totalMatch[4]);
      result.usagePercent = parseFloat(totalMatch[5]);
    }
  }

  // Parse MCP Tools table
  const mcpMatch = clean.match(/#{2,3}\s*MCP Tools[\s\S]*?(?=#{2,3}\s|$)/);
  if (mcpMatch) {
    const lines = mcpMatch[0].split('\n');
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|/);
      if (rowMatch && !rowMatch[1].includes('---') && !rowMatch[1].includes('Tool')) {
        result.mcpTools.push({
          name: rowMatch[1].trim(),
          server: rowMatch[2].trim(),
          tokens: parseInt(rowMatch[3]),
        });
      }
    }
  }

  // Parse Memory Files table
  const memMatch = clean.match(/#{2,3}\s*Memory Files[\s\S]*?(?=#{2,3}\s|$)/);
  if (memMatch) {
    const lines = memMatch[0].split('\n');
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([\d.,]+)([km]?)\s*\|/i);
      if (rowMatch && !rowMatch[1].includes('---') && !rowMatch[1].includes('Type')) {
        result.memoryFileDetails.push({
          type: rowMatch[1].trim(),
          path: rowMatch[2].trim(),
          tokens: parseTokenValue(rowMatch[3].replace(',', ''), rowMatch[4]),
        });
      }
    }
  }

  // Parse Skills table
  const skillMatch = clean.match(/#{2,3}\s*Skills[\s\S]*?(?=#{2,3}\s|$)/);
  if (skillMatch) {
    const lines = skillMatch[0].split('\n');
    for (const line of lines) {
      const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|/);
      if (rowMatch && !rowMatch[1].includes('---') && !rowMatch[1].includes('Skill')) {
        result.skillDetails.push({
          name: rowMatch[1].trim(),
          source: rowMatch[2].trim(),
          tokens: parseInt(rowMatch[3]),
        });
      }
    }
  }

  return result;
}

function parseTokenValue(numStr, suffix) {
  const num = parseFloat(numStr);
  switch ((suffix || '').toLowerCase()) {
    case 'k': return Math.round(num * 1000);
    case 'm': return Math.round(num * 1000000);
    default: return Math.round(num);
  }
}

function toCamelCase(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toLowerCase());
}

module.exports = { parseContextOutput };
