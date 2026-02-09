#!/usr/bin/env node

import { parseArgs } from "util";
import {
  checkDomain,
  checkAlternativeTlds,
  getSuggestedTlds,
  POPULAR_TLDS,
  TECH_TLDS,
  COUNTRY_TLDS,
  DomainCheckResult,
} from "./domain-checker.js";

const HELP = `
domain-check - Check domain name availability

USAGE:
  domain-check <domain>              Check a single domain
  domain-check <name> --alt          Check domain across popular TLDs
  domain-check <name> --alt --tech   Check domain across tech TLDs
  domain-check <name> --tlds com,net,io  Check specific TLDs

OPTIONS:
  -a, --alt         Check alternative TLDs
  -t, --tech        Use tech-focused TLDs (io, dev, app, etc.)
  -c, --country     Use country-code TLDs
  --tlds <list>     Comma-separated list of TLDs to check
  --json            Output as JSON
  --available-only  Only show available domains
  -h, --help        Show this help message

EXAMPLES:
  domain-check example.com
  domain-check myapp --alt
  domain-check startup --alt --tech
  domain-check mybrand --tlds com,io,dev,app
`;

function formatResult(result: DomainCheckResult, json: boolean): string {
  if (json) {
    return JSON.stringify(result);
  }

  const status = result.available ? "✅ AVAILABLE" : "❌ TAKEN";
  const confidence = `[${result.confidence} confidence]`;
  const details = result.details ? ` - ${result.details}` : "";
  const error = result.error ? ` (Error: ${result.error})` : "";

  return `${result.domain}: ${status} ${confidence}${details}${error}`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      alt: { type: "boolean", short: "a", default: false },
      tech: { type: "boolean", short: "t", default: false },
      country: { type: "boolean", short: "c", default: false },
      tlds: { type: "string" },
      json: { type: "boolean", default: false },
      "available-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const domain = positionals[0];
  const isJson = values.json;
  const availableOnly = values["available-only"];

  try {
    if (values.alt || values.tech || values.country || values.tlds) {
      // Check multiple TLDs
      let tlds: string[];

      if (values.tlds) {
        tlds = values.tlds.split(",").map((t) => t.trim().toLowerCase());
      } else if (values.tech) {
        tlds = TECH_TLDS;
      } else if (values.country) {
        tlds = COUNTRY_TLDS;
      } else {
        tlds = POPULAR_TLDS;
      }

      const results = await checkAlternativeTlds(domain, tlds);

      let filteredResults = results.results;
      if (availableOnly) {
        filteredResults = filteredResults.filter((r) => r.available);
      }

      if (isJson) {
        console.log(JSON.stringify({ ...results, results: filteredResults }, null, 2));
      } else {
        console.log(`\nChecking availability for: ${results.originalDomain}\n`);
        console.log("=".repeat(60));

        const available = filteredResults.filter((r) => r.available);
        const taken = filteredResults.filter((r) => !r.available);

        if (available.length > 0) {
          console.log("\n✅ AVAILABLE DOMAINS:");
          available.forEach((r) => console.log(`  ${formatResult(r, false)}`));
        }

        if (!availableOnly && taken.length > 0) {
          console.log("\n❌ TAKEN DOMAINS:");
          taken.forEach((r) => console.log(`  ${formatResult(r, false)}`));
        }

        console.log("\n" + "=".repeat(60));
        console.log(
          `Summary: ${available.length} available, ${taken.length} taken out of ${results.results.length} checked`
        );
      }
    } else {
      // Check single domain
      const result = await checkDomain(domain);

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatResult(result, false));
      }

      process.exit(result.available ? 0 : 1);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
