#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  checkDomain,
  checkAlternativeTlds,
  getSuggestedTlds,
  parseDomain,
  POPULAR_TLDS,
  TECH_TLDS,
  COUNTRY_TLDS,
  DomainCheckResult,
} from "./domain-checker.js";

// Define MCP tools
const tools: Tool[] = [
  {
    name: "check_domain",
    description:
      "Check if a single domain name is available for registration. Uses both DNS and WHOIS lookups for reliability.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: {
          type: "string",
          description: "The full domain to check (e.g., 'example.com')",
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "check_alternative_tlds",
    description:
      "Check domain availability across multiple TLDs. Useful for finding available alternatives when the primary TLD is taken.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The domain name without TLD (e.g., 'example')",
        },
        tlds: {
          type: "array",
          items: { type: "string" },
          description:
            "List of TLDs to check. If not provided, checks popular TLDs.",
        },
        category: {
          type: "string",
          enum: ["general", "tech", "country", "all"],
          description:
            "Category of TLDs to check if 'tlds' not provided. Default: general",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "suggest_domains",
    description:
      "Suggest available domain names based on a keyword or phrase. Checks multiple variations and TLDs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "The keyword or phrase to base suggestions on",
        },
        category: {
          type: "string",
          enum: ["general", "tech", "country", "all"],
          description: "Category of TLDs to check. Default: general",
        },
        includeVariations: {
          type: "boolean",
          description:
            "Include variations like adding 'app', 'hq', 'get' prefixes/suffixes. Default: true",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "list_tlds",
    description: "List available TLD categories and their contents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["general", "tech", "country", "all"],
          description: "Category to list. Default: all",
        },
      },
    },
  },
];

// Generate domain variations
function generateVariations(keyword: string): string[] {
  const base = keyword.toLowerCase().replace(/[^a-z0-9]/g, "");
  const variations = [base];

  // Common prefixes
  const prefixes = ["get", "try", "use", "my", "the", "go"];
  // Common suffixes
  const suffixes = ["app", "hq", "io", "hub", "labs", "now"];

  prefixes.forEach((p) => variations.push(`${p}${base}`));
  suffixes.forEach((s) => variations.push(`${base}${s}`));

  return [...new Set(variations)];
}

// Create the MCP server
const server = new Server(
  {
    name: "domain-checker",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "check_domain": {
        const domain = args?.domain as string;
        if (!domain) {
          throw new Error("Domain is required");
        }
        const result = await checkDomain(domain);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "check_alternative_tlds": {
        const domainName = args?.name as string;
        if (!domainName) {
          throw new Error("Domain name is required");
        }

        let tlds: string[];
        if (args?.tlds && Array.isArray(args.tlds)) {
          tlds = args.tlds as string[];
        } else {
          const category = (args?.category as string) || "general";
          tlds = getSuggestedTlds(category as "general" | "tech" | "country" | "all");
        }

        const results = await checkAlternativeTlds(domainName, tlds);

        // Separate available and taken
        const available = results.results.filter((r) => r.available);
        const taken = results.results.filter((r) => !r.available);

        const summary = {
          originalDomain: results.originalDomain,
          totalChecked: results.results.length,
          availableCount: available.length,
          takenCount: taken.length,
          available,
          taken,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      case "suggest_domains": {
        const keyword = args?.keyword as string;
        if (!keyword) {
          throw new Error("Keyword is required");
        }

        const category = (args?.category as string) || "general";
        const includeVariations = args?.includeVariations !== false;

        const names = includeVariations ? generateVariations(keyword) : [keyword];
        const tlds = getSuggestedTlds(category as "general" | "tech" | "country" | "all");

        // Check all combinations
        const allResults: DomainCheckResult[] = [];
        for (const name of names) {
          const results = await checkAlternativeTlds(name, tlds.slice(0, 5), { concurrency: 3 });
          allResults.push(...results.results);
        }

        const available = allResults.filter((r) => r.available);

        const summary = {
          keyword,
          variationsChecked: names,
          totalChecked: allResults.length,
          availableCount: available.length,
          suggestions: available.sort((a, b) => {
            // Sort by confidence then by domain length
            if (a.confidence !== b.confidence) {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.confidence] - order[b.confidence];
            }
            return a.domain.length - b.domain.length;
          }),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      case "list_tlds": {
        const category = (args?.category as string) || "all";
        let result: Record<string, string[]>;

        switch (category) {
          case "general":
            result = { general: POPULAR_TLDS };
            break;
          case "tech":
            result = { tech: TECH_TLDS };
            break;
          case "country":
            result = { country: COUNTRY_TLDS };
            break;
          case "all":
          default:
            result = {
              general: POPULAR_TLDS,
              tech: TECH_TLDS,
              country: COUNTRY_TLDS,
            };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Domain Checker MCP server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
