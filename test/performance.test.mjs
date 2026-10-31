import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { validateDeclarations } from '../src/index.mjs';

test('validateDeclarations can process large payloads efficiently', () => {
  const packageCount = 100000;
  const packages = Array.from({ length: packageCount }, (_, i) => ({
    package_id: `skill:example/test-${i}`,
    repository_url: 'https://github.com/example/test',
    commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    manifest_path: 'freedom-skill.yaml',
    intent: 'request_import'
  }));

  const payload = {
    schema_version: 'freedom.registry-declarations/v1',
    packages
  };

  const start = performance.now();
  const result = validateDeclarations(payload);
  const duration = performance.now() - start;

  assert.equal(result.packages.length, packageCount);
  // Ensure the latency is reasonable, e.g. < 500ms
  assert.ok(duration < 500, `Expected validation to be fast, but took ${duration}ms`);
});
