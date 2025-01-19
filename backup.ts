"use client";

import React, {
  useRef,
  useEffect,
  useState,
  MouseEvent,
  Fragment,
} from "react";
import * as d3 from "d3";
import { renderToStaticMarkup } from "react-dom/server";
import { D3BrushEvent } from "d3-brush";
import { GraphTooltip } from "./graph-tooltip";
import { AlertType } from "@/lib/alerts/alert";
import { VisualisationType } from "@/lib/devices/device-data";
import { ViewButton } from "./view-button/view-button";
import { drawThresholds } from "./draw-thresholds";
import { useAppSelector } from "@/store/hooks";
import { selectHideParams } from "@/lib/hideParamsSlice";

type DataPoint = {
  x: number;
  y: number | null;
};

export interface DataSet {
  id: string;
  points: DataPoint[];
  name: string;
  units: string;
  parameter: string;
}

export interface TimeSeriesDataSet extends DataSet {
  color?: string;
  plotType: VisualisationType;
}

export type Threshold = {
  parameter: string;
  maximumThresholdValue: number | null;
  minimumThresholdValue: number | null;
  alertType: AlertType;
  isThresholdValueComparisonLessThan: boolean;
};

type AxisType = "time" | "displacement";

type MultiLineGraphProps = {
  unitDatasets: Map<string, TimeSeriesDataSet[]>;
  thresholds: Threshold[];
  allThresholds: Threshold[];
  height: number;
  padding: number;
  horizontalAxisType: AxisType;
  autoscaleY: boolean;
  start?: Date;
  end?: Date;
};

const graphColors = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#aec7e8",
  "#ffbb78",
  "#98df8a",
  "#ff9896",
  "#c5b0d5",
  "#c49c94",
  "#f7b6d2",
  "#c7c7c7",
  "#dbdb8d",
  "#9edae5",
];
const cursorColor = "#A1A1AA";

