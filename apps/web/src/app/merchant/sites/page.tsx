"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Store,
  Code2,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@cartwright/ui/lib/utils";
import { useMerchantContext } from "@/components/merchant/use-merchant-context";
import { KPICard } from "@/components/dashboard/kpi-card";
import { Button } from "@cartwright/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@cartwright/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cartwright/ui/components/table";
import { trpc } from "@/utils/trpc";

export interface StorePlatform {
  id: string;
  name: string;
  shortName: string;
  badgeClass: string;
  description: string;
}

export const SUPPORTED_PLATFORMS: StorePlatform[] = [
  {
    id: "normal",
    name: "Custom HTML / Web",
    shortName: "Normal / Web",
    badgeClass: "border-border bg-muted/60 text-muted-foreground",
    description: "Standard static HTML or generic server-rendered site",
  },
  {
    id: "shopify",
    name: "Shopify",
    shortName: "Shopify",
    badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    description: "Shopify Liquid storefronts & Online Store 2.0",
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    shortName: "WooCommerce",
    badgeClass: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    description: "WordPress ecommerce stores & WC cart hooks",
  },
  {
    id: "magento",
    name: "Magento",
    shortName: "Magento",
    badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    description: "Adobe Commerce & Magento 2 price-box architecture",
  },
  {
    id: "bigcommerce",
    name: "BigCommerce",
    shortName: "BigCommerce",
    badgeClass: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    description: "Stencil themes & BigCommerce cart REST/DOM integrations",
  },
  {
    id: "wix",
    name: "Wix Stores",
    shortName: "Wix Stores",
    badgeClass: "border-pink-500/20 bg-pink-500/10 text-pink-400",
    description: "Wix eCommerce sites & wixStores components",
  },
  {
    id: "custom_spa",
    name: "React / Next.js SPA",
    shortName: "React / Next.js",
    badgeClass: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
    description: "Headless SPAs with client navigation & hydration",
  },
  {
    id: "other",
    name: "Other Platform",
    shortName: "Other",
    badgeClass: "border-purple-500/20 bg-purple-500/10 text-purple-400",
    description: "Custom architecture using standard data-cartwright markup",
  },
];

