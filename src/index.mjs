const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const repositoryIdPattern = /^[1-9][0-9]{0,19}$/;
const skillIdPattern = /^skill:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const commitPattern = /^[a-f0-9]{40}$/;
const relationships = new Set(['author', 'maintainer', 'contributor', 'curator']);

function assertClient(client) {
  if (!client || typeof client.call !== 'function') throw new TypeError('A pinned Platform client is required');
}

export function listRegisteredProjects(client) {
  assertClient(client);
  return client.call('listProjects');
}

/** Import is an authenticated Platform command, not a local registry write or a trust grant. */
export function registerProject(client, body, options = {}) {
  assertClient(client);
  if (!body || !repositoryPattern.test(body.repository_url ?? '')) throw new TypeError('A public GitHub repository URL is required');
  if (!relationships.has(body.relationship)) throw new TypeError('State your actual relationship to the repository');
  if (body.consent_to_share !== true) throw new TypeError('Explicit sharing consent is required');
  if (typeof options.idempotencyKey !== 'string' || !options.idempotencyKey.trim()) throw new TypeError('A stable idempotency key is required');
  return client.call('importProject', { body, idempotencyKey: options.idempotencyKey });
}

/** A narrow mapping, not a replacement for the canonical manifest validator or GitHub verification. */
export function projectManifestToImport(manifest, { relationship, consentToShare = false, useNotes } = {}) {
  if (manifest?.schema_version !== 'freedom.project/v1' || manifest.kind !== 'Project') throw new TypeError('Expected a freedom.project/v1 manifest');
  if (manifest.repository?.visibility !== 'public' || manifest.data_boundary?.classification !== 'public') throw new TypeError('Only explicitly public project metadata can be imported here');
  const repository = manifest.repository;
  if (!repositoryPattern.test(repository.html_url ?? '') || repository.html_url !== `https://github.com/${repository.full_name}`) throw new TypeError('Repository identity is inconsistent');
  if (!repositoryIdPattern.test(repository.repository_id ?? '')) throw new TypeError('A real GitHub repository ID is required');
  if (!relationships.has(relationship) || consentToShare !== true) throw new TypeError('An explicit relationship and sharing consent are required');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 120 || typeof manifest.summary !== 'string' || !manifest.summary.trim() || manifest.summary.length > 240) throw new TypeError('Project name and summary are required');
  if (typeof useNotes !== 'string' || !useNotes.trim() || useNotes.trim().length > 3000) throw new TypeError('Use notes must be a non-empty string of at most 3000 characters');
  return {
    repository_url: repository.html_url,
    title: manifest.name,
    description: manifest.summary,
    use_notes: useNotes,
    demo_url: null,
    relationship,
    consent_to_share: true,
  };
}

export function validateDeclarations(input) {
  if (input?.schema_version !== 'freedom.registry-declarations/v1' || !Array.isArray(input.packages)) throw new TypeError('Expected registry declarations');
  for (const key in input) {
    if (key !== 'schema_version' && key !== 'packages') throw new TypeError('Unknown declaration-list field');
  }
  const seen = new Set();
  for (const entry of input.packages) {
    if (!entry || !skillIdPattern.test(entry.package_id ?? '') || !repositoryPattern.test(entry.repository_url ?? '') || !commitPattern.test(entry.commit ?? '')) throw new TypeError('Each declaration needs a package ID, public repository URL and full commit SHA');
    for (const key in entry) {
      if (key !== 'package_id' && key !== 'repository_url' && key !== 'commit' && key !== 'manifest_path' && key !== 'intent') {
        throw new TypeError('Unknown declaration field; acceptance and trust come from Platform');
      }
    }
    if (seen.has(entry.package_id)) throw new TypeError('Duplicate package declaration');
    seen.add(entry.package_id);
    if (entry.manifest_path !== 'freedom-skill.yaml') throw new TypeError('The skill manifest must be the root freedom-skill.yaml');
    if (entry.intent !== 'request_import') throw new TypeError('Declarations may request import, not declare validation or official status');
  }
  return input;
}