const MultiLineGraph: React.FC<MultiLineGraphProps> = ({
  unitDatasets,
  thresholds,
  allThresholds,
  height,
  padding,
  horizontalAxisType,
  start,
  end,
  autoscaleY,
}) => {
  const domRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(500);
  const xScaleDomain = useRef<[number | Date, number | Date] | null>();

  const marginWidth = 40;
  const baseMargin = 10;
  const marginTop = 25;
  const marginBottom = horizontalAxisType === "time" ? 75 : 30;
  const scatterPadding = 0.05;

  useEffect(() => {
    // Clear before redrawing
    d3.select(svgRef.current).selectAll("*").remove();
    d3.select(domRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .on("pointerenter pointermove", pointermoved)
      .on("pointerleave", pointerleft);

    // Handle empty graph
    if (unitDatasets.size === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .text("No data to display");
      return;
    }

    const marginLeft =
      baseMargin + marginWidth * Math.ceil(unitDatasets.size / 2);
    const marginRight =
      baseMargin + marginWidth * Math.ceil((unitDatasets.size - 1) / 2);

    const allThresholdMap: Map<string, (number | null)[]> = new Map();
    allThresholds.forEach((thres) => {
      const values = [thres.minimumThresholdValue, thres.maximumThresholdValue];
      allThresholdMap.set(`${thres.parameter}_${thres.alertType.name}`, values);
    });

    // Get an iterable of all x values to determine x axis range
    const allDatasets = Array.from(unitDatasets.values()).flat();
    const allPoints = allDatasets.flatMap((d) => d.points);
    const hasScatter = allDatasets.some((d) => d.plotType === "scatterplot");
    const numDays =
      ((end?.getTime() ?? 0) - (start?.getTime() ?? 0)) / 86400000 + 1;

    // Taken from https://github.com/d3/d3-scale/issues/150#issuecomment-561304239
    function padLinear(
      [x0, x1]: [number, number],
      padding: number,
      endPadding?: number
    ): [number, number] {
      const d1 = ((x1 - x0) * padding) / 2;
      const d2 = ((x1 - x0) * (endPadding ?? padding)) / 2;
      return [x0 - d1, x1 + d2];
    }

    const numBarCharts = allDatasets.filter(
      (d) => d.plotType === "barchart"
    ).length;

    let xScale:
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleTime<number, number, never>;
    const linearPadding = padLinear(
      start !== undefined && end !== undefined && horizontalAxisType === "time"
        ? [start!.getTime(), end!.getTime()]
        : (d3.extent(
            allDatasets.flatMap((d) => d.points),
            (d) => d.x
          ) as [number, number]),
      Math.max(
        padding,
        numBarCharts > 0 ? (numDays < 10 ? 0.2 : 0.05) : padding,
        hasScatter ? scatterPadding : padding
      )
    );
    if (horizontalAxisType === "time") {
      xScale = d3
        .scaleTime()
        .domain(xScaleDomain?.current ?? linearPadding)
        .range([marginLeft, width - marginRight]);
    } else {
      // Displacement
      xScale = d3
        .scaleLinear()
        .domain(xScaleDomain?.current ?? linearPadding)
        .range([marginLeft, width - marginRight]);
    }

    const tooltipAnchorLine = svg.append("line");
    const rulerLine = svg.append("line");
    function rotateTicks(
      axis: d3.Selection<SVGGElement, unknown, null, undefined>
    ) {
      if (horizontalAxisType === "time") {
        axis
          .selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-65)");
      }
    }

    // Generate unique mask ID to avoid collision
    const maskId = `mask-${Math.random().toString(36).substr(2, 9)}`;

    // Reference: https://stackoverflow.com/a/38059546/10993299
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", maskId)
      .style("pointer-events", "none")
      .append("rect")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom);

    const masked = svg.append("g").attr("clip-path", `url(#${maskId})`);

    const xAxis = svg
      .append("g")
      .attr("class", "x axis")
      .attr("transform", `translate(0,${height - marginBottom})`)
      .call(d3.axisBottom(xScale));
    rotateTicks(xAxis);

    // xAxis.select(".domain").attr("stroke", "none");
    xAxis.selectAll(".tick line").attr("stroke", "none");

    // Add brushing
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("end", updateChart);

    masked.append("g").attr("class", "brush").call(brush);
    // Double click to reset scaling
    svg.on("dblclick", updateChart);

    // A function that set idleTimeOut to null
    let idleTimeout: NodeJS.Timeout | null;
    function idled() {
      idleTimeout = null;
    }

    function updateChart(event: D3BrushEvent<DataPoint> | MouseEvent) {
      // Handles the double click event to reset scaling
      if (event.type === "dblclick") {
        xScaleDomain.current = null;
        xScale.domain(linearPadding);
      } else {
        const extent = (event as D3BrushEvent<DataPoint>).selection;
        if (!extent) {
          // Sets scaling cooldown
          if (!idleTimeout) return (idleTimeout = setTimeout(idled, 350)); // This allows to wait a little bit
        } else {
          // Handles selection end event
          xScaleDomain.current = [
            xScale.invert(extent[0] as number),
            xScale.invert(extent[1] as number),
          ];
          xScale.domain(xScaleDomain.current);
          brush.clear(d3.select(".brush"));
        }
      }

      // Update axis and line position
      xAxis.transition().duration(1000).call(d3.axisBottom(xScale));
      xAxis.select(".domain").attr("stroke", "none");
      xAxis.selectAll(".tick line").attr("stroke", "none");
      rotateTicks(xAxis);

      let updateUnitNum = 0;
      unitDatasets.forEach((datasets, unit) => {
        // Find the dataPoints within the x-axis brush area
        const filteredPoints = filterPoints(datasets);
        const updatedPoints =
          filteredPoints.length === 0
            ? datasets.flatMap((d) => d.points)
            : filteredPoints;
        // dataPoints within the x-axis brush area are prepared as updatedPoints
        // Update yScale with the filtered points
        const thresholdValues = thresholds
          .filter((thresh) =>
            datasets.some((d) => d.id.includes(thresh.parameter))
          )
          .flatMap((thresh) => {
            const values = [];
            if (thresh.maximumThresholdValue !== null) {
              values.push(thresh.maximumThresholdValue);
            }
            if (thresh.minimumThresholdValue !== null) {
              values.push(thresh.minimumThresholdValue);
            }
            return values;
          });
        const minThresholdValues = Math.min(...thresholdValues);
        const maxThresholdValues = Math.max(...thresholdValues);
        if (thresholdValues.length > 1)
          thresholdValues.push(
            minThresholdValues * 0.9,
            maxThresholdValues * 1.05
          );
        const yScale = d3
          .scaleLinear()
          .domain(
            padLinear(
              d3.extent(
                updatedPoints.concat([
                  ...(datasets.length > 1
                    ? [{ x: 0, y: calBuffer(datasets) }]
                    : autoscaleY
                    ? []
                    : [{ x: 0, y: 0 }]),
                  ...thresholdValues.map((v) => ({ x: 0, y: v })),
                ]),
                (d) => d.y
              ) as [number, number],
              padding,
              padding + scatterPadding
            )
          )
          .range([height - marginBottom, marginTop]);

        // Start: Update y-axis
        const sanitizedUnit = sanitizeUnit(unit);
        const isLeftAxis = updateUnitNum % 2 === 0;
        const axisNumOnSide = Math.ceil((updateUnitNum + 1) / 2);
        const axisLoc = isLeftAxis
          ? baseMargin + marginWidth * axisNumOnSide
          : width - baseMargin - marginWidth * axisNumOnSide;

        const yAxis = svg
          .select<SVGGElement>(`.y.axis-${sanitizedUnit}`)
          .attr("transform", `translate(${axisLoc},0)`)
          .call(isLeftAxis ? d3.axisLeft(yScale) : d3.axisRight(yScale));

        // yAxis.select(".domain").attr("stroke", "none");
        yAxis.selectAll(".tick line").attr("stroke", "none");
        if (datasets.length == 1) {
          yAxis.select(".domain").attr("stroke", datasets[0].color ?? d3.schemeCategory10[unitNum]);
          yAxis.selectAll(".tick text").attr("fill", datasets[0].color ?? d3.schemeCategory10[unitNum]);
        } else {
          yAxis.select(".domain").attr("stroke", "#808080");
          yAxis.selectAll(".tick text").attr("fill", "#808080");
        }
        // End: Update y-axis

        datasets.forEach((dataset) => {
          if (dataset.plotType === "linegraph") {
            const line = d3
              .line<DataPoint>()
              .x((d) => xScale(d.x))
              .y((d) => yScale(d.y ?? 0));
            // Supress the eslint warning for using explicit any,
            // otherwise, d3 cannot infer the types and the compiler will throw errors
            /* eslint-disable  @typescript-eslint/no-explicit-any */
            (
              svg
                .select(`.line-${dataset.id}`)
                .attr("clip-path", `url(#${maskId})`)
                .transition()
                .duration(1000) as any
            ).attr("d", line);
          } else if (dataset.plotType === "barchart") {
            const xDomain =
              horizontalAxisType === "time"
                ? xScale.domain().map((d) => (d as Date).getTime())
                : (xScale.domain() as [number, number]);
            /// There is an edge case when the chart is zoomed in, adding/removing the data sets and then zooms out again,
            /// it will lead to missing lines as the filter only runs when data sets change but not the zooming level changes.
            /// To get it work with the preserved zooming level, the best way is to render the entire array when data sets are added/removed.
            /// Since the default view is without zooming, this shouldn't have performance difference compared to the previous implementation.
            /// Keeping the previous filter condition but adding a always true condition to nullify it and avoiding changing too much code.
            const datapoints = dataset.points.filter(
              (p) => p.x >= xDomain[0] && p.x <= xDomain[1]
            );
            const totalBarWidth =
              ((width - marginLeft - marginRight) / (datapoints.length + 2)) *
              0.4;
            const currentBarWidth = totalBarWidth / numBarCharts;
            (
              svg
                .selectAll(`.bar-${dataset.id}`)
                .attr("clip-path", `url(#${maskId})`)
                .transition()
                .duration(1000) as any
            )
              .attr(
                "x",
                (d: { x: d3.NumberValue }) =>
                  (xScale(d.x) ?? marginLeft) - totalBarWidth / 2
              )
              .attr("y", (d: { y: any }) => yScale(d.y ?? 0))
              .attr("width", currentBarWidth);
          } else if (dataset.plotType === "scatterplot") {
            (
              svg
                .selectAll(`.scatter-${dataset.id}`)
                .attr("clip-path", `url(#${maskId})`)
                .transition()
                .duration(1000) as any
            )
              .attr(
                "cx",
                (d: { x: d3.NumberValue }) => xScale(d.x) ?? marginLeft
              )
              .attr("cy", (d: { y: any }) => yScale(d.y ?? 0));
          }
        });
        updateUnitNum++;
      });
    }

    function sanitizeUnit(unit: string): string {
      return unit.replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    function filterPoints(datasets: TimeSeriesDataSet[]): DataPoint[] {
      return datasets.flatMap((d) =>
        d.points.filter((point) => {
          const domain = xScale.domain() as [number, number];
          const xValue = point.x as number;
          return xValue >= domain[0] && xValue <= domain[1];
        })
      );
    }

    function calBuffer(datasets: TimeSeriesDataSet[]) {
      // Getting all the y values from datasets
      const yValues = datasets
        .flatMap((d) => d.points.map((p) => p.y))
        .filter((y): y is number => y !== null);

      const yMin = Math.min(...yValues);
      const yMax = Math.max(...yValues);
      const yRangeDiff = yMax - yMin;
      // create a buffer that is 5% of the range difference lower than the bottom of y-axis
      const buffer = yMin - yRangeDiff * 0.05;
      return buffer;
    }

    let unitNum = 0;
    unitDatasets.forEach((datasets, unit) => {
      const filteredPoints = filterPoints(datasets);
      const updatedPoints =
        filteredPoints.length === 0
          ? datasets.flatMap((d) => d.points)
          : filteredPoints;
      // Get the y scale for the current unit
      const thresholdValues = thresholds
        .filter((thresh) =>
          datasets.some((d) => d.id.includes(thresh.parameter))
        )
        .flatMap((thresh) => {
          const values = [];
          if (thresh.maximumThresholdValue !== null) {
            values.push(thresh.maximumThresholdValue);
          }
          if (thresh.minimumThresholdValue !== null) {
            values.push(thresh.minimumThresholdValue);
          }
          return values;
        });
      const minThresholdValues = Math.min(...thresholdValues);
      const maxThresholdValues = Math.max(...thresholdValues);
      if (thresholdValues.length > 1)
        thresholdValues.push(
          minThresholdValues * 0.9,
          maxThresholdValues * 1.05
        );
      const yScale = d3
        .scaleLinear()
        .domain(
          padLinear(
            d3.extent(
              updatedPoints.concat([
                ...(datasets.length > 1
                  ? [{ x: 0, y: calBuffer(datasets) }]
                  : autoscaleY
                  ? []
                  : [{ x: 0, y: 0 }]),
                ...thresholdValues.map((v) => ({ x: 0, y: v })),
              ]),
              (d) => d.y
            ) as [number, number],
            padding,
            padding + scatterPadding
          )
        )
        .range([height - marginBottom, marginTop]);

      const sanitizedUnit = sanitizeUnit(unit);
      const isLeftAxis = unitNum % 2 === 0;
      const axisNumOnSide = Math.ceil((unitNum + 1) / 2);
      const axisLoc = isLeftAxis
        ? baseMargin + marginWidth * axisNumOnSide
        : width - baseMargin - marginWidth * axisNumOnSide;

      const yAxis = svg
        .append("g")
        .attr("class", `y axis-${sanitizedUnit}`)
        .attr("transform", `translate(${axisLoc},0)`)
        .call(isLeftAxis ? d3.axisLeft(yScale) : d3.axisRight(yScale));
      
      // yAxis.select(".domain").attr("stroke", "none");
      yAxis.selectAll(".tick line").attr("stroke", "none");
      if (datasets.length == 1) {
        yAxis.select(".domain").attr("stroke", datasets[0].color ?? d3.schemeCategory10[unitNum]);
        yAxis.selectAll(".tick text").attr("fill", datasets[0].color ?? d3.schemeCategory10[unitNum]);
      } else {
        yAxis.select(".domain").attr("stroke", "#808080");
        yAxis.selectAll(".tick text").attr("fill", "#808080");
      }
      
      // Unit label
      svg
        .append("text")
        .attr("x", axisLoc + (isLeftAxis ? -marginWidth / 2 : marginWidth / 2))
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .text(unit);

      // Draw the lines for the current unit
      datasets.forEach((dataset) => {
        const xDomain =
          horizontalAxisType === "time"
            ? xScale.domain().map((d) => (d as Date).getTime())
            : (xScale.domain() as [number, number]);
        /// For calculating the bar width only
        const datapoints = dataset.points.filter(
          (p) => p.x >= xDomain[0] && p.x <= xDomain[1]
        );

        // Draw any thresholds associated with the parameter
        drawThresholds(
          thresholds,
          dataset,
          allThresholdMap,
          yScale,
          marginBottom,
          marginTop,
          marginLeft,
          width,
          marginRight,
          height,
          masked
        );

        if (dataset.plotType === "barchart") {
          const totalBarWidth =
            ((width - marginLeft - marginRight) / (datapoints.length + 2)) *
            0.4;
          const currentBarWidth = totalBarWidth / numBarCharts;
          masked
            .selectAll(`rect-${unitNum}`)
            .data(dataset.points)
            .enter()
            .append("rect")
            .attr("x", (d) => xScale(d.x) - totalBarWidth / 2)
            .attr("y", (d) => yScale(d.y ?? 0))
            .attr("width", currentBarWidth)
            .attr("height", (d) => height - marginBottom - yScale(d.y ?? 0))
            .attr("fill", dataset.color ?? d3.schemeCategory10[unitNum])
            .attr("fill-opacity", 0.5)
            .attr("z-index", 3)
            .attr("position", "relative")
            .attr("class", `bar-${dataset.id}`);
        }

        if (dataset.plotType === "linegraph") {
          // Split line into segments for missing data
          const lineData = [];
          let currentSegment = [];
          for (const point of dataset.points) {
            if (point.y === null) {
              if (currentSegment.length > 0) {
                lineData.push(currentSegment);
                currentSegment = [];
              }
            } else {
              currentSegment.push(point);
            }
          }
          if (currentSegment.length > 0) {
            lineData.push(currentSegment);
          }

          const line = d3
            .line<DataPoint>()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y ?? 0));

          lineData.forEach((segment) => {
            masked
              .append("path")
              .datum(segment)
              .attr("class", `line-${dataset.id}`)
              .attr("fill", "none")
              .attr("stroke", dataset.color ?? d3.schemeCategory10[unitNum])
              .attr("stroke-width", 1.5)
              .attr("d", line)
              .attr("z-index", 5)
              .attr("position", "relative");
          });
        }

        if (dataset.plotType === "scatterplot") {
          masked
            .selectAll(`circle-${unitNum}`)
            .data(dataset.points)
            .enter()
            .append("circle")
            .attr("cx", (d) => xScale(d.x) ?? marginLeft)
            .attr("cy", (d) => yScale(d.y ?? 0))
            .attr("r", 3)
            .attr("fill", dataset.color ?? d3.schemeCategory10[unitNum])
            .attr("z-index", 3)
            .attr("position", "relative")
            .attr("class", `scatter-${dataset.id}`);
        }
      });

      unitNum++;
    });

    // Create the tooltip container.
    const tooltip = d3.select(domRef.current).append("div");

    // Add the event listeners that show or hide the tooltip.
    const bisect = d3.bisector((d) => d).center;
    function pointermoved(event: PointerEvent) {
      if (unitDatasets.size === 0) {
        // No data points, nothing to do
        return;
      }

      const xLoc = xScale.invert(d3.pointer(event)[0]);
      const yLoc = d3.pointer(event)[1];
      const xDomain =
        horizontalAxisType === "time"
          ? xScale.domain().map((d) => (d as Date).getTime())
          : (xScale.domain() as [number, number]);
      const sortedXs = allPoints
        .filter((p) => p.x >= xDomain[0] && p.x <= xDomain[1])
        .map((d) => d.x)
        .sort((a, b) => a - b);
      const idx = bisect(sortedXs, xLoc);

      tooltipAnchorLine
        .attr("x1", xScale(sortedXs[idx]))
        .attr("y1", 0)
        .attr("x2", xScale(sortedXs[idx]))
        .attr("y2", height - marginTop)
        .style("stroke-width", 1)
        .style("stroke", cursorColor)
        .style("fill", "none")
        .style("display", null);

      rulerLine
        .attr("x1", baseMargin + marginWidth)
        .attr("y1", yLoc)
        .attr(
          "x2",
          width - baseMargin - (unitDatasets.size > 1 ? marginWidth : 0)
        )
        .attr("y2", yLoc)
        .style("stroke-width", 1)
        .style("stroke", cursorColor)
        .style("fill", "none")
        .style("display", null);

      tooltip
        .html(
          renderToStaticMarkup(
            <GraphTooltip datasets={allDatasets} x={sortedXs[idx]} />
          )
        )
        .style("display", null)
        .style("position", "absolute")
        .style(
          "right",
          `${document.documentElement.clientWidth - event.layerX + 5}px`
        )
        .style(
          "bottom",
          `${document.documentElement.clientHeight - event.layerY + 5}px`
        )
        .style("z-index", 9999);
    }

    function pointerleft() {
      if (unitDatasets.size === 0) {
        // No data points, nothing to do
        return;
      }

      tooltip.style("display", "none");
      tooltipAnchorLine.style("display", "none");
      rulerLine.style("display", "none");
    }
  }, [
    unitDatasets,
    width,
    height,
    marginBottom,
    marginTop,
    padding,
    horizontalAxisType,
    start,
    end,
    thresholds,
    allThresholds,
    autoscaleY,
  ]);

  useEffect(() => {
    if (svgRef.current !== null) {
      const observer = new ResizeObserver(() => {
        setWidth(svgRef.current?.clientWidth ?? 500);
      });
      observer.observe(svgRef.current);
      return () => observer.disconnect();
    }
  }, [svgRef]);

  return (
    <div className="grid">
      <svg
        ref={svgRef}
        className="w-full rounded-md border border-border col-start-1 row-start-1 pt-2"
      />
      <div
        ref={domRef}
        className="col-start-1 row-start-1 pointer-events-none"
      />
    </div>
  );
};

