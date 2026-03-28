/**
 * session-provider.js - Read context usage from session JSONL file
 *
 * Reads ~/.claude/projects/{encoded-cwd}/{session-id}.jsonl
 * and extracts cache_read + cache_creation from the last assistant message.
 * No CLI commands, no API calls, no token consumption.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class SessionProvider {
  constructor() {
    this.cwd = null;
    this._cachedJsonlPath = null;
  }

  setCwd(dir) {
    this.cwd = dir;
  }

  /**
   * Auto-detect: find the most recent .jsonl with real usage data across ALL projects.
   * Collects all .jsonl files, sorts by mtime, and picks the first with valid assistant usage.
   */
  autoDetect() {
    try {
      const home = os.homedir();
      const projectsDir = path.join(home, '.claude', 'projects');
      if (!fs.existsSync(projectsDir)) return null;

      // Collect ALL .jsonl files across all project directories
      const allFiles = [];
      const projects = fs.readdirSync(projectsDir).filter(d => {
        const full = path.join(projectsDir, d);
        return fs.statSync(full).isDirectory() && d !== 'memory';
      });

      for (const proj of projects) {
        const projDir = path.join(projectsDir, proj);
        try {
          const jsonls = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl'));
          for (const f of jsonls) {
            const fp = path.join(projDir, f);
            allFiles.push({ path: fp, project: proj, mtime: fs.statSync(fp).mtimeMs });
          }
        } catch (e) { /* skip unreadable dirs */ }
      }

      // Sort by most recently modified first
      allFiles.sort((a, b) => b.mtime - a.mtime);

      // Find the first file with real assistant usage data (>1000 tokens = real session)
      for (const file of allFiles) {
        const result = this._readLastAssistantUsage(file.path);
        if (result && result.totalContext > 1000) {
          this.cwd = file.project;
          this._cachedJsonlPath = file.path;
          console.log(`[session-provider] Auto-detected: ${file.project} -> ${file.path}, total=${result.totalContext}`);
          return file.project;
        }
      }

      console.log('[session-provider] No active session with usage data found');
    } catch (err) {
      console.error(`[session-provider] Auto-detect error: ${err.message}`);
    }
    return null;
  }

  /**
   * Read the latest assistant message's cache tokens from the JSONL file.
   * Returns { totalContext, cacheRead, cacheCreate, sessionId } or null.
   */
  fetchFromJsonl() {
    try {
      let jsonlFile = this._cachedJsonlPath || null;

      if (!jsonlFile) {
        if (!this.cwd) return null;
        const projectDir = this._getProjectDir();
        if (!projectDir || !fs.existsSync(projectDir)) {
          console.log(`[session-provider] Project dir not found: ${projectDir}`);
          return null;
        }
        jsonlFile = this._findLatestSession(projectDir);
      }

      if (!jsonlFile) {
        console.log('[session-provider] No session JSONL found');
        return null;
      }

      const result = this._readLastAssistantUsage(jsonlFile);
      if (result) {
        console.log(`[session-provider] JSONL read: cacheRead=${result.cacheRead}, cacheCreate=${result.cacheCreate}, total=${result.totalContext}`);
      }
      return result;
    } catch (err) {
      console.error(`[session-provider] Error: ${err.message}`);
      return null;
    }
  }

  _getProjectDir() {
    const home = os.homedir();
    const projectsDir = path.join(home, '.claude', 'projects');
    // C:\tools\cc-usage -> C--tools-cc-usage
    // Replace : and \ and / with - (colon becomes -, so C: becomes C-)
    const encoded = this.cwd.replace(/[:\\/]/g, '-');
    return path.join(projectsDir, encoded);
  }

  _findLatestSession(projectDir) {
    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        path: path.join(projectDir, f),
        mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  }

  /**
   * Read the JSONL file backwards to find the last non-sidechain assistant message
   * with usage data. Only reads the tail of the file for efficiency.
   */
  _readLastAssistantUsage(jsonlFile) {
    // Read last ~100KB to find recent assistant messages
    const stat = fs.statSync(jsonlFile);
    const readSize = Math.min(stat.size, 100 * 1024);
    const fd = fs.openSync(jsonlFile, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);

    const tail = buf.toString('utf-8');
    const lines = tail.split('\n').filter(l => l.trim());

    // Search from the end for the last assistant message with usage
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && !entry.isSidechain &&
            entry.message && entry.message.usage) {
          const usage = entry.message.usage;
          const cacheRead = usage.cache_read_input_tokens || 0;
          const cacheCreate = usage.cache_creation_input_tokens || 0;
          const sessionId = entry.message.id || null;
          return {
            totalContext: cacheRead + cacheCreate,
            cacheRead,
            cacheCreate,
            sessionId,
          };
        }
      } catch (e) {
        // Skip malformed lines (e.g. partial line at start of buffer)
      }
    }

    return null;
  }
}

module.exports = { SessionProvider };
