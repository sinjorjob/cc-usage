/**
 * usage-fetcher.js - Fetch Claude Code usage via OAuth API
 *
 * Calls GET https://api.anthropic.com/api/oauth/usage with OAuth token
 * from ~/.claude/.credentials.json
 *
 * Response format:
 * {
 *   "five_hour":  { "utilization": 17.0, "resets_at": "2026-02-28T03:59:59.000000+00:00" },
 *   "seven_day":  { "utilization": 26.0, "resets_at": "2026-03-05T14:59:59.000000+00:00" },
 *   "extra_usage": { "is_enabled": true, "monthly_limit": ..., "used_credits": ..., "utilization": ... }
 * }
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.claude', '.credentials.json'
);
const API_URL = 'https://api.anthropic.com/api/oauth/usage';

class UsageFetcher {
  constructor() {
    this._fetching = false;
  }

  /**
   * Read OAuth access token from ~/.claude/.credentials.json
   */
  _getToken() {
    try {
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const creds = JSON.parse(raw);
      return creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    } catch (e) {
      console.error('[usage-fetcher] Failed to read credentials:', e.message);
      return null;
    }
  }

  /**
   * Fetch current usage data from Anthropic OAuth API.
   */
  fetch() {
    if (this._fetching) return Promise.resolve(null);
    this._fetching = true;

    const token = this._getToken();
    if (!token) {
      this._fetching = false;
      console.error('[usage-fetcher] No OAuth token found');
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const url = new URL(API_URL);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          this._fetching = false;
          try {
            const data = JSON.parse(body);
            resolve(this._parseResponse(data));
          } catch (e) {
            console.error('[usage-fetcher] Parse error:', e.message, 'body:', body.substring(0, 300));
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        this._fetching = false;
        console.error('[usage-fetcher] Request error:', e.message);
        resolve(null);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        this._fetching = false;
        resolve(null);
      });

      req.end();
    });
  }

  _parseResponse(data) {
    // five_hour is the primary metric (matches /usage display)
    const fiveHour = data.five_hour || {};
    const sevenDay = data.seven_day || {};
    const extraUsage = data.extra_usage || {};

    const utilization = fiveHour.utilization != null
      ? Math.round(fiveHour.utilization)
      : null;

    if (utilization == null) {
      console.error('[usage-fetcher] No five_hour utilization in response:', JSON.stringify(data));
      return null;
    }

    return {
      utilization,                                          // 0-100 (exact %)
      resetsAt: fiveHour.resets_at ? this._formatTime(fiveHour.resets_at) : null,
      resetsAtFull: fiveHour.resets_at || null,
      sevenDay: {
        utilization: sevenDay.utilization != null ? Math.round(sevenDay.utilization) : null,
        resetsAt: sevenDay.resets_at ? this._formatTime(sevenDay.resets_at) : null,
      },
      extraUsage: extraUsage.is_enabled ? {
        utilization: extraUsage.utilization != null ? Math.round(extraUsage.utilization) : null,
        monthlyLimit: extraUsage.monthly_limit || null,
        usedCredits: extraUsage.used_credits || null,
      } : null,
      fetchedAt: new Date().toISOString(),
    };
  }

  _formatTime(isoString) {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      // API returns "16:59:59" for a 17:00 reset - round up to nearest minute
      if (d.getSeconds() >= 30) {
        d.setMinutes(d.getMinutes() + 1);
        d.setSeconds(0);
      }
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return isoString;
    }
  }
}

module.exports = { UsageFetcher };
