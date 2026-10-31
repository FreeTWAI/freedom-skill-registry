import { performance } from 'node:perf_hooks';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclarations, projectManifestToImport } from '../src/index.mjs';

test('performance benchmarks', async (t) => {
    const iterations = 1000;

    await t.test('validateDeclarations benchmark', () => {
        const declarations = {
            schema_version: 'freedom.registry-declarations/v1',
            packages: Array.from({ length: 100 }, (_, i) => ({
                package_id: `skill:example/pkg-${i}`,
                repository_url: `https://github.com/example/pkg-${i}`,
                commit: 'a'.repeat(40),
                manifest_path: 'freedom-skill.yaml',
                intent: 'request_import'
            }))
        };

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            validateDeclarations(declarations);
        }
        const duration = performance.now() - start;
        console.log(`validateDeclarations duration: ${duration.toFixed(2)}ms for ${iterations} iterations`);
        assert.ok(duration < 1000, `Performance should be reasonable (was ${duration.toFixed(2)}ms)`);
    });

    await t.test('projectManifestToImport benchmark', () => {
        const manifest = {
            schema_version: 'freedom.project/v1',
            kind: 'Project',
            name: 'Example',
            summary: 'Example public project',
            repository: {
                visibility: 'public',
                repository_id: '42',
                html_url: 'https://github.com/example/project',
                full_name: 'example/project'
            },
            data_boundary: { classification: 'public' }
        };

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            projectManifestToImport(manifest, { relationship: 'curator', consentToShare: true, useNotes: 'Notes' });
        }
        const duration = performance.now() - start;
        console.log(`projectManifestToImport duration: ${duration.toFixed(2)}ms for ${iterations} iterations`);
        assert.ok(duration < 200, `Performance should be reasonable (was ${duration.toFixed(2)}ms)`);
    });
});