type TimeSeriesGraphProps = {
  datasets: TimeSeriesDataSet[];
  thresholds: Map<string, Threshold[]>;
  height: number;
  padding?: number;
  axisType: AxisType;
  start?: Date;
  end?: Date;
  deviceTypes?: string[];
  deviceIdAndName?: {
    deviceId: string;
    displayName: string;
  }[];
  selectedChartParam?: string[];
};

export const TimeSeriesGraph: React.FC<TimeSeriesGraphProps> = ({
  datasets,
  thresholds,
  height,
  padding = 0.0,
  axisType,
  start,
  end,
  deviceTypes,
  deviceIdAndName,
  selectedChartParam,
}) => {
  // Start here: It is a quick hardcoded fix to change the default parameter of the visualisation page.
  const [shownDatasets, setShownDatasets] = useState<string[]>([]);
  const hideParams = useAppSelector(selectHideParams);
  useEffect(() => {
    const datasetsIds = datasets.length > 0 ? datasets[0].id.split("&&") : [];
    const deviceIDAndDisplayName =
      datasetsIds.length > 0 ? datasetsIds[0] + "&&" + datasetsIds[1] : "";
    if ((deviceTypes ?? []).length > 1 && selectedChartParam) {
      setShownDatasets(
        datasets
          .filter((dataset) => selectedChartParam.includes(dataset.parameter))
          .map((d) => d.id)
      );
    } else if (
      datasets.some((dataset) => dataset.id.includes("waterLevelRl")) &&
      deviceTypes?.includes("vwp")
    ) {
      setShownDatasets([deviceIDAndDisplayName + "&&" + "waterLevelRl"]);
    } else if (
      datasets.some((dataset) => dataset.id.includes("waterLevel")) &&
      deviceTypes?.includes("level")
    ) {
      setShownDatasets([deviceIDAndDisplayName + "&&" + "waterLevel"]);
    } else if (
      datasets.some((dataset) => dataset.id.includes("flowRate")) &&
      (deviceTypes?.includes("flowmeter") || deviceTypes?.includes("vnotch"))
    ) {
      setShownDatasets([deviceIDAndDisplayName + "&&" + "flowRate"]);
    } else if (
      datasets.some((dataset) =>
        dataset.id.includes("electricalConductivity")
      ) &&
      deviceTypes?.includes("sonde")
    ) {
      setShownDatasets([
        deviceIDAndDisplayName + "&&" + "electricalConductivity",
      ]);
    } else if (
      datasets.some((dataset) =>
        dataset.id.includes("batteryLifePercentage")
      ) &&
      deviceTypes?.includes("datalogger")
    ) {
      setShownDatasets([
        deviceIDAndDisplayName + "&&" + "batteryLifePercentage",
      ]);
    } else if (deviceTypes?.includes("gnss")) {
      const arr: string[] = [];
      if (datasets.some((dataset) => dataset.id.includes("deltaEast"))) {
        arr.push(deviceIDAndDisplayName + "&&" + "deltaEast");
      }

      if (datasets.some((dataset) => dataset.id.includes("deltaNorth"))) {
        arr.push(deviceIDAndDisplayName + "&&" + "deltaNorth");
      }

      if (datasets.some((dataset) => dataset.id.includes("deltaUp"))) {
        arr.push(deviceIDAndDisplayName + "&&" + "deltaUp");
      }

      setShownDatasets(arr);
    } else if (deviceTypes?.includes("weather_station")) {
      const arr: string[] = [];
      if (datasets.some((dataset) => dataset.id.includes("precipitation"))) {
        arr.push(deviceIDAndDisplayName + "&&" + "precipitation");
      }

      if (datasets.some((dataset) => dataset.id.includes("temperature"))) {
        arr.push(deviceIDAndDisplayName + "&&" + "temperature");
      }

      if (
        datasets.some((dataset) => dataset.id.includes("atmosphericPressure"))
      ) {
        arr.push(deviceIDAndDisplayName + "&&" + "atmosphericPressure");
      }

      setShownDatasets(arr);
    } else if (
      datasets.some((dataset) =>
        dataset.id.includes("avgMassConcentrationPm10")
      ) &&
      deviceTypes?.includes("pm_sensor")
    ) {
      setShownDatasets([
        deviceIDAndDisplayName + "&&" + "avgMassConcentrationPm10",
      ]);
    }
  }, [datasets, deviceTypes, selectedChartParam]);

  // End here.

  const [currThresholdLines, setCurrThresholdLines] = useState<Set<string>>(
    new Set()
  );

  const updateShownDatasets = (value: string[]) => {
    const baseShownParams = value.filter((data) => !data.includes("##"));
    const reducedSets = value.filter(
      (param: string) =>
        !param.includes("##") || baseShownParams.includes(param.split("##")[0])
    );
    setShownDatasets(reducedSets);
  };

  datasets.forEach((dataset, i) => {
    if (dataset.color === undefined) {
      dataset.color = graphColors[i % graphColors.length];
    }
  });

  // Aggregate datasets by the units used
  const unitDatasetMapping: Map<string, TimeSeriesDataSet[]> = new Map();
  datasets
    .filter((dataset) => shownDatasets.includes(dataset.id))
    .filter((d) => !hideParams.includes(d.parameter))
    .forEach((dataset) => {
      const updatedDataset = {
        ...dataset,
        id: dataset.id.split("&&")[0] + "_" + dataset.id.split("&&")[2],
      };
      const existingList = unitDatasetMapping.get(updatedDataset.units);
      if (existingList === undefined) {
        unitDatasetMapping.set(updatedDataset.units, [updatedDataset]);
      } else {
        existingList.push(updatedDataset);
        unitDatasetMapping.set(updatedDataset.units, existingList);
      }
    });

  const currThresholdLinesFirstElement = currThresholdLines
    .values()
    .next().value;
  const deviceIdAndDisplayName =
    currThresholdLinesFirstElement?.split("#")[0] ?? "";
  const shownThresholds = (thresholds.get(deviceIdAndDisplayName) ?? []).filter(
    (thresh) =>
      currThresholdLines.has(
        `${deviceIdAndDisplayName}##${thresh.parameter}##${thresh.alertType.name}`
      )
  );

  return (
    <div className="flex flex-col gap-1 w-full min-w-[500px]">
      <div className="flex justify-between gap-2">
        <div className="flex justify-start items-center gap-1 flex-wrap">
          {datasets
            .filter((dataset) => shownDatasets.includes(dataset.id))
            .filter((d) => !hideParams.includes(d.parameter))
            .map((dataset) => (
              <Fragment key={`${dataset.id}-fragment`}>
                <>
                  <div
                    key={`${dataset.id}-toggle`}
                    className="flex h-8 items-center gap-1 text-sm font-semibold rounded-md px-3"
                  >
                    <div
                      className="h-[5px] w-[5px] my-auto"
                      style={{ backgroundColor: dataset.color }}
                    />
                    {(deviceIdAndName ?? []).length > 1 ? (
                      <span>{`${dataset.name}: ${dataset.parameter} (${dataset.units})`}</span>
                    ) : (
                      <span>{`${
                        (deviceIdAndName ?? [
                          { deviceId: "", displayName: "" },
                        ])[0].displayName
                      }: ${dataset.name} (${dataset.units})`}</span>
                    )}
                  </div>
                </>
              </Fragment>
            ))}
        </div>
        <ViewButton
          datasets={datasets.filter((d) => !hideParams.includes(d.parameter))}
          shownDatasets={shownDatasets}
          updateShownDatasets={updateShownDatasets}
          thresholds={thresholds}
          deviceIdAndName={
            deviceIdAndName ?? [{ deviceId: "", displayName: "" }]
          }
          currThresholdLines={currThresholdLines}
          setCurrThresholdLines={setCurrThresholdLines}
        />
      </div>
      <MultiLineGraph
        unitDatasets={unitDatasetMapping}
        thresholds={shownThresholds}
        allThresholds={thresholds.get(deviceIdAndDisplayName) ?? []}
        height={height}
        padding={padding}
        horizontalAxisType={axisType}
        autoscaleY={true}
        start={start}
        end={end}
      />
    </div>
  );
};


