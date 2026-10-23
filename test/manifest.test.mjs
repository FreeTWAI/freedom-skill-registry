import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

function runValidate(fixtureName) {
    const fixturePath = join(process.cwd(), 'test', 'fixtures', fixtureName);
    const schemaPath = join(process.cwd(), 'vendor', 'freedom-platform', 'schemas', 'skill-package.schema.json');
    const validatePath = join(process.cwd(), 'test', 'fixtures', 'validate.py');

    try {
        const output = execSync(`python3 "${validatePath}" "${schemaPath}" "${fixturePath}"`, { stdio: 'pipe' });
        return { success: true, output: output.toString() };
    } catch (error) {
        return { success: false, error: error.stderr ? error.stderr.toString() : error.stdout.toString() };
    }
}

test('skill manifest parsing, schema conformance, and duplicate detection', async (t) => {
    await t.test('accepts a valid manifest', () => {
        const result = runValidate('valid-skill.json');
        assert.equal(result.success, true);
    });

    await t.test('rejects missing required fields', () => {
        const result = runValidate('missing-field-skill.json');
        assert.equal(result.success, false);
        assert.match(result.error, /'schema_version' is a required property/);
    });

    await t.test('rejects wrong types', () => {
        const result = runValidate('wrong-types-skill.json');
        assert.equal(result.success, false);
        assert.match(result.error, /123 is not of type 'string'/);
    });

    await t.test('rejects duplicate keys', () => {
        const result = runValidate('duplicate-keys-skill.json');
        assert.equal(result.success, false);
        assert.match(result.error, /Duplicate manifest key: schema_version/);
    });
});
