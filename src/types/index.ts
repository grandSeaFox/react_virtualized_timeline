import React from "react";

export type TimelineView = "daily" | "monthly" | "quarterly";

export interface TimelineEvent {
  id: string;
  resourceId: string;
  title: string;
  start: Date;
  end: Date;
  color?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  editable?: boolean;
  draggable?: boolean;
  resizable?: boolean;
  style?: React.CSSProperties;
  [key: string]: any; // Allow for custom properties
}

export interface TimelineResource {
  id: string;
  title: string;
  [key: string]: any; // Allow for custom properties
}

export interface TimelineCell {
  resourceId: string;
  date: Date;
  events: TimelineEvent[];
}

export interface VirtualItem {
  index: number;
  isScrolling?: boolean;
  style: React.CSSProperties;
}

export interface VirtualizationConfig {
  itemCount: number;
  estimatedItemSize: number;
  overscanCount?: number;
}

export interface TimelineDimensions {
  cellWidth: number;
  cellHeight: number;
  headerHeight: number;
  resourceLabelWidth: number;
}

export interface TimelineRange {
  startDate: Date;
  endDate: Date;
  visibleStartDate: Date;
  visibleEndDate: Date;
}

export interface EventDropInfo {
  event: TimelineEvent;
  resourceId: string;
  start: Date;
  end: Date;
  originalWidth?: number;
  preserveWidth?: boolean;
}

export interface EventResizeInfo {
  event: TimelineEvent;
  start: Date;
  end: Date;
}

export interface TimelineProps {
  events: TimelineEvent[];
  resources: TimelineResource[];
  view?: TimelineView;
  initialDate?: Date;
  dimensions?: Partial<TimelineDimensions>;
  onEventClick?: (event: TimelineEvent) => void;
  onEventDrop?: (info: EventDropInfo) => void;
  onEventResize?: (info: EventResizeInfo) => void;
  onEventCreate?: (event: Omit<TimelineEvent, "id">) => void;
  onDateRangeChange?: (range: TimelineRange) => void;
  editable?: boolean;
  droppable?: boolean;
  resizable?: boolean;
  eventContent?: (event: TimelineEvent) => React.ReactNode;
  resourceContent?: (resource: TimelineResource) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dailyViewOptions?: DailyViewOptions;
}

export interface DailyViewControls {
  onNextDay: () => void;
  onPreviousDay: () => void;
  onToday: () => void;
  onGoToDate: (date: Date) => void;
}

export interface DailyViewSpecificProps extends Omit<TimelineProps, "view"> {
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  daysBefore?: number;
  daysAfter?: number;
  totalDaysRange?: number;
  showWeekends?: boolean;
  showToday?: boolean;
  showControls?: boolean;
  onControls?: (controls: DailyViewControls) => void;
}

export interface DailyViewOptions {
  daysBefore?: number;
  daysAfter?: number;
  totalDaysRange?: number;
}

export interface TimelineDragManagerOptions {
  containerSelector: string;
  listRef: any;
  headerRef: any;
  resources: any[];
  dateColumns?: Date[];
  cellWidth?: number;
  cellHeight?: number;
  onEventDrop?: (info: EventDropInfo) => void;
  setErrorMessage?: (message: string | null) => void;
  handleOpenReservationModal?: (resourceId: string, startDate: Date, endDate: Date) => void;
  editable?: boolean;
  droppable?: boolean;
}

export interface DragCreateState {
  isActive: boolean;
  resourceId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  startIndex: number | null;
  endIndex: number | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface DragState {
  isDragging: boolean;
  currentEvent: TimelineEvent | null;
  offset: Position;
  eventWidth?: number;
}

// Types for observer pattern
export type StateChangeCallback = (state: any) => void;
export type EventType = "dragCreateStateChange" | "dragStateChange" | "resourceIndexChange";
