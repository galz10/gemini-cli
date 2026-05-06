/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp add' command
import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger, type MCPServerConfig } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { z } from 'zod';

const addMcpServerArgsSchema = z.object({
  name: z.string(),
  commandOrUrl: z.string(),
  args: z.array(z.union([z.string(), z.number()])).optional(),
  scope: z.enum(['user', 'project']),
  transport: z.enum(['stdio', 'sse', 'http']),
  env: z.array(z.string()).optional(),
  header: z.array(z.string()).optional(),
  timeout: z.number().optional(),
  trust: z.boolean().optional(),
  description: z.string().optional(),
  includeTools: z.array(z.string()).optional(),
  excludeTools: z.array(z.string()).optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  oauthAuthUrl: z.string().optional(),
  oauthTokenUrl: z.string().optional(),
  oauthScopes: z.array(z.string()).optional(),
});

async function addMcpServer(
  name: string,
  commandOrUrl: string,
  args: Array<string | number> | undefined,
  options: {
    scope: string;
    transport: string;
    env?: string[];
    header?: string[];
    timeout?: number;
    trust?: boolean;
    description?: string;
    includeTools?: string[];
    excludeTools?: string[];
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthAuthUrl?: string;
    oauthTokenUrl?: string;
    oauthScopes?: string[];
  },
) {
  const {
    scope,
    transport,
    env,
    header,
    timeout,
    trust,
    description,
    includeTools,
    excludeTools,
    oauthClientId,
    oauthClientSecret,
    oauthAuthUrl,
    oauthTokenUrl,
    oauthScopes,
  } = options;

  const settings = loadSettings(process.cwd());
  const inHome = settings.workspace.path === settings.user.path;

  if (scope === 'project' && inHome) {
    debugLogger.error(
      'Error: Please use --scope user to edit settings in the home directory.',
    );
    process.exit(1);
  }

  const settingsScope =
    scope === 'user' ? SettingScope.User : SettingScope.Workspace;

  let newServer: Partial<MCPServerConfig> = {};

  const headers = header?.reduce(
    (acc, curr) => {
      const [key, ...valueParts] = curr.split(':');
      const value = valueParts.join(':').trim();
      if (key.trim() && value) {
        acc[key.trim()] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  const oauth =
    oauthClientId || oauthAuthUrl || oauthTokenUrl
      ? {
          clientId: oauthClientId,
          clientSecret: oauthClientSecret,
          authorizationUrl: oauthAuthUrl,
          tokenUrl: oauthTokenUrl,
          scopes: oauthScopes,
        }
      : undefined;

  switch (transport) {
    case 'sse':
      newServer = {
        url: commandOrUrl,
        type: 'sse',
        headers,
        timeout,
        trust,
        description,
        includeTools,
        excludeTools,
        oauth,
      };
      break;
    case 'http':
      newServer = {
        url: commandOrUrl,
        type: 'http',
        headers,
        timeout,
        trust,
        description,
        includeTools,
        excludeTools,
        oauth,
      };
      break;
    case 'stdio':
    default:
      newServer = {
        command: commandOrUrl,
        args: args?.map(String),
        env: env?.reduce(
          (acc, curr) => {
            const [key, value] = curr.split('=');
            if (key && value) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
        timeout,
        trust,
        description,
        includeTools,
        excludeTools,
        oauth,
      };
      break;
  }

  const existingSettings = settings.forScope(settingsScope).settings;
  const mcpServers = existingSettings.mcpServers || {};

  const isExistingServer = !!mcpServers[name];
  if (isExistingServer) {
    debugLogger.log(
      `MCP server "${name}" is already configured within ${scope} settings.`,
    );
  }

  mcpServers[name] = newServer as MCPServerConfig;

  settings.setValue(settingsScope, 'mcpServers', mcpServers);

  if (isExistingServer) {
    debugLogger.log(`MCP server "${name}" updated in ${scope} settings.`);
  } else {
    debugLogger.log(
      `MCP server "${name}" added to ${scope} settings. (${transport})`,
    );
  }
}

export const addCommand: CommandModule = {
  command: 'add <name> <commandOrUrl> [args...]',
  describe: 'Add a server',
  builder: (yargs) =>
    yargs
      .usage('Usage: gemini mcp add [options] <name> <commandOrUrl> [args...]')
      .parserConfiguration({
        'unknown-options-as-args': true, // Pass unknown options as server args
        'populate--': true, // Populate server args after -- separator
      })
      .positional('name', {
        describe: 'Name of the server',
        type: 'string',
        demandOption: true,
      })
      .positional('commandOrUrl', {
        describe: 'Command (stdio) or URL (sse, http)',
        type: 'string',
        demandOption: true,
      })
      .option('scope', {
        alias: 's',
        describe: 'Configuration scope (user or project)',
        type: 'string',
        default: 'project',
        choices: ['user', 'project'],
      })
      .option('transport', {
        alias: ['t', 'type'],
        describe: 'Transport type (stdio, sse, http)',
        type: 'string',
        default: 'stdio',
        choices: ['stdio', 'sse', 'http'],
      })
      .option('env', {
        alias: 'e',
        describe: 'Set environment variables (e.g. -e KEY=value)',
        type: 'array',
        string: true,
        nargs: 1,
      })
      .option('header', {
        alias: 'H',
        describe:
          'Set HTTP headers for SSE and HTTP transports (e.g. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123")',
        type: 'array',
        string: true,
        nargs: 1,
      })
      .option('timeout', {
        describe: 'Set connection timeout in milliseconds',
        type: 'number',
      })
      .option('trust', {
        describe:
          'Trust the server (bypass all tool call confirmation prompts)',
        type: 'boolean',
      })
      .option('description', {
        describe: 'Set the description for the server',
        type: 'string',
      })
      .option('include-tools', {
        describe: 'A comma-separated list of tools to include',
        type: 'array',
        string: true,
      })
      .option('exclude-tools', {
        describe: 'A comma-separated list of tools to exclude',
        type: 'array',
        string: true,
      })
      .option('oauth-client-id', {
        describe: 'OAuth Client ID for the server',
        type: 'string',
      })
      .option('oauth-client-secret', {
        describe: 'OAuth Client Secret for the server',
        type: 'string',
      })
      .option('oauth-auth-url', {
        describe: 'OAuth Authorization URL for the server',
        type: 'string',
      })
      .option('oauth-token-url', {
        describe: 'OAuth Token URL for the server',
        type: 'string',
      })
      .option('oauth-scopes', {
        describe:
          'OAuth Scopes for the server (can be provided multiple times)',
        type: 'array',
        string: true,
        nargs: 1,
      })
      .middleware((argv) => {
        // Handle -- separator args as server args if present
        const doubleDash = argv['--'];
        if (Array.isArray(doubleDash)) {
          const rawArgs = argv['args'];
          const existingArgs: Array<string | number> = Array.isArray(rawArgs)
            ? rawArgs.filter(
                (item): item is string | number =>
                  typeof item === 'string' || typeof item === 'number',
              )
            : [];
          argv['args'] = [...existingArgs, ...doubleDash.map(String)];
        }
      }),
  handler: async (argv) => {
    const result = addMcpServerArgsSchema.safeParse(argv);
    if (!result.success) {
      debugLogger.error('Invalid arguments:', result.error.format());
      process.exit(1);
    }

    const { name, commandOrUrl, args, ...options } = result.data;
    await addMcpServer(name, commandOrUrl, args, options);
    await exitCli();
  },
};