import { Threshold, TimeSeriesDataSet } from "./time-series";

export const nextAlertYPosition = (
  thresh: Threshold,
  warningValues: (number | null)[],
  alarmValues: (number | null)[],
  marginTopOrBottom: number,
  yScale: (value: d3.NumberValue) => number,
  index: number
) => {
  const nextYPosition =
    thresh.alertType.name === "UnusualActivity"
      ? warningValues[index]
        ? yScale(warningValues[index] as number)
        : alarmValues[index]
        ? yScale(alarmValues[index] as number)
        : marginTopOrBottom
      : thresh.alertType.name === "Warning"
      ? alarmValues[index]
        ? yScale(alarmValues[index] as number)
        : marginTopOrBottom
      : marginTopOrBottom;

  return nextYPosition;
};

// Independent function to draw a threshold band
export function drawThresholdBand(
  masked: d3.Selection<SVGGElement, unknown, null, undefined>,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
  barWidth: number,
  barSpacing: number,
  color: string,
  opacity: number
) {
  for (let x = xStart; x < xEnd; x += barWidth + barSpacing) {
    masked
      .append("rect")
      .attr("x", x)
      .attr("y", Math.min(yStart, yEnd))
      .attr("width", barWidth)
      .attr("height", Math.abs(yEnd - yStart))
      .attr("fill", color)
      .attr("fill-opacity", opacity)
      .attr("z-index", 0);
  }
}

