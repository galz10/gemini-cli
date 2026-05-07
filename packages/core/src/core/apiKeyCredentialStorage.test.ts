/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadApiKey,
  saveApiKey,
  clearApiKey,
  verifyApiKey,
  resetApiKeyCacheForTesting,
} from './apiKeyCredentialStorage.js';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const setCredentialsMock = vi.hoisted(() => vi.fn());
const deleteCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn().mockImplementation(() => ({
    getCredentials: getCredentialsMock,
    setCredentials: setCredentialsMock,
    deleteCredentials: deleteCredentialsMock,
  })),
}));

describe('ApiKeyCredentialStorage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetApiKeyCacheForTesting();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('verifyApiKey', () => {
    it('should return null for a valid API key', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const result = await verifyApiKey('valid-key');
      expect(result).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('valid-key'),
      );
    });

    it('should return error message for empty key', async () => {
      const result = await verifyApiKey('');
      expect(result).toBe('API key cannot be empty.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle invalid API key error (standard)', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            code: 400,
            message: 'API_KEY_INVALID',
            status: 'INVALID_ARGUMENT',
          },
        }),
      } as Response);

      const result = await verifyApiKey('invalid-key');
      expect(result).toContain('provided API key is invalid');
    });

    it('should handle invalid API key error (structured ErrorInfo)', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'API_KEY_INVALID',
                domain: 'googleapis.com',
                metadata: {
                  service: 'generativelanguage.googleapis.com',
                },
              },
            ],
          },
        }),
      } as Response);

      const result = await verifyApiKey('invalid-key');
      expect(result).toContain('provided API key is invalid');
    });

    it('should handle quota exceeded error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: {
            code: 429,
            message: 'Quota exceeded for metric...',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
      } as Response);

      const result = await verifyApiKey('quota-key');
      expect(result).toContain('exceeded your quota');
    });

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error('Network failure'),
      );

      const result = await verifyApiKey('any-key');
      expect(result).toContain('Failed to connect');
    });

    it('should handle unknown API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: {
            code: 500,
            message: 'Something went wrong',
          },
        }),
      } as Response);

      const result = await verifyApiKey('key');
      expect(result).toBe('API validation failed (500): Something went wrong');
    });
  });

  describe('Storage operations', () => {
    it('should load an API key and cache it', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: {
          accessToken: 'test-key',
          tokenType: 'ApiKey',
        },
        updatedAt: Date.now(),
      });

      const apiKey1 = await loadApiKey();
      expect(apiKey1).toBe('test-key');
      expect(getCredentialsMock).toHaveBeenCalledTimes(1);

      const apiKey2 = await loadApiKey();
      expect(apiKey2).toBe('test-key');
      expect(getCredentialsMock).toHaveBeenCalledTimes(1); // Should be cached
    });

    it('should return null if no API key is stored and cache it', async () => {
      getCredentialsMock.mockResolvedValue(null);
      const apiKey1 = await loadApiKey();
      expect(apiKey1).toBeNull();
      expect(getCredentialsMock).toHaveBeenCalledTimes(1);

      const apiKey2 = await loadApiKey();
      expect(apiKey2).toBeNull();
      expect(getCredentialsMock).toHaveBeenCalledTimes(1); // Should be cached
    });

    it('should save an API key and clear cache', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: {
          accessToken: 'old-key',
          tokenType: 'ApiKey',
        },
        updatedAt: Date.now(),
      });

      await loadApiKey();
      expect(getCredentialsMock).toHaveBeenCalledTimes(1);

      await saveApiKey('new-key');
      expect(setCredentialsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'default-api-key',
          token: expect.objectContaining({
            accessToken: 'new-key',
            tokenType: 'ApiKey',
          }),
        }),
      );

      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: {
          accessToken: 'new-key',
          tokenType: 'ApiKey',
        },
        updatedAt: Date.now(),
      });

      await loadApiKey();
      expect(getCredentialsMock).toHaveBeenCalledTimes(2); // Should have fetched again
    });

    it('should clear an API key and clear cache', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: {
          accessToken: 'old-key',
          tokenType: 'ApiKey',
        },
        updatedAt: Date.now(),
      });

      await loadApiKey();
      expect(getCredentialsMock).toHaveBeenCalledTimes(1);

      await clearApiKey();
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');

      getCredentialsMock.mockResolvedValue(null);
      await loadApiKey();
      expect(getCredentialsMock).toHaveBeenCalledTimes(2); // Should have fetched again
    });

    it('should clear an API key and cache when saving empty key', async () => {
      await saveApiKey('');
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
      expect(setCredentialsMock).not.toHaveBeenCalled();
    });

    it('should clear an API key and cache when saving null key', async () => {
      await saveApiKey(null);
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
      expect(setCredentialsMock).not.toHaveBeenCalled();
    });

    it('should not throw when clearing an API key fails during saveApiKey', async () => {
      deleteCredentialsMock.mockRejectedValueOnce(
        new Error('Failed to delete'),
      );
      await expect(saveApiKey('')).resolves.not.toThrow();
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    });

    it('should not throw when clearing an API key fails during clearApiKey', async () => {
      deleteCredentialsMock.mockRejectedValueOnce(
        new Error('Failed to delete'),
      );
      await expect(clearApiKey()).resolves.not.toThrow();
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    });
  });
});
