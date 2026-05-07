/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverProjectId,
  resetSharedAuthForTesting,
} from './projectDiscovery.js';
import { GoogleAuth } from 'google-auth-library';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

describe('projectDiscovery', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    resetSharedAuthForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return project ID from GOOGLE_CLOUD_PROJECT environment variable', async () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'env-project-id';
    const projectId = await discoverProjectId();
    expect(projectId).toBe('env-project-id');
  });

  it('should return project ID from GOOGLE_CLOUD_PROJECT_ID environment variable', async () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'env-project-id-2';
    const projectId = await discoverProjectId();
    expect(projectId).toBe('env-project-id-2');
  });

  it('should discover project ID via GoogleAuth if environment variables are missing', async () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

    const mockGetProjectId = vi.fn().mockResolvedValue('adc-project-id');
    vi.mocked(GoogleAuth).mockImplementation(
      () =>
        ({
          getProjectId: mockGetProjectId,
        }) as unknown as GoogleAuth,
    );

    const projectId = await discoverProjectId();
    expect(projectId).toBe('adc-project-id');
    expect(mockGetProjectId).toHaveBeenCalled();
  });

  it('should return undefined if discovery fails', async () => {
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

    vi.mocked(GoogleAuth).mockImplementation(
      () =>
        ({
          getProjectId: vi
            .fn()
            .mockRejectedValue(new Error('Discovery failed')),
        }) as unknown as GoogleAuth,
    );

    const projectId = await discoverProjectId();
    expect(projectId).toBeUndefined();
  });
});
