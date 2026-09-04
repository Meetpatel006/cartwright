"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

export function useMerchantContext() {
  const accountQuery = useQuery({
    ...trpc.merchantIntelligence.getAccount.queryOptions(),
  });
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const primarySiteId = accountQuery.data?.primarySiteId ?? "";
  const siteIds = accountQuery.data?.siteIds?.length
    ? accountQuery.data.siteIds
    : primarySiteId
      ? [primarySiteId]
      : [];

  useEffect(() => {
    if (primarySiteId && !selectedSiteId) {
      setSelectedSiteId(primarySiteId);
    }
  }, [primarySiteId, selectedSiteId]);

  return {
    accountQuery,
    activeMerchantId: accountQuery.data?.merchantId ?? "",
    activeSiteId: selectedSiteId || primarySiteId || siteIds[0] || "",
    selectedSiteId,
    setSelectedSiteId,
    siteIds,
  };
}

