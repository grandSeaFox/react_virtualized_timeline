import React from "react";
import { VirtualizedTimeline } from "../VirtualizedTimeline";
import { TimelineProps } from "@/types";

// QuarterlyView is essentially a wrapper around VirtualizedTimeline
// that sets the view to 'quarterly'
const QuarterlyView: React.FC<Omit<TimelineProps, "view">> = (props) => {
  return <VirtualizedTimeline {...props} view="quarterly" />;
};

export default QuarterlyView;
