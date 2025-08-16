import { MetricsCollector } from '../metrics-collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('counter', () => {
    it('should create and increment counter', () => {
      const counter = collector.counter('test_counter', 'Test counter');
      
      expect(counter.value).toBe(0);
      
      counter.increment();
      expect(counter.value).toBe(1);
      
      counter.increment(5);
      expect(counter.value).toBe(6);
    });

    it('should return existing counter if already exists', () => {
      const counter1 = collector.counter('test_counter', 'Test counter');
      const counter2 = collector.counter('test_counter', 'Test counter');
      
      expect(counter1).toBe(counter2);
    });

    it('should throw error if metric exists with different type', () => {
      collector.counter('test_metric', 'Test metric');
      
      expect(() => {
        collector.gauge('test_metric', 'Test metric');
      }).toThrow('Metric test_metric already exists with different type');
    });

    it('should support labels', () => {
      const counter = collector.counter('test_counter', 'Test counter', ['method', 'status']);
      
      counter.increment(1, { method: 'GET', status: '200' });
      
      expect(counter.labels).toEqual({ method: 'GET', status: '200' });
    });
  });

  describe('gauge', () => {
    it('should create and set gauge values', () => {
      const gauge = collector.gauge('test_gauge', 'Test gauge');
      
      expect(gauge.value).toBe(0);
      
      gauge.set(42);
      expect(gauge.value).toBe(42);
      
      gauge.increment(8);
      expect(gauge.value).toBe(50);
      
      gauge.decrement(10);
      expect(gauge.value).toBe(40);
    });

    it('should update timestamp on value changes', () => {
      const gauge = collector.gauge('test_gauge', 'Test gauge');
      const initialTime = gauge.timestamp;
      
      // Small delay to ensure timestamp difference
      setTimeout(() => {
        gauge.set(100);
        expect(gauge.timestamp.getTime()).toBeGreaterThan(initialTime.getTime());
      }, 1);
    });
  });

  describe('histogram', () => {
    it('should create histogram and observe values', () => {
      const histogram = collector.histogram('test_histogram', 'Test histogram');
      
      expect(histogram.value).toBe(0);
      
      histogram.observe(0.5);
      histogram.observe(1.5);
      histogram.observe(2.5);
      
      expect(histogram.value).toBe(1.5); // Average of observations
    });

    it('should use custom buckets', () => {
      const customBuckets = [0.1, 1, 10, 100];
      const histogram = collector.histogram('test_histogram', 'Test histogram', customBuckets);
      
      expect(histogram.buckets).toEqual(customBuckets);
    });

    it('should calculate bucket counts correctly', () => {
      const histogram = collector.histogram('test_histogram', 'Test histogram', [1, 5, 10]);
      
      histogram.observe(0.5);
      histogram.observe(2);
      histogram.observe(7);
      histogram.observe(15);
      
      const bucketCounts = (histogram as any).getBucketCounts();
      expect(bucketCounts['le_1']).toBe(1); // 0.5
      expect(bucketCounts['le_5']).toBe(2); // 0.5, 2
      expect(bucketCounts['le_10']).toBe(3); // 0.5, 2, 7
      expect(bucketCounts['le_+Inf']).toBe(4); // all observations
    });
  });

  describe('getMetric', () => {
    it('should retrieve existing metric', () => {
      const counter = collector.counter('test_counter', 'Test counter');
      const retrieved = collector.getMetric('test_counter');
      
      expect(retrieved).toBe(counter);
    });

    it('should return undefined for non-existent metric', () => {
      const retrieved = collector.getMetric('non_existent');
      
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllMetrics', () => {
    it('should return all registered metrics', () => {
      const counter = collector.counter('test_counter', 'Test counter');
      const gauge = collector.gauge('test_gauge', 'Test gauge');
      
      const allMetrics = collector.getAllMetrics();
      
      expect(allMetrics.size).toBe(2);
      expect(allMetrics.get('test_counter')).toBe(counter);
      expect(allMetrics.get('test_gauge')).toBe(gauge);
    });
  });

  describe('clear', () => {
    it('should remove all metrics', () => {
      collector.counter('test_counter', 'Test counter');
      collector.gauge('test_gauge', 'Test gauge');
      
      expect(collector.getAllMetrics().size).toBe(2);
      
      collector.clear();
      
      expect(collector.getAllMetrics().size).toBe(0);
    });
  });

  describe('exportPrometheusFormat', () => {
    it('should export counter in Prometheus format', () => {
      const counter = collector.counter('http_requests_total', 'Total HTTP requests');
      counter.increment(5, { method: 'GET', status: '200' });
      
      const output = collector.exportPrometheusFormat();
      
      expect(output).toContain('# HELP http_requests_total Counter metric');
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('http_requests_total{method="GET",status="200",} 5');
    });

    it('should export gauge in Prometheus format', () => {
      const gauge = collector.gauge('memory_usage_bytes', 'Memory usage');
      gauge.set(1024, { type: 'heap' });
      
      const output = collector.exportPrometheusFormat();
      
      expect(output).toContain('# HELP memory_usage_bytes Gauge metric');
      expect(output).toContain('# TYPE memory_usage_bytes gauge');
      expect(output).toContain('memory_usage_bytes{type="heap",} 1024');
    });

    it('should export histogram in Prometheus format', () => {
      const histogram = collector.histogram('request_duration_seconds', 'Request duration', [0.1, 0.5, 1]);
      histogram.observe(0.3);
      histogram.observe(0.7);
      
      const output = collector.exportPrometheusFormat();
      
      expect(output).toContain('# HELP request_duration_seconds Histogram metric');
      expect(output).toContain('# TYPE request_duration_seconds histogram');
      expect(output).toContain('request_duration_seconds_bucket{le="0.1"} 0');
      expect(output).toContain('request_duration_seconds_bucket{le="0.5"} 1');
      expect(output).toContain('request_duration_seconds_bucket{le="1"} 2');
      expect(output).toContain('request_duration_seconds_sum');
      expect(output).toContain('request_duration_seconds_count 2');
    });

    it('should handle metrics without labels', () => {
      const counter = collector.counter('simple_counter', 'Simple counter');
      counter.increment(3);
      
      const output = collector.exportPrometheusFormat();
      
      expect(output).toContain('simple_counter{} 3');
    });
  });
});