const packageIdPattern = /^skill:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const repositoryIdPattern = /^[1-9][0-9]{0,19}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const relationships = new Set(['author', 'maintainer', 'contributor', 'curator']);

const validDeclarationKeys = new Set(['schema_version', 'packages']);
const validEntryKeys = new Set(['package_id', 'repository_url', 'commit', 'manifest_path', 'intent']);

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
  const repoUrl = repository.html_url ?? '';
  if (!repositoryPattern.test(repoUrl) || repoUrl !== `https://github.com/${repository.full_name}`) throw new TypeError('Repository identity is inconsistent');
  if (!repositoryIdPattern.test(repository.repository_id ?? '')) throw new TypeError('A real GitHub repository ID is required');

  if (!relationships.has(relationship) || consentToShare !== true) throw new TypeError('An explicit relationship and sharing consent are required');

  const name = manifest.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new TypeError('Project name and summary are required');

  const summary = manifest.summary;
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 240) throw new TypeError('Project name and summary are required');

  if (typeof useNotes !== 'string' || !useNotes.trim() || useNotes.trim().length > 3000) throw new TypeError('Use notes must be a non-empty string of at most 3000 characters');

  return {
    repository_url: repoUrl,
    title: name,
    description: summary,
    use_notes: useNotes,
    demo_url: null,
    relationship,
    consent_to_share: true,
  };
}

export function validateDeclarations(input) {
  if (input?.schema_version !== 'freedom.registry-declarations/v1' || !Array.isArray(input.packages)) throw new TypeError('Expected registry declarations');

  for (const key in input) {
    if (!validDeclarationKeys.has(key)) throw new TypeError('Unknown declaration-list field');
  }

  const seen = new Set();
  const packages = input.packages;
  for (let i = 0; i < packages.length; i++) {
    const entry = packages[i];
    if (!entry || !packageIdPattern.test(entry.package_id ?? '') || !repositoryPattern.test(entry.repository_url ?? '') || !commitPattern.test(entry.commit ?? '')) throw new TypeError('Each declaration needs a package ID, public repository URL and full commit SHA');

    for (const key in entry) {
      if (!validEntryKeys.has(key)) throw new TypeError('Unknown declaration field; acceptance and trust come from Platform');
    }

    if (seen.has(entry.package_id)) throw new TypeError('Duplicate package declaration');
    seen.add(entry.package_id);

    if (entry.manifest_path !== 'freedom-skill.yaml') throw new TypeError('The skill manifest must be the root freedom-skill.yaml');
    if (entry.intent !== 'request_import') throw new TypeError('Declarations may request import, not declare validation or official status');
  }
  return input;
}
