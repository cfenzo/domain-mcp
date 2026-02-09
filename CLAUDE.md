# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode for development
npm run cli        # Run CLI (after build)
npm run start      # Run MCP server (after build)
```

## Testing

```bash
# Test CLI with a domain
node dist/cli.js example.com

# Test alternative TLDs
node dist/cli.js myapp --alt --tlds com,io,dev

# Test MCP server (expects JSON-RPC on stdin)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

## Architecture

- `src/domain-checker.ts` - Core domain checking logic using DNS and WHOIS
- `src/cli.ts` - Command-line interface
- `src/index.ts` - MCP server implementation
- `src/types/whois.d.ts` - Type declarations for whois package (no @types available)

The domain checker uses dual verification (DNS + WHOIS) and reports confidence levels based on which methods succeeded and whether they agree.

## MCP Tools

The server exposes four tools:
1. `check_domain` - Single domain check
2. `check_alternative_tlds` - Check across multiple TLDs
3. `suggest_domains` - Generate variations and check availability
4. `list_tlds` - List TLD categories

## ESM Notes

This is an ESM package. The whois package is CommonJS, so it's imported via `createRequire`.
