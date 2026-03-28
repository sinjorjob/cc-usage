/**
 * cli-provider.js - Fetch context data via claude -p "/context"
 */
const { execFile } = require('child_process');
const { ContextDataProvider } = require('./data-provider');
const { parseContextOutput } = require('./context-parser');

class CliProvider extends ContextDataProvider {
  constructor() {
    super();
    this.timeout = 30000; // 30 seconds
  }

  async fetch() {
    const output = await this._exec();
    return parseContextOutput(output);
  }

  _exec() {
    return new Promise((resolve, reject) => {
      execFile('claude', ['-p', '/context'], {
        timeout: this.timeout,
        encoding: 'utf-8',
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) {
          console.error('[cli-provider] exec error:', err.message);
          reject(new Error(`claude command failed: ${err.message}`));
          return;
        }
        if (!stdout || stdout.trim().length === 0) {
          reject(new Error('claude returned empty output'));
          return;
        }
        resolve(stdout);
      });
    });
  }
}

module.exports = { CliProvider };
