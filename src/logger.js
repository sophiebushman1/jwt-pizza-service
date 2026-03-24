const config = require('./config.js');

class Logger {
  // ── Express middleware: logs every HTTP request + response ──────────────────
  httpLogger = (req, res, next) => {
    const originalSend = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        reqBody: req.body ? JSON.stringify(req.body) : '',
        resBody: JSON.stringify(resBody),
      };
      this.log(this.statusToLogLevel(res.statusCode), 'http', logData);
      res.send = originalSend;
      return res.send(resBody);
    };
    next();
  };

  // ── Called from database.js query() to log every SQL statement ─────────────
  dbLogger(sql) {
    this.log('info', 'db', { query: sql });
  }

  // ── Called from orderRouter.js to log factory request + response ───────────
  factoryLogger(direction, logData) {
    this.log('info', 'factory', { direction, ...logData });
  }

  // ── Called from the Express error-handler middleware in app.js ─────────────
  exceptionLogger(err, req) {
    this.log('error', 'exception', {
      message: err.message,
      path: req ? req.originalUrl : 'unknown',
      stack: err.stack ? err.stack.split('\n')[0] : '',
    });
  }

  // ── Core log method ─────────────────────────────────────────────────────────
  log(level, type, logData) {
    const labels = { component: config.logging.source, level, type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };
    this.sendLogToGrafana(logEvent);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1_000_000).toString();
  }

  sanitize(logData) {
    let str = JSON.stringify(logData);
    // Mask passwords in any format they might appear
    str = str.replace(/"password"\s*:\s*"[^"]*"/g, '"password": "*****"');
    str = str.replace(/\\"password\\"\s*:\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
    return str;
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(config.logging.endpointUrl, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
      },
    })
      .then((res) => {
        if (!res.ok) res.text().then((t) => console.error('Failed to send log to Grafana:', t));
      })
      .catch((err) => console.error('Logger error:', err));
  }
}

module.exports = new Logger();
