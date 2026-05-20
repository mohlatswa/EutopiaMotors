// ── EUTOPIA MOTORS — SECURITY MONITOR ────────────────────────────────────────
// Logs suspicious events to Supabase and triggers alerts (browser + email).
// Must be loaded AFTER supabase.js and data.js so that _sb is available.

window.SEC = {

  // ── LOG AN EVENT ────────────────────────────────────────────────────────────
  async log(eventType, severity, description, metadata = {}) {
    try {
      await _sb.from('security_logs').insert({
        event_type:  eventType,
        severity,
        description,
        metadata,
        user_agent:  navigator.userAgent.slice(0, 250),
        page:        location.pathname
      });
    } catch (e) { /* silent — never break the live site */ }

    if (severity === 'critical' || severity === 'warning') {
      this._triggerAlert(eventType, severity, description, metadata);
    }
  },

  // ── BRUTE-FORCE / FAILED LOGIN TRACKING ─────────────────────────────────────
  // Stores timestamps in sessionStorage so counts survive page reloads within a tab
  _getAttempts() {
    try { return JSON.parse(sessionStorage.getItem('_ema') || '[]'); } catch { return []; }
  },

  trackFailedLogin(username) {
    const now  = Date.now();
    const fresh = this._getAttempts().filter(t => now - t < 15 * 60 * 1000); // last 15 min
    fresh.push(now);
    try { sessionStorage.setItem('_ema', JSON.stringify(fresh)); } catch {}

    const count = fresh.length;
    const sev   = count >= 5 ? 'critical' : count >= 3 ? 'warning' : 'info';
    this.log(
      'failed_login', sev,
      `Failed login for "${username}" — ${count} attempt${count > 1 ? 's' : ''} in 15 minutes`,
      { username, count }
    );
  },

  // Reset attempt counter on successful login
  clearLoginAttempts() {
    try { sessionStorage.removeItem('_ema'); } catch {}
  },

  // ── XSS / INJECTION SCAN ────────────────────────────────────────────────────
  // Returns false if the value looks malicious (and logs it).
  scanInput(value, fieldName) {
    const patterns = [
      /<script/i, /javascript:/i, /on\w+\s*=/i,
      /<iframe/i, /eval\s*\(/, /document\.cookie/i,
      /window\.location/i, /fetch\s*\(/i
    ];
    if (patterns.some(p => p.test(value))) {
      this.log(
        'xss_attempt', 'critical',
        `Suspicious input detected in "${fieldName}" field`,
        { field: fieldName, preview: value.slice(0, 100) }
      );
      return false;
    }
    return true;
  },

  // ── FORM SPAM TRACKING ───────────────────────────────────────────────────────
  _submissions: [],

  trackFormSubmit(formType) {
    const now = Date.now();
    this._submissions = this._submissions.filter(t => now - t < 5 * 60 * 1000);
    this._submissions.push(now);
    if (this._submissions.length >= 4) {
      this.log(
        'form_spam', 'warning',
        `${this._submissions.length} "${formType}" submissions within 5 minutes`,
        { formType, count: this._submissions.length }
      );
    }
  },

  // ── ADMIN AUDIT TRAIL ───────────────────────────────────────────────────────
  auditLog(action, details = {}) {
    this.log('admin_action', 'info', action, details);
  },

  // ── ALERT DISPATCH ──────────────────────────────────────────────────────────
  _triggerAlert(type, severity, desc, meta) {
    // 1. Browser notification (if admin has granted permission)
    if ('Notification' in window && Notification.permission === 'granted') {
      const title = severity === 'critical'
        ? '🚨 CRITICAL — Eutopia Motors Security Alert'
        : '⚠️ Warning — Eutopia Motors Security';
      new Notification(title, { body: desc, tag: type });
    }

    // 2. Email via EmailJS (if configured)
    const cfg = this._getCfg();
    if (cfg && window.emailjs) {
      emailjs.send(cfg.sid, cfg.tid, {
        to_email:   cfg.email,
        severity:   severity.toUpperCase(),
        event_type: type.replace(/_/g, ' ').toUpperCase(),
        description: desc,
        details:    JSON.stringify(meta, null, 2),
        time:       new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }),
        site_url:   location.origin
      }, cfg.key).catch(() => {/* silent */});
    }
  },

  // ── HELPERS ─────────────────────────────────────────────────────────────────
  _getCfg() {
    try { return JSON.parse(localStorage.getItem('_emsec') || 'null'); } catch { return null; }
  },

  async requestNotifPermission() {
    if (!('Notification' in window) || Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }
};
