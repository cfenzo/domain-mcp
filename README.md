# domain-mcp

A CLI and MCP (Model Context Protocol) server for reliably checking domain name availability. Uses both DNS and WHOIS lookups for high-confidence results.

## Features

- **Dual verification**: Combines DNS and WHOIS checks for reliable results
- **Confidence levels**: Reports high/medium/low confidence based on verification methods
- **Alternative TLD search**: Find available domains across multiple TLDs
- **Domain suggestions**: Generate variations with common prefixes/suffixes
- **MCP server**: Use with Claude and other MCP-compatible AI assistants
- **CLI tool**: Command-line interface for quick lookups

## Installation

```bash
# Install globally from GitHub
npm install -g github:cfenzo/domain-mcp

# Or use directly with npx (no install needed)
npx github:cfenzo/domain-mcp --help
```

## CLI Usage

```bash
# Check a single domain
domain-check example.com

# Check across popular TLDs
domain-check myapp --alt

# Check tech-focused TLDs (io, dev, app, ai, etc.)
domain-check startup --alt --tech

# Check specific TLDs
domain-check mybrand --tlds com,io,dev,app

# JSON output
domain-check example.com --json

# Only show available domains
domain-check myapp --alt --available-only
```

Or with npx (no installation):

```bash
npx -p github:cfenzo/domain-mcp domain-check example.com --alt
```

## Claude Code MCP Server

Add to your Claude Code configuration (`~/.claude.json`):

```json
{
  "mcpServers": {
    "domain-checker": {
      "command": "npx",
      "args": ["-y", "-p", "github:cfenzo/domain-mcp", "domain-mcp"]
    }
  }
}
```

### Available MCP Tools

- **check_domain**: Check a single domain's availability
- **check_alternative_tlds**: Check availability across multiple TLDs
- **suggest_domains**: Generate and check domain name variations
- **list_tlds**: List available TLD categories

## How It Works

1. **DNS Check**: Queries DNS for A records. If found, domain is definitely taken.
2. **WHOIS Check**: Queries WHOIS servers for registration data.
3. **Confidence Scoring**:
   - **High**: Both methods agree (DNS exists + WHOIS registered, or no DNS + WHOIS available)
   - **Medium**: Only one method provided data
   - **Low**: Errors or ambiguous results

## TLD Categories

- **General**: com, net, org, io, co, dev, app, ai, xyz, me, info, biz, tech, online, site, cloud
- **Tech**: io, dev, app, ai, tech, cloud, software, systems, digital, code
- **Country**: uk, de, fr, nl, es, it, pl, ru, jp, cn, au, ca, us, in, br
