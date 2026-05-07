/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamableHTTPClientTransport as BaseStreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * A specialized StreamableHTTPClientTransport that ensures Authorization headers
 * are properly forwarded to the SSE GET request.
 *
 * Issue 25473: The Model Context Protocol SDK's `StreamableHTTPClientTransport`
 * implementation of `_startOrAuthSse` uses `(this._fetch ?? fetch)` directly,
 * bypassing the `fetchWithInit` wrapper that handles merging base headers
 * (like Authorization). While it manually retrieves `_commonHeaders()`, it may
 * not correctly handle all header types or might miss other `requestInit` options.
 *
 * This implementation overrides `_fetch` on the instance to ensure that EVERY
 * fetch call made by the transport, including the initial SSE GET request,
 * includes the headers provided in `requestInit`.
 */
export class StreamableHTTPClientTransport extends BaseStreamableHTTPClientTransport {
  constructor(url: URL, opts?: StreamableHTTPClientTransportOptions) {
    super(url, opts);

    const baseFetch = opts?.fetch ?? fetch;
    const requestInit = opts?.requestInit ?? {};
    const baseHeaders = requestInit.headers ?? {};

    // Re-bind the internal _fetch property to a wrapper that ensures headers are merged.
    // We use a plain object for merged headers to ensure compatibility with all fetch implementations.
    type InternalTransport = {
      _fetch: (url: URL | string, init?: RequestInit) => Promise<Response>;
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (this as unknown as InternalTransport)._fetch = async (url, init) => {
      const mergedHeaders: Record<string, string> = {};

      // Helper to normalize headers from various formats (Headers object, Array, Record)
      const addHeaders = (headers: HeadersInit | undefined) => {
        if (!headers) return;
        if (headers instanceof Headers) {
          headers.forEach((v, k) => (mergedHeaders[k] = v));
        } else if (Array.isArray(headers)) {
          headers.forEach(([k, v]) => (mergedHeaders[k] = v));
        } else {
          Object.entries(headers).forEach(([k, v]) => (mergedHeaders[k] = v));
        }
      };

      // Add base headers first, then call-specific headers
      addHeaders(baseHeaders);
      addHeaders(init?.headers);

      const mergedInit = {
        ...requestInit,
        ...init,
        headers: mergedHeaders,
      };

      return baseFetch(url, mergedInit);
    };
  }
}