export function drawThresholds(
  thresholds: Threshold[],
  dataset: TimeSeriesDataSet,
  allThresholdMap: Map<string, (number | null)[]>,
  yScale: (value: d3.NumberValue) => number,
  marginBottom: number,
  marginTop: number,
  marginLeft: number,
  width: number,
  marginRight: number,
  height: number,
  masked: d3.Selection<SVGGElement, unknown, null, undefined>
) {
  thresholds
    .filter((thresh) => dataset.id.includes(thresh.parameter))
    .forEach((thresh) => {
      const barWidth = 3;
      const barSpacing = 3;
      const color = thresh.alertType.statusColour;
      const opacity = 0.3;

      const warningValues =
        allThresholdMap.get(`${thresh.parameter}_Warning`) ?? [];
      const alarmValues =
        allThresholdMap.get(`${thresh.parameter}_Alarm`) ?? [];

      // Draw both min and max threshold bands
      if (thresh.maximumThresholdValue && thresh.minimumThresholdValue) {
        const maxYPosition = yScale(thresh.maximumThresholdValue);
        const nextMaxYPosition = nextAlertYPosition(
          thresh,
          warningValues,
          alarmValues,
          marginTop,
          yScale,
          1
        );

        drawThresholdBand(
          masked,
          marginLeft,
          width - marginRight,
          nextMaxYPosition ?? marginTop,
          maxYPosition,
          barWidth,
          barSpacing,
          color,
          opacity
        );

        const minYPosition = yScale(thresh.minimumThresholdValue);
        const nextMinYPosition = nextAlertYPosition(
          thresh,
          warningValues,
          alarmValues,
          marginBottom,
          yScale,
          0
        );

        const minBandEnd =
          nextMinYPosition === marginBottom
            ? height - (nextMinYPosition ?? marginBottom)
            : nextMinYPosition ?? marginBottom;

        drawThresholdBand(
          masked,
          marginLeft,
          width - marginRight,
          minYPosition,
          minBandEnd,
          barWidth,
          barSpacing,
          color,
          opacity
        );
      } else if (thresh.maximumThresholdValue) {
        // Draw max threshold band only
        const yPosition = yScale(thresh.maximumThresholdValue);
        const nextYPosition = nextAlertYPosition(
          thresh,
          warningValues,
          alarmValues,
          marginTop,
          yScale,
          1
        );

        drawThresholdBand(
          masked,
          marginLeft,
          width - marginRight,
          nextYPosition ?? marginTop,
          yPosition,
          barWidth,
          barSpacing,
          color,
          opacity
        );
      } else if (thresh.minimumThresholdValue) {
        // Draw min threshold band only
        const yPosition = yScale(thresh.minimumThresholdValue);
        const nextYPosition = nextAlertYPosition(
          thresh,
          warningValues,
          alarmValues,
          marginBottom,
          yScale,
          0
        );

        const minBandEnd =
          nextYPosition === marginBottom
            ? height - (nextYPosition ?? marginBottom)
            : nextYPosition ?? marginBottom;

        drawThresholdBand(
          masked,
          marginLeft,
          width - marginRight,
          yPosition,
          minBandEnd,
          barWidth,
          barSpacing,
          color,
          opacity
        );
      }
    });
}