export default function MerchantSitesPage() {
  const queryClient = useQueryClient();
  const {
    accountQuery,
    activeMerchantId,
    activeSiteId,
    selectedSiteId,
    setSelectedSiteId,
    siteIds,
  } = useMerchantContext();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreType, setNewStoreType] = useState("normal");

  const [storefrontMeta, setStorefrontMeta] = useState<Record<string, { name: string; type: string }>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("cartwright_storefront_meta");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Mutation: Create Site
  const createSiteMutation = useMutation({
    ...trpc.merchantIntelligence.createSite.mutationOptions(),
    onSuccess: (data) => {
      toast.success("New storefront site created successfully!");
      queryClient.invalidateQueries(trpc.merchantIntelligence.getAccount.queryFilter());
      const newestSite = data.siteIds[data.siteIds.length - 1];
      if (newestSite) {
        setSelectedSiteId(newestSite);
        const updatedMeta = {
          ...storefrontMeta,
          [newestSite]: {
            name: newStoreName.trim() || `Storefront #${data.siteIds.length}`,
            type: newStoreType,
          },
        };
        setStorefrontMeta(updatedMeta);
        try {
          localStorage.setItem("cartwright_storefront_meta", JSON.stringify(updatedMeta));
        } catch {}
      }
      setIsDialogOpen(false);
      setNewStoreName("");
      setNewStoreType("normal");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create storefront site");
    },
  });

  const handleRegisterSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    createSiteMutation.mutate();
  };

  // Mutation: Set Primary Site
  const setPrimarySiteMutation = useMutation({
    ...trpc.merchantIntelligence.setPrimarySite.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Primary storefront updated to ${data.primarySiteId}`);
      queryClient.invalidateQueries(trpc.merchantIntelligence.getAccount.queryFilter());
    },
    onError: (err) => {
      toast.error(err.message || "Failed to set primary site");
    },
  });

  // Mutation: Remove Site
  const removeSiteMutation = useMutation({
    ...trpc.merchantIntelligence.removeSite.mutationOptions(),
    onSuccess: (data) => {
      toast.success("Storefront site removed");
      queryClient.invalidateQueries(trpc.merchantIntelligence.getAccount.queryFilter());
      if (selectedSiteId === data.primarySiteId || !data.siteIds.includes(selectedSiteId)) {
        setSelectedSiteId(data.primarySiteId);
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to remove site");
    },
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const primarySiteId = accountQuery.data?.primarySiteId ?? "";

  return (
    <div className="w-full text-foreground px-6 sm:px-8 pt-10 sm:pt-12 pb-24">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* KPI Overview Grid */}
        <div className="w-full">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <KPICard
              label="Merchant Account ID"
              icon={<Store className="h-3.5 w-3.5 text-muted-foreground" />}
              value={
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <span className="text-base sm:text-lg lg:text-xl font-mono font-bold text-foreground tracking-tight break-all">
                    {activeMerchantId || "Loading..."}
                  </span>
                  {activeMerchantId && (
                    <button
                      type="button"
                      onClick={() => handleCopy(activeMerchantId, "mch_id")}
                      className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground shrink-0"
                    >
                      {copiedKey === "mch_id" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              }
              subtext="Permanent Organization Scope"
              className="border-b sm:border-b-0 sm:border-r border-border/60"
            />

            <KPICard
              label="Primary Storefront ID"
              icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
              value={
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <span className="text-base sm:text-lg lg:text-xl font-mono font-bold text-foreground tracking-tight break-all">
                    {primarySiteId || "Loading..."}
                  </span>
                  {primarySiteId && (
                    <button
                      type="button"
                      onClick={() => handleCopy(primarySiteId, "primary_site")}
                      className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground shrink-0"
                    >
                      {copiedKey === "primary_site" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              }
              subtext="Default Telemetry Target"
              className="border-b sm:border-b-0 sm:border-r border-border/60"
            />

            <KPICard
              label="Total Storefronts"
              icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}
              value={siteIds.length}
              subtext={siteIds.length === 1 ? "1 active storefront" : `${siteIds.length} active storefronts`}
            />
          </div>
        </div>

        {/* Registered Storefronts Section Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          {/* Left: Title & Subtitle */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Registered Storefronts
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sites bound to your merchant account. Telemetry emitted with these site IDs will populate your intelligence dashboard.
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Register New Storefront</span>
            </Button>
          </div>
        </div>

        {/* Table View Card */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table className="text-left text-xs">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-transparent">
                <TableHead className="px-4 py-3.5 font-mono w-12">#</TableHead>
                <TableHead className="px-4 py-3.5">Storefront Name</TableHead>
                <TableHead className="px-4 py-3.5">Site ID</TableHead>
                <TableHead className="px-4 py-3.5">Store Platform</TableHead>
                <TableHead className="px-4 py-3.5">Role</TableHead>
                <TableHead className="px-4 py-3.5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {siteIds.map((sId, idx) => {
                const isPrimary = sId === primarySiteId;
                const meta = storefrontMeta[sId];
                const storeType = meta?.type || "normal";
                const storeName = meta?.name || (isPrimary ? "Primary Storefront" : `Storefront #${idx + 1}`);

                return (
                  <TableRow
                    key={sId}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="px-4 py-3.5 font-mono text-muted-foreground">
                      {idx + 1}
                    </TableCell>

                    <TableCell className="px-4 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{storeName}</span>
                      </div>
                    </TableCell>

                    <TableCell className="px-4 py-3.5">
                      <div className="inline-flex items-center gap-1.5 font-mono text-foreground font-semibold bg-muted/50 px-2 py-1 rounded-md border border-border text-xs">
                        <span>{sId}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => handleCopy(sId, `site_${sId}`)}
                        >
                          {copiedKey === `site_${sId}` ? (
                            <Check className="h-2.5 w-2.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-2.5 w-2.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="px-4 py-3.5">
                      {(() => {
                        const platform = SUPPORTED_PLATFORMS.find(
                          (p) => p.id === storeType
                        ) || {
                          name: storeType,
                          badgeClass:
                            "border-border bg-muted/60 text-muted-foreground",
                        };
                        return (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-medium",
                              platform.badgeClass
                            )}
                          >
                            {platform.name}
                          </span>
                        );
                      })()}
                    </TableCell>

                    <TableCell className="px-4 py-3.5">
                      {isPrimary ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          Primary
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Secondary
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7.5 px-3 text-xs border-border text-foreground hover:bg-accent cursor-pointer rounded-full"
                          onClick={() => {
                            const platformAttr = storeType !== "normal" ? ` data-platform="${storeType}"` : "";
                            const snippet = `<script defer src="https://cdn.cartwright.com/tracker/v1.js" data-site="${sId}"${platformAttr}${activeMerchantId ? ` data-merchant="${activeMerchantId}"` : ""}></script>`;
                            handleCopy(snippet, `snippet_${sId}`);
                          }}
                        >
                          {copiedKey === `snippet_${sId}` ? (
                            <>
                              <Check className="mr-1 h-3 w-3 text-emerald-500" />
                              <span className="text-emerald-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Code2 className="mr-1 h-3 w-3" />
                              <span>Copy Script Tag</span>
                            </>
                          )}
                        </Button>

                        {!isPrimary && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setPrimarySiteMutation.isPending}
                            className="h-7.5 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-pointer"
                            onClick={() =>
                              setPrimarySiteMutation.mutate({ siteId: sId })
                            }
                          >
                            Set Primary
                          </Button>
                        )}

                        {!isPrimary && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={removeSiteMutation.isPending}
                            className="h-7.5 w-7.5 text-muted-foreground hover:text-rose-400 hover:bg-accent/60 rounded-md cursor-pointer"
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to remove storefront ${sId}?`
                                )
                              ) {
                                removeSiteMutation.mutate({ siteId: sId });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Register Storefront Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg" showCloseButton={true}>
            <DialogTitle className="text-base font-bold text-foreground tracking-tight font-sans">
              Register New Storefront
            </DialogTitle>
            <p className="text-xs text-muted-foreground -mt-2">
              Add a new storefront to generate its dedicated tracker site ID and script.
            </p>

            <form onSubmit={handleRegisterSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Storefront Name
                </label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="e.g. Acme Flagship Store"
                  className="h-10 w-full rounded-lg border border-border bg-muted/60 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Store Platform
                  </label>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                    {SUPPORTED_PLATFORMS.find((p) => p.id === newStoreType)?.description}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SUPPORTED_PLATFORMS.map((option) => {
                    const isSelected = newStoreType === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setNewStoreType(option.id)}
                        className={cn(
                          "flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition-all cursor-pointer text-center",
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground font-semibold ring-1 ring-primary/30"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        )}
                      >
                        <span className="truncate w-full font-medium">{option.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDialogOpen(false)}
                  className="h-8 px-3 text-xs border-border text-foreground hover:bg-accent cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createSiteMutation.isPending}
                  className="h-8 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer disabled:opacity-50"
                >
                  {createSiteMutation.isPending ? (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  <span>Register Storefront</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
