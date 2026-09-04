/**
 * Platform Adapter Registry & Resolver
 */

import type { PlatformAdapter } from "./adapter.interface";
import { ShopifyAdapter } from "./shopify-adapter";
import { WooCommerceAdapter } from "./woocommerce-adapter";
import { MagentoAdapter } from "./magento-adapter";
import { BigCommerceAdapter } from "./bigcommerce-adapter";
import { WixAdapter } from "./wix-adapter";
import { GenericAdapter } from "./generic-adapter";
import type { PlatformType } from "../events/canonical-types";

export class AdapterRegistry {
  private adapters: PlatformAdapter[] = [];
  private fallbackAdapter: PlatformAdapter;

  constructor() {
    this.fallbackAdapter = new GenericAdapter();
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.adapters.push(
      new ShopifyAdapter(),
      new WooCommerceAdapter(),
      new MagentoAdapter(),
      new BigCommerceAdapter(),
      new WixAdapter(),
    );
  }

  public register(adapter: PlatformAdapter): void {
    this.adapters.unshift(adapter);
  }

  public getAdapterByName(name: string): PlatformAdapter | undefined {
    return this.adapters.find((a) => a.name === name);
  }

  public resolveAdapter(win?: Window, doc?: Document): PlatformAdapter {
    for (const adapter of this.adapters) {
      try {
        if (adapter.detect(win, doc)) {
          return adapter;
        }
      } catch {
        // Continue if an individual adapter's detect() throws
      }
    }
    return this.fallbackAdapter;
  }

  public getPlatformType(win?: Window, doc?: Document): PlatformType {
    const adapter = this.resolveAdapter(win, doc);
    return adapter.name;
  }
}
