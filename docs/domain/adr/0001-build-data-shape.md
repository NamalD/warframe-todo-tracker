# User data split between JSON loadouts and flat build/requirement records

Games apps often evolve the wrong shape before settling. Early CRUD of
`BuildDomainEntity` kept everything in one object; later requirements surfaced
from stateless components and registry-fed forms, so `build-repository.ts`
flattened the persisted requirement state without a dedicated requirements table.
The result is cheaper to extend, but cross-reading “what builds include a
requirement X?” requires loading every build record.

Why it was done:
- loadout structures already use JSON `data` blobs (`docs/domain/CONTEXT.md` as source of truth)
- requirements were introduced late, after schema was live
- rollback cost on requirements split is low: requirements are isolated to `Build` and can be normalized later

Consequences:
- Builds store nested requirements in `data` rather than in a dedicated relation
- Synchronization reuses the same version + PUT model already established for build docs
- Reporting queries over requirements require application-level iteration, not SQL

_Hermes artefact of skill: `domain-modeling`_
