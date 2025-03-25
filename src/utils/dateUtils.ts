import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  format,
  isSameMonth,
  isSameQuarter,
  isWithinInterval,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
  differenceInDays,
} from "date-fns";
import { TimelineEvent, TimelineView } from "@/types";

/**
 * Get the start date for a given date based on view
 */
export const getStartDate = (date: Date, view: TimelineView): Date => {
  return view === "monthly" ? startOfMonth(date) : startOfQuarter(date);
};

/**
 * Get the end date for a given date based on view
 */
export const getEndDate = (date: Date, view: TimelineView): Date => {
  return view === "monthly" ? endOfMonth(date) : endOfQuarter(date);
};

/**
 * Calculate the number of columns needed for a date range and view
 */
export const getColumnCount = (startDate: Date, endDate: Date, view: TimelineView): number => {
  if (view === "monthly") {
    return eachMonthOfInterval({ start: startDate, end: endDate }).length;
  } else {
    return eachQuarterOfInterval({ start: startDate, end: endDate }).length;
  }
};

/**
 * Get a formatted string for a date based on view
 */
export const getDateLabel = (date: Date, view: TimelineView): string => {
  if (view === "monthly") {
    return format(date, "MMMM yyyy");
  } else {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${format(date, "yyyy")}`;
  }
};

/**
 * Get all date columns for a date range based on view
 */
export const getDateColumns = (startDate: Date, endDate: Date, view: TimelineView): Date[] => {
  if (view === "monthly") {
    return eachMonthOfInterval({ start: startDate, end: endDate });
  } else if (view === "quarterly") {
    return eachQuarterOfInterval({ start: startDate, end: endDate });
  } else if (view === "daily") {
    return eachDayOfInterval({ start: startDate, end: endDate });
  }

  // Default to monthly if view not recognized
  return eachMonthOfInterval({ start: startDate, end: endDate });
};

/**
 * Check if a date is within the current view scope
 */
export const isDateInView = (date: Date, viewDate: Date, view: TimelineView): boolean => {
  if (view === "monthly") {
    return isSameMonth(date, viewDate);
  } else {
    return isSameQuarter(date, viewDate);
  }
};

/**
 * Calculate width percentage for an event within a cell based on its duration
 */
export const calculateEventWidth = (event: { start: Date; end: Date }, cellStart: Date, cellEnd: Date): number => {
  const cellDuration = cellEnd.getTime() - cellStart.getTime();

  // Calculate event start and end times within the cell
  const eventStartInCell = Math.max(event.start.getTime(), cellStart.getTime());
  const eventEndInCell = Math.min(event.end.getTime(), cellEnd.getTime());

  // Calculate event duration within the cell
  const eventDurationInCell = eventEndInCell - eventStartInCell;

  // Calculate width percentage based on duration
  return (eventDurationInCell / cellDuration) * 100;
};

/**
 * Calculate left position percentage for an event within a cell based on its start date
 */
export const calculateEventLeft = (event: { start: Date }, cellStart: Date, cellEnd: Date): number => {
  const cellDuration = cellEnd.getTime() - cellStart.getTime();

  // If event starts before cell, align to left edge
  if (event.start.getTime() <= cellStart.getTime()) {
    return 0;
  }

  // Calculate offset from cell start
  const offset = event.start.getTime() - cellStart.getTime();

  // Calculate left percentage
  return (offset / cellDuration) * 100;
};

export const eventOccursOnDate = (event: TimelineEvent, date: Date, view: TimelineView): boolean => {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  if (view === "monthly") {
    const dateMonthStart = startOfMonth(date);
    const dateMonthEnd = endOfMonth(date);

    return (
      isWithinInterval(eventStart, { start: dateMonthStart, end: dateMonthEnd }) ||
      isWithinInterval(eventEnd, { start: dateMonthStart, end: dateMonthEnd }) ||
      (eventStart <= dateMonthStart && eventEnd >= dateMonthEnd)
    );
  } else if (view === "quarterly") {
    // Quarterly logic
    const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
    const quarterStart = new Date(date.getFullYear(), quarterStartMonth, 1);
    const quarterEnd = new Date(date.getFullYear(), quarterStartMonth + 3, 0);

    return (
      isWithinInterval(eventStart, { start: quarterStart, end: quarterEnd }) ||
      isWithinInterval(eventEnd, { start: quarterStart, end: quarterEnd }) ||
      (eventStart <= quarterStart && eventEnd >= quarterEnd)
    );
  } else if (view === "daily") {
    // Daily logic - check if the event spans this day
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return (
      isWithinInterval(eventStart, { start: dayStart, end: dayEnd }) ||
      isWithinInterval(eventEnd, { start: dayStart, end: dayEnd }) ||
      (eventStart <= dayStart && eventEnd >= dayEnd)
    );
  }

  return false;
};

export const calculateEventPosition = (
  event: TimelineEvent,
  dateRange: { startDate: Date; endDate: Date },
  cellWidth: number,
): { left: number; width: number } => {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  // Calculate days from range start to event start
  const daysFromStart = Math.max(0, differenceInDays(eventStart, dateRange.startDate));

  // Calculate event duration in days (minimum 1 day)
  const durationDays = Math.max(1, differenceInDays(eventEnd, eventStart) + 1);

  // Calculate position and width
  const left = daysFromStart * cellWidth;
  const width = durationDays * cellWidth;

  return { left, width };
};

/**
 * Format date based on the view type
 */
export const formatDateForView = (date: Date, view: TimelineView): string => {
  if (view === "monthly") {
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  } else if (view === "quarterly") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  } else if (view === "daily") {
    return date.toLocaleString("default", { weekday: "short", month: "short", day: "numeric" });
  }

  return date.toLocaleDateString();
};

/**
 * Check if an event falls within the given date cell based on view type
 */
export const eventFallsInDateCell = (event: TimelineEvent, cellDate: Date, view: TimelineView): boolean => {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  let cellStart: Date;
  let cellEnd: Date;

  if (view === "monthly") {
    cellStart = startOfMonth(cellDate);
    cellEnd = endOfMonth(cellDate);
  } else if (view === "quarterly") {
    const quarterStartMonth = Math.floor(cellDate.getMonth() / 3) * 3;
    cellStart = new Date(cellDate.getFullYear(), quarterStartMonth, 1);
    cellEnd = endOfQuarter(cellDate);
  } else if (view === "daily") {
    cellStart = startOfDay(cellDate);
    cellEnd = endOfDay(cellDate);
  } else {
    // Default to monthly
    cellStart = startOfMonth(cellDate);
    cellEnd = endOfMonth(cellDate);
  }

  // Check if the event intersects with the cell
  return (
    // Event starts in this cell
    (eventStart >= cellStart && eventStart <= cellEnd) ||
    // Event ends in this cell
    (eventEnd >= cellStart && eventEnd <= cellEnd) ||
    // Event spans this entire cell
    (eventStart <= cellStart && eventEnd >= cellEnd)
  );
};

/**
 * Calculate the duration of an event in days
 */
export const getEventDurationInDays = (event: TimelineEvent): number => {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  // Add 1 to include both start and end days
  return differenceInDays(eventEnd, eventStart) + 1;
};

/**
 * Check if a date is within the given visible range
 */
export const isDateInVisibleRange = (date: Date, visibleStartDate: Date, visibleEndDate: Date): boolean => {
  return date >= visibleStartDate && date <= visibleEndDate;
};
