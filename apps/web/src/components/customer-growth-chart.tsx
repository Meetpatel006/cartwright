"use client";

import { useMemo } from "react";
import { barY, defineChart, stack } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand, scaleLinear } from "d3-scale";
import { TrendingUp, UserPlus, UserMinus } from "lucide-react";

export type CustomerGrowthDatum = {
  day: string;
  series: "New Signups" | "Churned";
  count: number;
};

const DEFAULT_GROWTH_DATA: CustomerGrowthDatum[] = [
  { day: "Aug 16", series: "New Signups", count: 82 },
  { day: "Aug 16", series: "Churned", count: 12 },
  { day: "Aug 18", series: "New Signups", count: 95 },
  { day: "Aug 18", series: "Churned", count: 14 },
  { day: "Aug 20", series: "New Signups", count: 110 },
  { day: "Aug 20", series: "Churned", count: 16 },
  { day: "Aug 22", series: "New Signups", count: 124 },
  { day: "Aug 22", series: "Churned", count: 15 },
  { day: "Aug 24", series: "New Signups", count: 142 },
  { day: "Aug 24", series: "Churned", count: 19 },
  { day: "Aug 26", series: "New Signups", count: 168 },
  { day: "Aug 26", series: "Churned", count: 21 },
  { day: "Aug 28", series: "New Signups", count: 185 },
  { day: "Aug 28", series: "Churned", count: 24 },
  { day: "Aug 31", series: "New Signups", count: 214 },
  { day: "Aug 31", series: "Churned", count: 28 },
];

const chartRenderer = motion();

export function CustomerGrowthChart({
  data,
  totalNew = 1240,
  totalChurn = 184,
  title = "Customer Growth",
  description = "View new customer signups and churn over time",
}: {
  data?: CustomerGrowthDatum[];
  totalNew?: number;
  totalChurn?: number;
  title?: string;
  description?: string;
}) {
  const chartData = useMemo(() => {
    if (data && data.length > 0) return data;
    return DEFAULT_GROWTH_DATA;
  }, [data]);

  const daysList = useMemo(() => {
    return Array.from(new Set(chartData.map((d) => d.day)));
  }, [chartData]);

  const computedTotalNew = useMemo(() => {
    if (totalNew > 0) return totalNew;
    return chartData.filter((d) => d.series === "New Signups").reduce((acc, d) => acc + d.count, 0);
  }, [chartData, totalNew]);

  const computedTotalChurn = useMemo(() => {
    if (totalChurn > 0) return totalChurn;
    return chartData.filter((d) => d.series === "Churned").reduce((acc, d) => acc + d.count, 0);
  }, [chartData, totalChurn]);

  const netGrowth = computedTotalNew - computedTotalChurn;

  // Max day sum for Y-axis scaling
  const maxDaySum = useMemo(() => {
    const dayTotals: Record<string, number> = {};
    chartData.forEach((d) => {
      dayTotals[d.day] = (dayTotals[d.day] || 0) + d.count;
    });
    const maxVal = Math.max(...Object.values(dayTotals), 20);
    return Math.ceil(maxVal * 1.2);
  }, [chartData]);

  const definition = useMemo(() => {
    return defineChart({
      marks: [
        barY(chartData, {
          key: (d: any) => `${d.day}:${d.series}`,
          x: (d: any) => d.day,
          y: (d: any) => d.count,
          z: (d: any) => d.series,
          color: (d: any) => (d.series === "New Signups" ? "#10b981" : "#f43f5e"),
          fill: (d: any) => (d.series === "New Signups" ? "#10b981" : "#f43f5e"),
          layout: stack({ order: ["New Signups", "Churned"] }),
          radius: 4,
          fillOpacity: 0.9,
        }),
      ],
      scales: {
        x: {
          scale: scaleBand<string>().domain(daysList).paddingInner(0.18).paddingOuter(0.08),
          grid: false,
          axis: {
            line: false,
            ticks: {
              size: 0,
              padding: 8,
              format: (val: string) => val.slice(0, 6),
            },
          },
        },
        y: {
          scale: scaleLinear().domain([0, maxDaySum]).nice(),
          grid: true,
          axis: {
            line: false,
            ticks: {
              size: 0,
              padding: 8,
              format: (val: number) => String(val),
            },
          },
        },
      },
      color: {
        domain: ["New Signups", "Churned"],
        range: ["#10b981", "#f43f5e"],
      },
      focus: "group-x",
      tooltip: {
        use: tooltip,
        anchor: "group-center",
        placement: "auto",
        className: "font-sans rounded-lg bg-popover border border-border p-2.5 text-xs shadow-xl text-popover-foreground backdrop-blur-md",
        content: (points: any[]) => {
          if (!points || !points.length) return { rows: [] };
          const dayLabel = String(points[0].xValue ?? "");
          return {
            title: `${dayLabel} Customer Activity`,
            rows: points.map((p) => {
              const datum = p.datum as CustomerGrowthDatum | undefined;
              const isSignup = datum?.series === "New Signups";
              return {
                label: isSignup ? "New Signups" : "Churned Customers",
                value: isSignup ? `+${p.yValue} users` : `-${p.yValue} users`,
                color: isSignup ? "#10b981" : "#f43f5e",
              };
            }),
          };
        },
      },
      motion: {
        transition: { type: "spring", stiffness: 150, damping: 20 },
      },
    } as any);
  }, [chartData, daysList, maxDaySum]);

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground p-5 flex flex-col justify-between">
      <div>
        {/* Header with Title and Dual Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>

          <div className="flex items-center gap-4 text-xs pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground font-medium">
                New Signups ({computedTotalNew.toLocaleString()})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-muted-foreground font-medium">
                Churn ({computedTotalChurn.toLocaleString()})
              </span>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-[350px] w-full pt-3 pb-1">
          <Chart
            renderer={chartRenderer}
            definition={definition as any}
            height={350}
            ariaLabel="Customer Growth Signups and Churn Chart"
          />
        </div>
      </div>
    </div>
  );
}

export default CustomerGrowthChart;
