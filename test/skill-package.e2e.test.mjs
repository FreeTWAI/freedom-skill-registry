import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

const execFileAsync = promisify(execFile);

// Tests verifying that the skill package schema handles validation as expected,
// without requiring runtime product code modification.
// Since schema definitions for validation are located in vendor/freedom-platform/schemas/,
// and there is no product code export, we validate the e2e capability through the native
// test runner (`node --test`) by spawning a python jsonschema subprocess against a test fixture.

async function validateManifestWithPythonScript(manifest) {
  const schemaPath = path.resolve('vendor/freedom-platform/schemas/skill-package.schema.json');

  const tempManifestPath = path.resolve('.temp-manifest.json');
  writeFileSync(tempManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // Verify that schema successfully evaluates invariants on the structure.
  const pythonScript = `
import json, sys
from jsonschema import Draft202012Validator, FormatChecker

schema_path = sys.argv[1]
manifest_path = sys.argv[2]

with open(schema_path, 'r', encoding='utf-8') as f:
    schema = json.load(f)

with open(manifest_path, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

validator = Draft202012Validator(schema, format_checker=FormatChecker())
errors = list(validator.iter_errors(manifest))

if errors:
    for e in errors:
        path_str = ".".join([str(p) for p in e.path])
        print(f"{path_str}: {e.message}", file=sys.stderr)
    sys.exit(1)
`;

  const tempScriptPath = path.resolve('.temp-validator.py');
  writeFileSync(tempScriptPath, pythonScript, 'utf-8');

  try {
    await execFileAsync('python3', [tempScriptPath, schemaPath, tempManifestPath]);
    return { valid: true, errors: '' };
  } catch (error) {
    return { valid: false, errors: error.stderr };
  } finally {
    try {
      unlinkSync(tempManifestPath);
      unlinkSync(tempScriptPath);
    } catch {}
  }
}

const baseManifest = {
  schema_version: 'freedom.skill/v1',
  id: 'skill:example/test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  source: {
    repository: 'https://github.com/example/test-skill',
    repository_id: '123456789',
    repository_is_fork: false,
    commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    manifest_path: 'freedom-skill.yaml'
  },
  summary: 'A test skill for validation',
  requested_capabilities: [],
  human_control: {
    principal_required: true,
    independent_review_same_agent_is_insufficient: true,
    a4_exact_digest_signature: true,
    never_store_chain_of_thought: true
  }
};

test('E2E validation checks skill package dependencies correctly resolve schema constraints', async () => {
  const manifest = {
    ...baseManifest,
    requested_capabilities: ['dependency_resolution'],
    requirements: {
      dependencies: [
        {
          package_id: 'skill:other/dependency',
          version_range: '^2.0.0'
        }
      ]
    }
  };

  const result = await validateManifestWithPythonScript(manifest);
  assert.equal(result.valid, true, `Validation failed unexpectedly: ${result.errors}`);
});

test('E2E validation enforces rigid semver_2_0_0 formatting', async () => {
  const manifest = {
    ...baseManifest,
    version: 'v1.0.0' // Invalid prefix
  };

  const result = await validateManifestWithPythonScript(manifest);
  assert.equal(result.valid, false, 'Should have failed version format validation');
  assert.match(result.errors, /version/);
});

test('E2E validation verifies capability enforcement: dependency_resolution capability forces requirements block', async () => {
  const manifest = {
    ...baseManifest,
    requested_capabilities: ['dependency_resolution']
  };

  const result = await validateManifestWithPythonScript(manifest);
  assert.equal(result.valid, false, 'Should have failed due to missing requirements block');
  assert.match(result.errors, /requirements/);
});

test('E2E validation asserts proper formatting of package_id within dependency block', async () => {
  const manifest = {
    ...baseManifest,
    requested_capabilities: ['dependency_resolution'],
    requirements: {
      dependencies: [
        {
          package_id: 'invalid-package-id',
          version_range: '^2.0.0'
        }
      ]
    }
  };

  const result = await validateManifestWithPythonScript(manifest);
  assert.equal(result.valid, false, 'Should have failed dependency package_id format validation');
  assert.match(result.errors, /requirements\.dependencies\.0\.package_id/);
});
