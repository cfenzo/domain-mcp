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
export declare const POPULAR_TLDS: string[];
export declare const COUNTRY_TLDS: string[];
export declare const TECH_TLDS: string[];
/**
 * Parse domain into name and TLD parts
 */
export declare function parseDomain(domain: string): {
    name: string;
    tld: string;
};
/**
 * Check a single domain's availability using both DNS and WHOIS
 */
export declare function checkDomain(domain: string): Promise<DomainCheckResult>;
/**
 * Check domain availability across multiple TLDs
 */
export declare function checkAlternativeTlds(domainName: string, tlds?: string[], options?: {
    concurrency?: number;
}): Promise<AlternativeTldResult>;
/**
 * Get suggested TLDs based on domain purpose
 */
export declare function getSuggestedTlds(purpose?: "general" | "tech" | "country" | "all"): string[];
