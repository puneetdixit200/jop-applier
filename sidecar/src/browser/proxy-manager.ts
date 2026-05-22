export type BrowserProxy = {
  server: string;
  username?: string;
  password?: string;
};

export class ProxyManager {
  private readonly proxies: BrowserProxy[];
  private nextIndex = 0;

  constructor(proxies: BrowserProxy[] = []) {
    this.proxies = proxies.filter(isValidProxy);
  }

  firstProxy(): BrowserProxy | undefined {
    return this.proxies[0];
  }

  nextProxy(): BrowserProxy | undefined {
    if (this.proxies.length === 0) {
      return undefined;
    }

    const proxy = this.proxies[this.nextIndex % this.proxies.length];
    this.nextIndex += 1;
    return proxy;
  }

  count(): number {
    return this.proxies.length;
  }
}

function isValidProxy(proxy: BrowserProxy): boolean {
  return typeof proxy.server === "string" && proxy.server.trim().length > 0;
}
