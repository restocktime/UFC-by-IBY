export interface MetricValue {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface Counter extends MetricValue {
  increment(value?: number, labels?: Record<string, string>): void;
}

export interface Gauge extends MetricValue {
  set(value: number, labels?: Record<string, string>): void;
  increment(value?: number, labels?: Record<string, string>): void;
  decrement(value?: number, labels?: Record<string, string>): void;
}

export interface Histogram extends MetricValue {
  observe(value: number, labels?: Record<string, string>): void;
  buckets: number[];
}

export interface MetricsRegistry {
  counter(name: string, help: string, labelNames?: string[]): Counter;
  gauge(name: string, help: string, labelNames?: string[]): Gauge;
  histogram(name: string, help: string, buckets?: number[], labelNames?: string[]): Histogram;
  getMetric(name: string): Counter | Gauge | Histogram | undefined;
  getAllMetrics(): Map<string, Counter | Gauge | Histogram>;
  clear(): void;
}

class SimpleCounter implements Counter {
  public value: number = 0;
  public timestamp: Date = new Date();
  public labels?: Record<string, string>;

  constructor(private name: string, private help: string, private labelNames: string[] = []) {}

  increment(value: number = 1, labels?: Record<string, string>): void {
    this.value += value;
    this.timestamp = new Date();
    this.labels = labels;
  }
}

class SimpleGauge implements Gauge {
  public value: number = 0;
  public timestamp: Date = new Date();
  public labels?: Record<string, string>;

  constructor(private name: string, private help: string, private labelNames: string[] = []) {}

  set(value: number, labels?: Record<string, string>): void {
    this.value = value;
    this.timestamp = new Date();
    this.labels = labels;
  }

  increment(value: number = 1, labels?: Record<string, string>): void {
    this.value += value;
    this.timestamp = new Date();
    this.labels = labels;
  }

  decrement(value: number = 1, labels?: Record<string, string>): void {
    this.value -= value;
    this.timestamp = new Date();
    this.labels = labels;
  }
}

class SimpleHistogram implements Histogram {
  public value: number = 0;
  public timestamp: Date = new Date();
  public labels?: Record<string, string>;
  public buckets: number[];
  private observations: number[] = [];

  constructor(
    private name: string, 
    private help: string, 
    buckets: number[] = [0.1, 0.5, 1, 2.5, 5, 10], 
    private labelNames: string[] = []
  ) {
    this.buckets = buckets.sort((a, b) => a - b);
  }

  observe(value: number, labels?: Record<string, string>): void {
    this.observations.push(value);
    this.value = this.observations.reduce((sum, obs) => sum + obs, 0) / this.observations.length;
    this.timestamp = new Date();
    this.labels = labels;
  }

  getBucketCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const bucket of this.buckets) {
      counts[`le_${bucket}`] = this.observations.filter(obs => obs <= bucket).length;
    }
    
    counts['le_+Inf'] = this.observations.length;
    return counts;
  }
}

export class MetricsCollector implements MetricsRegistry {
  private metrics: Map<string, Counter | Gauge | Histogram> = new Map();

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing && 'increment' in existing && !('set' in existing)) {
        return existing as Counter;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const counter = new SimpleCounter(name, help, labelNames);
    this.metrics.set(name, counter);
    return counter;
  }

  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing && 'set' in existing) {
        return existing as Gauge;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const gauge = new SimpleGauge(name, help, labelNames);
    this.metrics.set(name, gauge);
    return gauge;
  }

  histogram(name: string, help: string, buckets?: number[], labelNames: string[] = []): Histogram {
    if (this.metrics.has(name)) {
      const existing = this.metrics.get(name);
      if (existing && 'observe' in existing) {
        return existing as Histogram;
      }
      throw new Error(`Metric ${name} already exists with different type`);
    }

    const histogram = new SimpleHistogram(name, help, buckets, labelNames);
    this.metrics.set(name, histogram);
    return histogram;
  }

  getMetric(name: string): Counter | Gauge | Histogram | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Map<string, Counter | Gauge | Histogram> {
    return new Map(this.metrics);
  }

  clear(): void {
    this.metrics.clear();
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusFormat(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      if ('observe' in metric) {
        // Histogram
        const histogram = metric as SimpleHistogram;
        lines.push(`# HELP ${name} Histogram metric`);
        lines.push(`# TYPE ${name} histogram`);
        
        const bucketCounts = histogram.getBucketCounts();
        for (const [bucket, count] of Object.entries(bucketCounts)) {
          const labelStr = metric.labels ? this.formatLabels(metric.labels) : '';
          lines.push(`${name}_bucket{${labelStr}le="${bucket.replace('le_', '')}"} ${count}`);
        }
        
        lines.push(`${name}_sum ${histogram.value * histogram['observations']?.length || 0}`);
        lines.push(`${name}_count ${histogram['observations']?.length || 0}`);
      } else if ('set' in metric) {
        // Gauge
        lines.push(`# HELP ${name} Gauge metric`);
        lines.push(`# TYPE ${name} gauge`);
        const labelStr = metric.labels ? this.formatLabels(metric.labels) : '';
        lines.push(`${name}{${labelStr}} ${metric.value}`);
      } else {
        // Counter
        lines.push(`# HELP ${name} Counter metric`);
        lines.push(`# TYPE ${name} counter`);
        const labelStr = metric.labels ? this.formatLabels(metric.labels) : '';
        lines.push(`${name}{${labelStr}} ${metric.value}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatLabels(labels: Record<string, string>): string {
    const labelPairs = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
    return labelPairs.length > 0 ? labelPairs.join(',') + ',' : '';
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();