import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const fixturesDir = join(process.cwd(), 'test', 'fixtures');
try { mkdirSync(fixturesDir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') throw e; }

const validManifest = {
  "schema_version": "freedom.project/v1",
  "kind": "Project",
  "name": "Example",
  "summary": "Example public project",
  "repository": {
    "visibility": "public",
    "repository_id": "42",
    "html_url": "https://github.com/example/project",
    "full_name": "example/project",
    "is_fork": false,
    "default_branch": "main"
  },
  "data_boundary": {
    "classification": "public"
  },
  "toolchain": {
    "runtime_version_file": null,
    "lockfile": null,
    "package_manifest": null
  },
  "ownership": {
    "external_owner": null
  }
};

const validRegistry = {
  "schema_version": "freedom.registry-declarations/v1",
  "packages": [
    {
      "package_id": "skill:example/lesson",
      "repository_url": "https://github.com/example/lesson",
      "commit": "a".repeat(40),
      "manifest_path": "freedom-skill.yaml",
      "intent": "request_import"
    }
  ]
};

function runPython(manifestContent, isJson = false) {
    const originalManifest = join(process.cwd(), 'freedom.project.yaml');
    const backupManifest = join(process.cwd(), 'freedom.project.yaml.bak');
    try { renameSync(originalManifest, backupManifest); } catch (e) {}

    try {
        if (isJson) {
            writeFileSync(originalManifest, manifestContent);
        } else {
            writeFileSync(originalManifest, JSON.stringify(manifestContent, null, 2));
        }

        const output = execSync('python3 scripts/verify-project-manifest.py', { stdio: 'pipe' });
        return { success: true, output: output.toString() };
    } catch (error) {
        return { success: false, error: error.stderr ? error.stderr.toString() : error.stdout.toString() };
    } finally {
        try { rmSync(originalManifest); } catch (e) {}
        try { renameSync(backupManifest, originalManifest); } catch (e) {}
    }
}

function runRegistry(registryContent, isJson = false) {
    const originalRegistry = join(process.cwd(), 'registry/packages.yaml');
    const backupRegistry = join(process.cwd(), 'registry/packages.yaml.bak');
    try { renameSync(originalRegistry, backupRegistry); } catch (e) {}

    try {
        if (isJson) {
            writeFileSync(originalRegistry, registryContent);
        } else {
            writeFileSync(originalRegistry, JSON.stringify(registryContent, null, 2));
        }

        const output = execSync('node scripts/check-registry.mjs', { stdio: 'pipe' });
        return { success: true, output: output.toString() };
    } catch (error) {
        return { success: false, error: error.stderr ? error.stderr.toString() : error.stdout.toString() };
    } finally {
        try { rmSync(originalRegistry); } catch (e) {}
        try { renameSync(backupRegistry, originalRegistry); } catch (e) {}
    }
}

test('project manifest parsing and validation', async (t) => {
    await t.test('accepts a valid project manifest', () => {
        const result = runPython(validManifest);
        assert.equal(result.success, true);
    });

    await t.test('rejects missing required fields', () => {
        const invalid = { ...validManifest };
        delete invalid.schema_version;
        const result = runPython(invalid);
        assert.equal(result.success, false);
        assert.match(result.error, /'schema_version' is a required property/);
    });

    await t.test('rejects wrong types', () => {
        const invalid = { ...validManifest, name: 123 };
        const result = runPython(invalid);
        assert.equal(result.success, false);
        assert.match(result.error, /123 is not of type 'string'/);
    });

    await t.test('rejects duplicate keys', () => {
        const duplicateKeyJson = `{
          "schema_version": "freedom.project/v1",
          "schema_version": "freedom.project/v1",
          "kind": "Project",
          "name": "Example",
          "summary": "Example public project",
          "repository": {
            "visibility": "public",
            "repository_id": "42",
            "html_url": "https://github.com/example/project",
            "full_name": "example/project",
            "is_fork": false,
            "default_branch": "main"
          },
          "data_boundary": {
            "classification": "public"
          },
          "toolchain": {
            "runtime_version_file": null,
            "lockfile": null,
            "package_manifest": null
          },
          "ownership": {
            "external_owner": null
          }
        }`;
        const result = runPython(duplicateKeyJson, true);
        assert.equal(result.success, false);
        assert.match(result.error, /Duplicate manifest key: schema_version/);
    });
});

test('registry declarations parsing and validation', async (t) => {
    await t.test('accepts a valid registry', () => {
        const result = runRegistry(validRegistry);
        assert.equal(result.success, true);
    });

    await t.test('rejects missing required fields', () => {
        const invalid = { ...validRegistry };
        delete invalid.schema_version;
        const result = runRegistry(invalid);
        assert.equal(result.success, false);
        assert.match(result.error, /Expected registry declarations/);
    });

    await t.test('rejects duplicate skill names', () => {
        const invalid = {
            "schema_version": "freedom.registry-declarations/v1",
            "packages": [
                {
                    "package_id": "skill:example/lesson",
                    "repository_url": "https://github.com/example/lesson",
                    "commit": "a".repeat(40),
                    "manifest_path": "freedom-skill.yaml",
                    "intent": "request_import"
                },
                {
                    "package_id": "skill:example/lesson",
                    "repository_url": "https://github.com/example/lesson2",
                    "commit": "b".repeat(40),
                    "manifest_path": "freedom-skill.yaml",
                    "intent": "request_import"
                }
            ]
        };
        const result = runRegistry(invalid);
        assert.equal(result.success, false);
        assert.match(result.error, /Duplicate package declaration/);
    });

    await t.test('rejects wrong types', () => {
        const invalid = {
            "schema_version": "freedom.registry-declarations/v1",
            "packages": [
                {
                    "package_id": 123,
                    "repository_url": "https://github.com/example/lesson",
                    "commit": "a".repeat(40),
                    "manifest_path": "freedom-skill.yaml",
                    "intent": "request_import"
                }
            ]
        };
        const result = runRegistry(invalid);
        assert.equal(result.success, false);
        assert.match(result.error, /Each declaration needs a package ID/);
    });
});
