const os = require('os');
const config = require('./config.js');

class Metrics {
  constructor() {
    this.startTime = Date.now(); // used as startTimeUnixNano for cumulative sums

    // HTTP request counters
    this.totalRequests = 0;
    this.getRequests = 0;
    this.putRequests = 0;
    this.postRequests = 0;
    this.deleteRequests = 0;

    // Active users (incremented on login, decremented on logout)
    this.activeUsers = 0;

    // Auth counters
    this.authSuccesses = 0;
    this.authFailures = 0;

    // Pizza metrics
    this.pizzasSold = 0;
    this.pizzaFailures = 0;
    this.pizzaRevenueCents = 0; // stored in cents to keep as integer

    // Latency accumulators (cumulative sums for rate visualization)
    this.serviceLatencyTotal = 0;
    this.pizzaLatencyTotal = 0;

    // Bind middleware so 'this' is correct when used as app.use(metrics.requestTracker)
    this.requestTracker = this.requestTracker.bind(this);

    // Start sending metrics every 60 seconds
    this.sendMetricsPeriodically(60000);
  }

  // ── Middleware ──────────────────────────────────────────────────────────────

  requestTracker(req, res, next) {
    this.totalRequests++;
    const method = req.method.toUpperCase();
    if (method === 'GET') this.getRequests++;
    else if (method === 'PUT') this.putRequests++;
    else if (method === 'POST') this.postRequests++;
    else if (method === 'DELETE') this.deleteRequests++;

    // Measure service endpoint latency
    const start = Date.now();
    res.on('finish', () => {
      this.serviceLatencyTotal += Date.now() - start;
    });

    next();
  }

  // ── Auth & User Helpers ─────────────────────────────────────────────────────

  authSuccess() {
    this.authSuccesses++;
    this.activeUsers++;
  }

  authFailure() {
    this.authFailures++;
  }

  userLogout() {
    if (this.activeUsers > 0) this.activeUsers--;
  }

  // ── Pizza Helpers ───────────────────────────────────────────────────────────

  /**
   * @param {boolean} success
   * @param {number}  latencyMs
   * @param {number}  revenue   price in dollars (e.g. 0.0038)
   */
  pizzaPurchase(success, latencyMs, revenue) {
    this.pizzaLatencyTotal += latencyMs;
    if (success) {
      this.pizzasSold++;
      this.pizzaRevenueCents += Math.round(revenue * 10000); // store as integer
    } else {
      this.pizzaFailures++;
    }
  }

  // ── System Metrics ──────────────────────────────────────────────────────────

  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return parseFloat((cpuUsage * 100).toFixed(2));
  }

  getMemoryUsagePercentage() {
    const used = os.totalmem() - os.freemem();
    return parseFloat(((used / os.totalmem()) * 100).toFixed(2));
  }

  // ── OTel Metric Builders ────────────────────────────────────────────────────

  buildGauge(name, unit, value) {
    return {
      name,
      unit,
      gauge: {
        dataPoints: [
          {
            asInt: Math.round(value),
            timeUnixNano: String(Date.now() * 1_000_000),
            attributes: [{ key: 'source', value: { stringValue: config.metrics.source } }],
          },
        ],
      },
    };
  }

  buildSum(name, unit, value) {
    return {
      name,
      unit,
      sum: {
        dataPoints: [
          {
            asInt: Math.round(value),
            startTimeUnixNano: String(this.startTime * 1_000_000),
            timeUnixNano: String(Date.now() * 1_000_000),
            attributes: [{ key: 'source', value: { stringValue: config.metrics.source } }],
          },
        ],
        aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
        isMonotonic: true,
      },
    };
  }

  // ── Sending ─────────────────────────────────────────────────────────────────

  sendMetricsPeriodically(period) {
    setInterval(() => {
      try {
        this.sendAllMetrics();
      } catch (error) {
        console.error('Error sending metrics', error);
      }
    }, period);
  }

  sendAllMetrics() {
    // OTel→Prometheus name rules:
    //   gauge + unit '%'  → {name}_percent
    //   sum   + unit '1'  → {name}_total
    //   sum   + unit 'ms' → {name}_milliseconds_total
    const metrics = [
      // HTTP requests  → http_requests_total, http_requests_get_total, etc.
      this.buildSum('http_requests', '1', this.totalRequests),
      this.buildSum('http_requests_get', '1', this.getRequests),
      this.buildSum('http_requests_put', '1', this.putRequests),
      this.buildSum('http_requests_post', '1', this.postRequests),
      this.buildSum('http_requests_delete', '1', this.deleteRequests),

      // Active users  → active_users  (gauge, no suffix)
      this.buildGauge('active_users', '1', this.activeUsers),

      // Auth  → auth_success_total, auth_failure_total
      this.buildSum('auth_success', '1', this.authSuccesses),
      this.buildSum('auth_failure', '1', this.authFailures),

      // System  → cpu_percent, memory_percent
      this.buildGauge('cpu', '%', this.getCpuUsagePercentage()),
      this.buildGauge('memory', '%', this.getMemoryUsagePercentage()),

      // Pizzas  → pizza_sold_total, pizza_failures_total, pizza_revenue_total
      this.buildSum('pizza_sold', '1', this.pizzasSold),
      this.buildSum('pizza_failures', '1', this.pizzaFailures),
      this.buildSum('pizza_revenue', '1', this.pizzaRevenueCents),

      // Latency  → service_latency_milliseconds_total, pizza_latency_milliseconds_total
      this.buildSum('service_latency', 'ms', this.serviceLatencyTotal),
      this.buildSum('pizza_latency', 'ms', this.pizzaLatencyTotal),
    ];

    const body = JSON.stringify({
      resourceMetrics: [
        {
          scopeMetrics: [{ metrics }],
        },
      ],
    });

    const authHeader = 'Basic ' + Buffer.from(`${config.metrics.accountId}:${config.metrics.apiKey}`).toString('base64');

    fetch(config.metrics.endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body,
    })
      .then((response) => {
        if (!response.ok) {
          response.text().then((text) => console.error(`Failed to push metrics to Grafana: ${text}`));
        } else {
          console.log('Metrics sent to Grafana successfully');
        }
      })
      .catch((error) => console.error('Error pushing metrics:', error));
  }
}

const metrics = new Metrics();
module.exports = metrics;
