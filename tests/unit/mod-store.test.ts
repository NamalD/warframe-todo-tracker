import { describe, it, expect } from 'vitest';

describe('ModStore singleton', () => {
  it('exports a ModRepository instance as default', async () => {
    const modRepo = (await import('../../src/data/mod-store.ts')).default;
    expect(modRepo).toBeDefined();
    expect(typeof modRepo.getMods).toBe('function');
    expect(typeof modRepo.getModById).toBe('function');
    expect(typeof modRepo.setModOwned).toBe('function');
    expect(typeof modRepo.setModRank).toBe('function');
    expect(typeof modRepo.getStats).toBe('function');
  });

  it('returns the same instance on repeated imports', async () => {
    const { default: repo1 } = await import('../../src/data/mod-store.ts');
    const { default: repo2 } = await import('../../src/data/mod-store.ts');
    expect(repo1).toBe(repo2);
  });
});
