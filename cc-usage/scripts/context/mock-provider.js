/**
 * mock-provider.js - Mock context data for development
 */
const { ContextDataProvider } = require('./data-provider');

const MOCK_DATA = {
  timestamp: new Date().toISOString(),
  model: 'claude-opus-4-6[1m]',
  totalTokens: 1000000,
  usedTokens: 194000,
  usagePercent: 19.4,
  categories: [
    { key: 'messages',     name: 'Messages',       tokens: 121100, percent: 12.1, color: '#00D4FF', ja: 'メッセージ',         desc: '会話の履歴（質問と応答）' },
    { key: 'autocompact',  name: 'Autocompact',     tokens: 33000,  percent: 3.3,  color: '#FF3CAC', ja: '自動圧縮バッファ',   desc: 'コンテキスト圧縮用の予約領域' },
    { key: 'memoryFiles',  name: 'Memory Files',    tokens: 25100,  percent: 2.5,  color: '#FFB347', ja: 'メモリファイル',     desc: 'CLAUDE.md等の設定・指示ファイル' },
    { key: 'systemTools',  name: 'System Tools',    tokens: 7300,   percent: 0.7,  color: '#2EE89E', ja: 'システムツール',     desc: 'ツール定義（Read, Edit, Bash等）' },
    { key: 'systemPrompt', name: 'System Prompt',   tokens: 6300,   percent: 0.6,  color: '#A78BFA', ja: 'システムプロンプト', desc: 'Claude Codeの基本動作指示' },
    { key: 'skills',       name: 'Skills',          tokens: 1500,   percent: 0.2,  color: '#FF6B6B', ja: 'スキル',             desc: 'スラッシュコマンド定義（/commit等）' },
  ],
  freeSpace: { tokens: 806000, percent: 80.6 },
  mcpTools: [
    'github / add_issue_comment', 'github / create_branch', 'github / create_issue',
    'github / create_or_update_file', 'github / create_pull_request',
    'github / create_pull_request_review', 'github / create_repository',
    'github / fork_repository', 'github / get_file_contents', 'github / get_issue',
    'github / get_pull_request', 'github / get_pull_request_comments',
    'github / get_pull_request_files', 'github / get_pull_request_reviews',
    'github / get_pull_request_status', 'github / list_commits',
    'github / list_issues', 'github / list_pull_requests',
    'github / merge_pull_request', 'github / push_files',
    'github / search_code', 'github / search_issues',
    'github / search_repositories', 'github / search_users',
    'markitdown / convert_to_markdown', 'survey-insight / analyze_survey',
  ],
  memoryFileDetails: [
    { path: '~/.claude/ORCHESTRATOR.md', tokens: 5900 },
    { path: '~/.claude/PERSONAS.md', tokens: 4600 },
    { path: '~/.claude/MODES.md', tokens: 3200 },
    { path: '~/.claude/MCP.md', tokens: 2500 },
    { path: '~/.claude/FLAGS.md', tokens: 2300 },
    { path: '~/.claude/PRINCIPLES.md', tokens: 1900 },
    { path: '~/.claude/CLAUDE.md', tokens: 1700 },
    { path: '~/.claude/COMMANDS.md', tokens: 1600 },
    { path: 'CLAUDE.md (project)', tokens: 694 },
    { path: '~/.claude/RULES.md', tokens: 553 },
  ],
  skillDetails: [
    { name: 'xlsx', tokens: 113 }, { name: 'ppt-creator', tokens: 91 },
    { name: 'docx', tokens: 92 }, { name: 'playground', tokens: 73 },
    { name: 'pptx', tokens: 69 }, { name: 'frontend-design', tokens: 67 },
    { name: 'pdf', tokens: 64 }, { name: 'claude-assist', tokens: 37 },
    { name: 'sc:workflow', tokens: 28 }, { name: 'sc:implement', tokens: 25 },
    { name: 'sc:task', tokens: 24 }, { name: 'sc:improve', tokens: 23 },
    { name: 'cc-usage', tokens: 22 }, { name: 'sc:build', tokens: 21 },
    { name: 'sc:spawn', tokens: 20 }, { name: 'sc:troubleshoot', tokens: 20 },
    { name: 'sc:cleanup', tokens: 19 }, { name: 'sc:document', tokens: 19 },
    { name: 'sc:estimate', tokens: 19 }, { name: 'sc:explain', tokens: 19 },
    { name: 'sc:git', tokens: 19 }, { name: 'sc:load', tokens: 19 },
    { name: 'sc:analyze', tokens: 18 }, { name: 'sc:index', tokens: 18 },
    { name: 'sc:test', tokens: 18 }, { name: 'sc:design', tokens: 17 },
    { name: 'housing-loan-deduction', tokens: 14 }, { name: 'our-excel', tokens: 14 },
  ],
};

class MockProvider extends ContextDataProvider {
  async fetch() {
    return { ...MOCK_DATA, timestamp: new Date().toISOString() };
  }
}

module.exports = { MockProvider };
