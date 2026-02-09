import { promisify } from "util";
import dns from "dns";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const whois = require("whois");
const lookupAsync = promisify(whois.lookup);
const dnsResolve = promisify(dns.resolve);
// Configuration
const WHOIS_TIMEOUT_MS = 10000; // 10 second timeout for WHOIS
const DNS_TIMEOUT_MS = 5000; // 5 second timeout for DNS
const BATCH_DELAY_MS = 1500; // 1.5 second delay between batches
const DEFAULT_CONCURRENCY = 3; // Lower concurrency to avoid rate limits
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
 * Wrap a promise with a timeout
 */
function withTimeout(promise, ms, errorMsg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
    ]);
}
/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Parse domain into name and TLD parts
 */
export function parseDomain(domain) {
    const parts = domain.toLowerCase().trim().split(".");
    if (parts.length < 2) {
        throw new Error(`Invalid domain format: ${domain}. Expected format: name.tld`);
    }
    const tld = parts.pop();
    const name = parts.join(".");
    return { name, tld };
}
/**
 * Check if domain has DNS records (indicates it's taken)
 */
async function checkDns(domain) {
    try {
        await withTimeout(dnsResolve(domain, "A"), DNS_TIMEOUT_MS, "DNS lookup timed out");
        return { exists: true };
    }
    catch (err) {
        const error = err;
        if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
            return { exists: false };
        }
        if (error.message === "DNS lookup timed out") {
            return { exists: false, error: "timeout" };
        }
        // Other errors might mean the domain exists but has issues
        return { exists: false, error: error.message };
    }
}
/**
 * Check domain availability via WHOIS
 */
async function checkWhois(domain) {
    try {
        const result = await withTimeout(lookupAsync(domain), WHOIS_TIMEOUT_MS, "WHOIS lookup timed out");
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
        }
        else if (isTaken) {
            return { available: false, details: "WHOIS shows domain is registered" };
        }
        else {
            // Ambiguous result
            return { available: false, details: "WHOIS result ambiguous, assuming taken" };
        }
    }
    catch (err) {
        const error = err;
        return { available: false, error: error.message };
    }
}
/**
 * Check a single domain's availability using both DNS and WHOIS
 */
export async function checkDomain(domain) {
    const { name, tld } = parseDomain(domain);
    const fullDomain = `${name}.${tld}`;
    // Run both checks in parallel
    const [dnsResult, whoisResult] = await Promise.all([
        checkDns(fullDomain),
        checkWhois(fullDomain),
    ]);
    // Determine availability based on combined results
    let available;
    let confidence;
    let method;
    let details;
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
        }
        else if (dnsResult.exists && !whoisResult.available) {
            available = false;
            confidence = "high";
            details = "DNS records exist and WHOIS shows registered";
        }
        else if (dnsResult.exists) {
            available = false;
            confidence = "high";
            details = "DNS records exist (domain is active)";
        }
        else if (!whoisResult.available) {
            available = false;
            confidence = "medium";
            details = "No DNS but WHOIS shows registered (domain may be parked)";
        }
        else {
            available = true;
            confidence = "medium";
            details = whoisResult.details;
        }
    }
    else if (dnsResult.error) {
        // Only WHOIS worked
        method = "whois";
        available = whoisResult.available;
        confidence = "medium";
        details = whoisResult.details;
    }
    else {
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
export async function checkAlternativeTlds(domainName, tlds = POPULAR_TLDS, options = {}) {
    const { concurrency = DEFAULT_CONCURRENCY, batchDelay = BATCH_DELAY_MS } = options;
    const name = domainName.includes(".") ? parseDomain(domainName).name : domainName;
    const results = [];
    // Process in batches to avoid overwhelming servers
    for (let i = 0; i < tlds.length; i += concurrency) {
        const batch = tlds.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((tld) => checkDomain(`${name}.${tld}`)));
        results.push(...batchResults);
        // Add delay between batches (except after the last batch)
        if (i + concurrency < tlds.length) {
            await sleep(batchDelay);
        }
    }
    return {
        originalDomain: name,
        results,
    };
}
/**
 * Get suggested TLDs based on domain purpose
 */
export function getSuggestedTlds(purpose = "general") {
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
