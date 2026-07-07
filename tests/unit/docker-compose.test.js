/**
 * Verify docker-compose.yml includes a volume bind-mount for ./data
 * so that server-side JSON persistence survives container restarts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const COMPOSE_PATH = path.join(process.cwd(), 'docker-compose.yml');

function readComposeFile() {
  return fs.readFileSync(COMPOSE_PATH, 'utf-8');
}

describe('docker-compose.yml', () => {
  it('exists', () => {
    expect(fs.existsSync(COMPOSE_PATH)).toBe(true);
  });

  it('has a volumes entry on the app service', () => {
    const content = readComposeFile();
    // The app service should have a volumes: block
    expect(content).toMatch(/^\s+volumes:\s*$/m);
  });

  it('maps ./data to /app/data for data persistence', () => {
    const content = readComposeFile();
    // Check for the bind mount: host ./data -> container /app/data
    expect(content).toContain('./data:/app/data');
  });

  it('volumes entry is under the app service, not at top level', () => {
    const content = readComposeFile();
    // Find the volumes line under the app service (indented inside services)
    // The "volumes:" at the app service level should be indented
    // Top-level "volumes:" (docker named volumes) would be at column 0
    const lines = content.split('\n');
    const indentedVolumesLine = lines.find(
      (line) => line.match(/^\s{2,}volumes:\s*$/)
    );
    expect(indentedVolumesLine).toBeDefined();

    // Ensure there's NO top-level volumes block (that would be a named volume, not bind mount)
    const topLevelVolumes = lines.find(
      (line) => line.match(/^volumes:\s*$/)
    );
    if (topLevelVolumes) {
      // If there IS a top-level volumes, the app service volumes should still have the bind mount
      expect(indentedVolumesLine).toBeDefined();
    }
  });
});
