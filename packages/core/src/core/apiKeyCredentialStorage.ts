/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { createCache } from '../utils/cache.js';
import { getErrorMessage } from '../utils/errors.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';
const DEFAULT_API_KEY_ENTRY = 'default-api-key';

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

/**
 * Verifies if an API key is valid by making a minimal API call.
 * @param apiKey The API key to verify.
 * @returns An error message if invalid, null if valid.
 */
export async function verifyApiKey(apiKey: string): Promise<string | null> {
  if (!apiKey || apiKey.trim() === '') {
    return 'API key cannot be empty.';
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );

    if (response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    let message = response.statusText || 'Unknown error';

    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'message' in data.error &&
      typeof data.error.message === 'string'
    ) {
      message = data.error.message;
    }

    if (response.status === 400 && message.includes('API_KEY_INVALID')) {
      return 'The provided API key is invalid. Please check your key and try again.';
    }

    if (response.status === 429 || message.toLowerCase().includes('quota')) {
      return 'The API key is valid, but you have exceeded your quota or the account lacks necessary permissions.';
    }

    return `API validation failed (${response.status}): ${message}`;
  } catch (error) {
    debugLogger.error('Failed to verify API key:', error);
    return `Failed to connect to Gemini API: ${getErrorMessage(error)}`;
  }
}

// Cache to store the results of loadApiKey to avoid redundant keychain access.
const apiKeyCache = createCache<string, Promise<string | null>>({
  storage: 'map',
  defaultTtl: 30000, // 30 seconds
});

/**
 * Resets the API key cache. Used exclusively for test isolation.
 * @internal
 */
export function resetApiKeyCacheForTesting() {
  apiKeyCache.clear();
}

/**
 * Load cached API key
 */
export async function loadApiKey(): Promise<string | null> {
  return apiKeyCache.getOrCreate(DEFAULT_API_KEY_ENTRY, async () => {
    try {
      const credentials = await storage.getCredentials(DEFAULT_API_KEY_ENTRY);

      if (credentials?.token?.accessToken) {
        return credentials.token.accessToken;
      }

      return null;
    } catch (error: unknown) {
      // Log other errors but don't crash, just return null so user can re-enter key
      debugLogger.error('Failed to load API key from storage:', error);
      return null;
    }
  });
}

/**
 * Save API key
 */
export async function saveApiKey(
  apiKey: string | null | undefined,
): Promise<void> {
  apiKeyCache.delete(DEFAULT_API_KEY_ENTRY);
  if (!apiKey || apiKey.trim() === '') {
    try {
      await storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
    } catch (error: unknown) {
      // Ignore errors when deleting, as it might not exist
      debugLogger.warn('Failed to delete API key from storage:', error);
    }
    return;
  }

  // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
  const credentials: OAuthCredentials = {
    serverName: DEFAULT_API_KEY_ENTRY,
    token: {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Clear cached API key
 */
export async function clearApiKey(): Promise<void> {
  apiKeyCache.delete(DEFAULT_API_KEY_ENTRY);
  try {
    await storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
  } catch (error: unknown) {
    debugLogger.error('Failed to clear API key from storage:', error);
  }
}
