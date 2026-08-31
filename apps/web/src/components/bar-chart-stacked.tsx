"use client";

import { useMemo } from "react";
import { barY, defineChart, stack } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand, scaleLinear } from "d3-scale";

export type OrderSeriesDatum = {
  day: string;
  series: "Human" | "AI Agent";
  orders: number;
};

const DEFAULT_SERIES_DATA: OrderSeriesDatum[] = [
  { day: "Aug 16", series: "Human", orders: 0 },
  { day: "Aug 16", series: "AI Agent", orders: 0 },
  { day: "Aug 18", series: "Human", orders: 0 },
  { day: "Aug 18", series: "AI Agent", orders: 0 },
  { day: "Aug 20", series: "Human", orders: 0 },
  { day: "Aug 20", series: "AI Agent", orders: 0 },
  { day: "Aug 22", series: "Human", orders: 0 },
  { day: "Aug 22", series: "AI Agent", orders: 0 },
  { day: "Aug 24", series: "Human", orders: 0 },
  { day: "Aug 24", series: "AI Agent", orders: 0 },
  { day: "Aug 26", series: "Human", orders: 0 },
  { day: "Aug 26", series: "AI Agent", orders: 0 },
  { day: "Aug 28", series: "Human", orders: 0 },
  { day: "Aug 28", series: "AI Agent", orders: 0 },
  { day: "Aug 31", series: "Human", orders: 0 },
  { day: "Aug 31", series: "AI Agent", orders: 0 },
];

const chartRenderer = motion();

export function BarChartStacked({
  data = DEFAULT_SERIES_DATA,
  totalOrders = 0,
  agentOrders = 0,
  humanOrders = 0,
  title = "Channel Distribution",
  description = "15-day volume comparison between human shoppers and AI agents",
}: {
  data?: OrderSeriesDatum[];
  totalOrders?: number;
  agentOrders?: number;
  humanOrders?: number;
  title?: string;
  description?: string;
}) {
  const chartData = data && data.length > 0 ? data : DEFAULT_SERIES_DATA;
  const daysList = Array.from(new Set(chartData.map((d) => d.day)));

  const computedTotal = totalOrders > 0 ? totalOrders : chartData.reduce((acc, d) => acc + d.orders, 0);
  const computedAgent = agentOrders > 0 ? agentOrders : chartData.filter((d) => d.series === "AI Agent").reduce((acc, d) => acc + d.orders, 0);
  const computedHuman = humanOrders > 0 ? humanOrders : Math.max(0, computedTotal - computedAgent);

  const humanPct = computedTotal > 0 ? ((computedHuman / computedTotal) * 100).toFixed(1) : "0";
  const agentPct = computedTotal > 0 ? ((computedAgent / computedTotal) * 100).toFixed(1) : "0";

  // Calculate dynamic max day volume for Y axis scale
  const maxDaySum = useMemo(() => {
    const dayTotals: Record<string, number> = {};
    chartData.forEach((d) => {
      dayTotals[d.day] = (dayTotals[d.day] || 0) + d.orders;
    });
    const maxVal = Math.max(...Object.values(dayTotals), 5);
    return Math.ceil(maxVal * 1.25);
  }, [chartData]);

  const definition = useMemo(() => {
    return defineChart({
      marks: [
        barY(chartData, {
          key: (d: any) => `${d.day}:${d.series}`,
          x: (d: any) => d.day,
          y: (d: any) => d.orders,
          z: (d: any) => d.series,
          color: (d: any) => (d.series === "Human" ? "#3b82f6" : "#a855f7"),
          fill: (d: any) => (d.series === "Human" ? "#3b82f6" : "#a855f7"),
          layout: stack({ order: ["Human", "AI Agent"] }),
          radius: 4,
          fillOpacity: 0.9,
        }),
      ],
      scales: {
        x: {
          scale: scaleBand<string>().domain(daysList).paddingInner(0.15).paddingOuter(0.08),
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
            },
          },
        },
      },
      color: {
        domain: ["Human", "AI Agent"],
        range: ["#3b82f6", "#a855f7"],
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
            title: dayLabel,
            rows: points.map((p) => {
              const datum = p.datum as OrderSeriesDatum | undefined;
              const seriesName = datum?.series;
              const isHuman = seriesName === "Human";
              return {
                label: isHuman ? "Human Shoppers" : "AI Autonomous Agents",
                value: `${p.yValue} orders`,
                color: isHuman ? "#3b82f6" : "#a855f7",
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
        {/* Header with Dual-Series Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Human ({humanPct}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">AI Agent ({agentPct}%)</span>
            </div>
          </div>
        </div>

        {/* Chart Content */}
        <div className="h-[230px] w-full pt-2 pb-1">
          <Chart
            renderer={chartRenderer}
            definition={definition as any}
            height={230}
            ariaLabel="15-Day Stacked Orders Chart"
          />
        </div>
      </div>
    </div>
  );
}

export default BarChartStacked;
