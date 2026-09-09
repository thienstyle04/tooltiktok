import assert from 'node:assert/strict';
import { RuntimePerformanceService } from '../runtime-performance.service';

function withMemory(service: RuntimePerformanceService, totalMemoryBytes: number, freeMemoryBytes: number): RuntimePerformanceService {
  service.setMemoryProbeForTest(() => ({ totalMemoryBytes, freeMemoryBytes, cpuCount: 8 }));
  return service;
}

async function main(): Promise<void> {
  {
    const modern = withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 8 * 1024 ** 3);
    assert.equal(modern.getStatus().mode, 'checking');
    assert.equal(modern.report({ success: true, browserSupported: true, elapsedMs: 250 }).mode, 'modern');
    assert.equal(modern.getStatus().drivePrefetchConcurrency, 0);

    const hidden = withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 8 * 1024 ** 3);
    assert.equal(hidden.report({ hidden: true, browserSupported: true }).mode, 'legacy');
    assert.equal(hidden.report({ success: true, browserSupported: true, elapsedMs: 100 }).mode, 'legacy');
    assert.equal(hidden.getStatus().drivePrefetchConcurrency, 1);

    assert.equal(withMemory(new RuntimePerformanceService(), 4 * 1024 ** 3, 3 * 1024 ** 3).getStatus().mode, 'legacy');

    assert.equal(withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 8 * 1024 ** 3).report({ success: true, browserSupported: true, elapsedMs: 12_001 }).mode, 'legacy');
    assert.equal(withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 1024 ** 3).getStatus().mode, 'legacy');
    const realNow = Date.now;
    try {
      let now = realNow();
      Date.now = () => now;
      withMemory(modern, 16 * 1024 ** 3, 1024 ** 3);
      assert.equal(modern.getStatus().mode, 'modern');
      for (let index = 0; index < 3; index += 1) {
        now += 500;
        assert.equal(modern.getStatus().mode, 'modern');
      }
      now += 500;
      assert.equal(modern.getStatus().mode, 'legacy');
      withMemory(modern, 16 * 1024 ** 3, 8 * 1024 ** 3);
      assert.equal(modern.getStatus().mode, 'legacy');
      assert.equal(withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 8 * 1024 ** 3).getStatus().mode, 'checking');
    } finally { Date.now = realNow; }
    const queued = withMemory(new RuntimePerformanceService(), 16 * 1024 ** 3, 8 * 1024 ** 3);
    queued.report({ success: true, browserSupported: true, elapsedMs: 100 });
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const jobs = Array.from({ length: 6 }, () => queued.runDriveTask(3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
    }));
    await Promise.resolve();
    assert.equal(active, 3);
    queued.markResourceFailure();
    for (let index = 0; index < 2; index += 1) {
      releases.shift()!();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(active, 2 - index, 'Downgrade must let in-flight work settle without replacement');
    }
    while (releases.length) {
      releases.shift()!();
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(active <= 1);
    }
    await Promise.all(jobs);
    assert.equal(peak, 3);
    console.log('PASS runtime performance: decisions, sticky downgrade, restart and shared adaptive Drive queue.');
  }
}

void main();
