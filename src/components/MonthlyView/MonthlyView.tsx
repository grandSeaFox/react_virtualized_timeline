import React from "react";
import { VirtualizedTimeline } from "../VirtualizedTimeline";
import { TimelineProps } from "@/types";

const MonthlyView: React.FC<Omit<TimelineProps, "view">> = (props) => {
  return <VirtualizedTimeline {...props} view="monthly" />;
};

export default MonthlyView;
