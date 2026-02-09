import { promisify } from "util";
import dns from "dns";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const whois = require("whois");

const lookupAsync = promisify(whois.lookup);
const dnsResolve = promisify(dns.resolve);

export interface DomainCheckResult {
  domain: string;
  tld: string;
  available: boolean;
  method: "dns" | "whois" | "both";
  confidence: "high" | "medium" | "low";
  details?: string;
  error?: string;
}

export interface AlternativeTldResult {
  originalDomain: string;
  results: DomainCheckResult[];
}

// Popular TLDs for alternative searches
export const POPULAR_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "co",
  "dev",
  "app",
  "ai",
  "xyz",
  "me",
  "info",
  "biz",
  "tech",
  "online",
  "site",
  "cloud",
];

// Country-code TLDs
export const COUNTRY_TLDS = [
  "uk",
  "de",
  "fr",
  "nl",
  "es",
  "it",
  "pl",
  "ru",
  "jp",
  "cn",
  "au",
  "ca",
  "us",
  "in",
  "br",
];

// Tech/startup focused TLDs
export const TECH_TLDS = [
  "io",
  "dev",
  "app",
  "ai",
  "tech",
  "cloud",
  "software",
  "systems",
  "digital",
  "code",
];

/**
 * Parse domain into name and TLD parts
 */
export function parseDomain(domain: string): { name: string; tld: string } {
  const parts = domain.toLowerCase().trim().split(".");
  if (parts.length < 2) {
    throw new Error(`Invalid domain format: ${domain}. Expected format: name.tld`);
  }
  const tld = parts.pop()!;
  const name = parts.join(".");
  return { name, tld };
}

/**
 * Check if domain has DNS records (indicates it's taken)
 */
async function checkDns(domain: string): Promise<{ exists: boolean; error?: string }> {
  try {
    await dnsResolve(domain, "A");
    return { exists: true };
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      return { exists: false };
    }
    // Other errors might mean the domain exists but has issues
    return { exists: false, error: error.message };
  }
}

/**
 * Check domain availability via WHOIS
 */
async function checkWhois(domain: string): Promise<{ available: boolean; details?: string; error?: string }> {
  try {
    const result = await lookupAsync(domain);
    const whoisData = typeof result === "string" ? result : String(result);

    // Common patterns indicating domain is available
    const availablePatterns = [
      /no match/i,
      /not found/i,
      /no data found/i,
      /no entries found/i,
      /status:\s*free/i,
      /status:\s*available/i,
      /domain not found/i,
      /no object found/i,
      /nothing found/i,
      /^% no match$/im,
    ];

    // Common patterns indicating domain is taken
    const takenPatterns = [
      /domain name:\s*.+/i,
      /registrar:/i,
      /creation date:/i,
      /registered on:/i,
      /status:\s*active/i,
      /status:\s*ok/i,
      /name server:/i,
      /registrant:/i,
    ];

    const isAvailable = availablePatterns.some((pattern) => pattern.test(whoisData));
    const isTaken = takenPatterns.some((pattern) => pattern.test(whoisData));

    if (isAvailable && !isTaken) {
      return { available: true, details: "WHOIS shows domain is not registered" };
    } else if (isTaken) {
      return { available: false, details: "WHOIS shows domain is registered" };
    } else {
      // Ambiguous result
      return { available: false, details: "WHOIS result ambiguous, assuming taken" };
    }
  } catch (err: unknown) {
    const error = err as Error;
    return { available: false, error: error.message };
  }
}

/**
 * Check a single domain's availability using both DNS and WHOIS
 */
export async function checkDomain(domain: string): Promise<DomainCheckResult> {
  const { name, tld } = parseDomain(domain);
  const fullDomain = `${name}.${tld}`;

  // Run both checks in parallel
  const [dnsResult, whoisResult] = await Promise.all([
    checkDns(fullDomain),
    checkWhois(fullDomain),
  ]);

  // Determine availability based on combined results
  let available: boolean;
  let confidence: "high" | "medium" | "low";
  let method: "dns" | "whois" | "both";
  let details: string | undefined;

  if (dnsResult.error && whoisResult.error) {
    // Both methods failed
    return {
      domain: fullDomain,
      tld,
      available: false,
      method: "both",
      confidence: "low",
      details: "Both DNS and WHOIS checks failed",
      error: `DNS: ${dnsResult.error}, WHOIS: ${whoisResult.error}`,
    };
  }

  if (!dnsResult.error && !whoisResult.error) {
    // Both methods succeeded
    method = "both";
    if (!dnsResult.exists && whoisResult.available) {
      available = true;
      confidence = "high";
      details = "No DNS records and WHOIS shows available";
    } else if (dnsResult.exists && !whoisResult.available) {
      available = false;
      confidence = "high";
      details = "DNS records exist and WHOIS shows registered";
    } else if (dnsResult.exists) {
      available = false;
      confidence = "high";
      details = "DNS records exist (domain is active)";
    } else if (!whoisResult.available) {
      available = false;
      confidence = "medium";
      details = "No DNS but WHOIS shows registered (domain may be parked)";
    } else {
      available = true;
      confidence = "medium";
      details = whoisResult.details;
    }
  } else if (dnsResult.error) {
    // Only WHOIS worked
    method = "whois";
    available = whoisResult.available;
    confidence = "medium";
    details = whoisResult.details;
  } else {
    // Only DNS worked
    method = "dns";
    available = !dnsResult.exists;
    confidence = dnsResult.exists ? "high" : "medium";
    details = dnsResult.exists
      ? "DNS records exist"
      : "No DNS records found (may still be registered but inactive)";
  }

  return {
    domain: fullDomain,
    tld,
    available,
    method,
    confidence,
    details,
  };
}

/**
 * Check domain availability across multiple TLDs
 */
export async function checkAlternativeTlds(
  domainName: string,
  tlds: string[] = POPULAR_TLDS,
  options: { concurrency?: number } = {}
): Promise<AlternativeTldResult> {
  const { concurrency = 5 } = options;
  const name = domainName.includes(".") ? parseDomain(domainName).name : domainName;

  const results: DomainCheckResult[] = [];

  // Process in batches to avoid overwhelming servers
  for (let i = 0; i < tlds.length; i += concurrency) {
    const batch = tlds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((tld) => checkDomain(`${name}.${tld}`))
    );
    results.push(...batchResults);
  }

  return {
    originalDomain: name,
    results,
  };
}

/**
 * Get suggested TLDs based on domain purpose
 */
export function getSuggestedTlds(
  purpose: "general" | "tech" | "country" | "all" = "general"
): string[] {
  switch (purpose) {
    case "tech":
      return TECH_TLDS;
    case "country":
      return COUNTRY_TLDS;
    case "all":
      return [...new Set([...POPULAR_TLDS, ...TECH_TLDS, ...COUNTRY_TLDS])];
    case "general":
    default:
      return POPULAR_TLDS;
  }
}
