declare module "whois" {
  interface WhoisOptions {
    server?: string;
    follow?: number;
    timeout?: number;
    verbose?: boolean;
    bind?: string;
    proxy?: {
      ipaddress: string;
      port: number;
      type?: number;
    };
  }

  type WhoisCallback = (err: Error | null, data: string) => void;

  function lookup(
    domain: string,
    callback: WhoisCallback
  ): void;
  function lookup(
    domain: string,
    options: WhoisOptions,
    callback: WhoisCallback
  ): void;

  export { lookup, WhoisOptions, WhoisCallback };
}
