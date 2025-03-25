import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { VariableSizeList as List } from "react-window";
import { addDays, format, isSameDay, isToday, differenceInDays } from "date-fns";
import { TimelineProps, TimelineDimensions, TimelineRange, DailyViewOptions } from "@/types";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { getDateColumns } from "@/utils/dateUtils";
import ReservationModal from "../ReservationModal";
import { TimelineDragManager } from "./TimelineDragManager";

// Default dimensions for the timeline
const DEFAULT_DIMENSIONS: TimelineDimensions = {
  cellWidth: 120,
  cellHeight: 60,
  headerHeight: 50,
  resourceLabelWidth: 200,
};

// Default options for daily view
const DEFAULT_DAILY_OPTIONS: DailyViewOptions = {
  daysBefore: 7,
  daysAfter: 7,
  totalDaysRange: 30,
};

const VirtualizedTimeline: React.FC<TimelineProps> = ({
  events,
  resources,
  view = "daily",
  initialDate = new Date(),
  dimensions: dimensionsProps,
  onEventClick,
  onEventDrop,
  onEventResize,
  onEventCreate,
  onDateRangeChange,
  editable = true,
  droppable = true,
  resizable = true,
  eventContent,
  resourceContent,
  className,
  style,
  dailyViewOptions,
}) => {
  const isMounted = useRef(true);

  // Merge default dimensions with provided dimensions
  const dimensions: TimelineDimensions = useMemo(
    () => ({
      ...DEFAULT_DIMENSIONS,
      ...dimensionsProps,
    }),
    [dimensionsProps],
  );

  // Merge default daily view options with provided options
  const dailyOptions: DailyViewOptions = useMemo(
    () => ({
      ...DEFAULT_DAILY_OPTIONS,
      ...dailyViewOptions,
    }),
    [dailyViewOptions],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Refs for scrolling
  const listRef = useRef<List>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const headerContentRef = useRef<HTMLDivElement>(null);

  // Reference to the drag manager
  const dragManagerRef = useRef<TimelineDragManager | null>(null);

  // Use the enhanced hooks to manage timeline events and state
  const {
    eventMap,
    resourceEventMap,
    getEventsForResource,
    calculateEventPosition,
    calculateDateRange,
    handleEventClick,
    handleEventCreate,
    getResourceName,
    newReservationModal,
    handleOpenReservationModal,
    handleCloseModal,
    errorMessage,
    setErrorMessage,
  } = useTimelineEvents({
    events,
    resources,
    view,
    initialDate,
    dailyOptions,
    onEventClick,
    onEventCreate,
  });

  const initialDateRange = useMemo(
    () => calculateDateRange(initialDate, view),
    [calculateDateRange, initialDate, view],
  );

  const [dateRange, setDateRange] = useState<TimelineRange>(initialDateRange);

  // Get all date columns based on the date range
  const dateColumns = useMemo(
    () => getDateColumns(dateRange.startDate, dateRange.endDate, view),
    [dateRange.startDate, dateRange.endDate, view],
  );

  // State for drag operations (minimized since we'll use the manager)
  const [dragCreateState, setDragCreateState] = useState<{
    isActive: boolean;
    resourceId: string | null;
    startIndex: number | null;
    endIndex: number | null;
  }>({
    isActive: false,
    resourceId: null,
    startIndex: null,
    endIndex: null,
  });

  const [currentResourceIndex, setCurrentResourceIndex] = useState<number | null>(null);

  // Initialize and clean up the drag manager
  useEffect(() => {
    if (timelineContentRef.current && listRef.current && headerContentRef.current) {
      // Create the manager
      dragManagerRef.current = new TimelineDragManager({
        containerSelector: ".timeline-body-container",
        listRef: listRef.current,
        headerRef: headerContentRef.current,
        resources,
        dateColumns,
        cellWidth: dimensions.cellWidth,
        cellHeight: dimensions.cellHeight,
        onEventDrop,
        setErrorMessage,
        handleOpenReservationModal,
        editable,
        droppable,
      });

      // Initialize it
      dragManagerRef.current.initialize();

      // Subscribe to state changes
      const unsubscribeDragCreate = dragManagerRef.current.subscribe("dragCreateStateChange", (newState) => {
        if (isMounted.current) {
          setDragCreateState({
            isActive: newState.isActive,
            resourceId: newState.resourceId,
            startIndex: newState.startIndex,
            endIndex: newState.endIndex,
          });
        }
      });

      const unsubscribeResourceIndex = dragManagerRef.current.subscribe("resourceIndexChange", (newIndex) => {
        if (isMounted.current) {
          setCurrentResourceIndex(newIndex);

          if (newIndex !== null && listRef.current) {
            listRef.current.scrollToItem(newIndex, "smart");
          }
        }
      });

      // Clean up on unmount
      return () => {
        unsubscribeDragCreate();
        unsubscribeResourceIndex();
        if (dragManagerRef.current) {
          dragManagerRef.current.destroy();
          dragManagerRef.current = null;
        }
      };
    }
  }, []);

  // Update drag manager when key data changes
  useEffect(() => {
    if (dragManagerRef.current) {
      dragManagerRef.current.update({
        resources,
        dateColumns,
        eventMap,
      });
    }
  }, [resources, dateColumns, eventMap]);

  // Wrapper methods that delegate to the manager
  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, resourceId: string, date: Date, dateIndex: number, isOccupied: boolean) => {
      dragManagerRef.current?.handleCellMouseDown(e, resourceId, date, dateIndex, isOccupied);
    },
    [dragManagerRef.current],
  );

  const handleEventDragStart = useCallback(
    (e: React.DragEvent, event: any) => {
      dragManagerRef.current?.handleEventDragStart(e, event);
    },
    [dragManagerRef.current],
  );

  const handleEventDragOver = useCallback(
    (e: React.DragEvent) => {
      dragManagerRef.current?.handleEventDragOver(e);
    },
    [dragManagerRef.current],
  );

  const handleEventDragLeave = useCallback(
    (e: React.DragEvent) => {
      dragManagerRef.current?.handleEventDragLeave(e);
    },
    [dragManagerRef.current],
  );

  const handleEventDragEnd = useCallback(() => {
    dragManagerRef.current?.handleEventDragEnd();
  }, [dragManagerRef.current]);

  const handleEventDrop = useCallback(
    (resourceId: string, date: Date, event: any, e?: React.DragEvent) => {
      dragManagerRef.current?.handleEventDrop(resourceId, date, event, e);
    },
    [dragManagerRef.current],
  );

  const isDragCell = useCallback(
    (resourceId: string, dateIndex: number) => {
      return dragManagerRef.current?.isDragCell(resourceId, dateIndex) || false;
    },
    [dragManagerRef.current],
  );

  const renderDragCreatePreview = useCallback(() => {
    return dragManagerRef.current?.renderDragCreatePreview() || null;
  }, [dragManagerRef.current]);

  // Memoize window dimensions
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 800,
    height: typeof window !== "undefined" ? window.innerHeight : 600,
  });

  // Update window dimensions on resize - just once
  useEffect(() => {
    const handleResize = () => {
      if (isMounted.current) {
        setWindowDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }
  }, []);

  // Recalculate date range when view changes
  const prevViewRef = useRef(view);
  const prevInitialDateRef = useRef(initialDate);

  useEffect(() => {
    // Only update if view or initialDate actually changed
    if (prevViewRef.current !== view || prevInitialDateRef.current.getTime() !== initialDate.getTime()) {
      if (isMounted.current) {
        setDateRange(calculateDateRange(initialDate, view));
        prevViewRef.current = view;
        prevInitialDateRef.current = initialDate;
      }
    }
  }, [view, initialDate, calculateDateRange]);

  // Scroll to center the current day on initial load in daily view
  useEffect(() => {
    if (view === "daily" && timelineContentRef.current && headerContentRef.current) {
      // Calculate position to scroll to (current day minus days before)
      const scrollPosition = (dailyOptions.daysBefore || 7) * dimensions.cellWidth;
      timelineContentRef.current.scrollLeft = scrollPosition;
      headerContentRef.current.scrollLeft = scrollPosition;
    }
  }, [view, dimensions.cellWidth, dailyOptions.daysBefore]);

  // Notify parent of date range changes - but don't create a loop
  const dateRangeStringified = useMemo(() => JSON.stringify(dateRange), [dateRange]);

  useEffect(() => {
    if (isMounted.current && onDateRangeChange) {
      onDateRangeChange(dateRange);
    }
  }, [dateRangeStringified, onDateRangeChange]);

  // Synchronize horizontal scrolling between header and content
  useEffect(() => {
    const handleContentScroll = () => {
      if (timelineContentRef.current && headerContentRef.current) {
        headerContentRef.current.scrollLeft = timelineContentRef.current.scrollLeft;
      }
    };

    if (timelineContentRef.current) {
      timelineContentRef.current.addEventListener("scroll", handleContentScroll);

      return () => {
        timelineContentRef.current?.removeEventListener("scroll", handleContentScroll);
      };
    }
  }, []);

  // Calculate total content width
  const totalWidth = useMemo(
    () => dateColumns.length * dimensions.cellWidth,
    [dimensions.cellWidth, dateColumns.length],
  );

  // Format date for header based on view
  const formatHeaderDate = useCallback(
    (date: Date) => {
      if (view === "monthly") {
        return `${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
      } else if (view === "quarterly") {
        return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
      } else if (view === "daily") {
        return format(date, "EEE, MMM d");
      }
      return date.toLocaleDateString();
    },
    [view],
  );

  // Row renderer for virtualized list - optimized to minimize re-renders
  const rowRenderer = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const resource = resources[index];

      // Get cached events and occupied dates for this resource
      const resourceData = resourceEventMap.get(resource.id) || {
        events: [],
        occupiedDates: new Set<string>(),
      };

      const dragState = dragManagerRef.current?.getState().dragState || { isDragging: false };
      const isCurrentDragRow = currentResourceIndex === index && dragState.isDragging;

      // Process multi-day events for rendering - memoized per row
      const processedEvents = useMemo(() => {
        return resourceData.events
          .map((event) => {
            const { isVisible, isStart, isEnd, startIndex, width } = calculateEventPosition(event, dateColumns);

            if (!isVisible) return null;

            // Calculate position values in pixels for absolute positioning
            const left = startIndex * dimensions.cellWidth;
            const widthPx = width * dimensions.cellWidth;

            // Determine if this is a multi-day event (duration > 1 day)
            const isMultiDay = differenceInDays(new Date(event.end), new Date(event.start)) > 1;

            return {
              event,
              isStart,
              isEnd,
              left,
              width: widthPx,
              isMultiDay,
            };
          })
          .filter(Boolean);
      }, [calculateEventPosition, dateColumns, dimensions.cellWidth]);

      return (
        <div
          style={{
            ...style,
            display: "flex",
            height: dimensions.cellHeight,
            borderBottom: "1px solid #e0e0e0",
            backgroundColor: isCurrentDragRow ? "rgba(55, 136, 216, 0.05)" : undefined,
            transition: "background-color 0.2s ease",
          }}
          className={`virtualized-table-row ${isCurrentDragRow ? "drag-highlight-row" : ""}`}
          data-resource-id={resource.id}
          data-row-index={index}
        >
          <div
            className="resource-cell"
            style={{
              width: dimensions.resourceLabelWidth,
              minWidth: dimensions.resourceLabelWidth,
              maxWidth: dimensions.resourceLabelWidth,
              backgroundColor: "#f8f9fa",
              borderRight: "1px solid #e0e0e0",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              fontWeight: "bold",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              height: "100%",
              boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
            }}
          >
            {resourceContent ? resourceContent(resource) : resource.title}
          </div>

          {/* Scrollable date cells container */}
          <div
            style={{
              display: "flex",
              width: totalWidth,
              position: "relative",
            }}
            className="date-cells-container"
          >
            {/* Render date cells */}
            {dateColumns.map((date, dateIndex) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const isOccupied = resourceData.occupiedDates.has(dateStr);
              const isCurrentDay = view === "daily" && isSameDay(date, initialDate);
              const isTodayDate = view === "daily" && isToday(date);
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              // Check if this cell is part of active drag-to-create
              const isDragCreateCell = isDragCell(resource.id, dateIndex);

              return (
                <div
                  key={`${resource.id}-${dateStr}`}
                  data-index={dateIndex}
                  data-date={dateStr}
                  style={{
                    width: dimensions.cellWidth,
                    minWidth: dimensions.cellWidth,
                    maxWidth: dimensions.cellWidth,
                    height: "100%",
                    padding: 4,
                    borderRight: "1px solid #e0e0e0",
                    backgroundColor: isDragCreateCell
                      ? "rgba(55, 136, 216, 0.1)"
                      : isCurrentDay
                        ? "#f0f9ff"
                        : isTodayDate
                          ? "#fffef0"
                          : isWeekend
                            ? "#f9f9f9"
                            : "#ffffff",
                    overflow: "hidden",
                    position: "relative",
                    cursor: isOccupied && droppable ? "not-allowed" : "pointer",
                    transition: "background-color 0.2s ease",
                  }}
                  className={`date-cell ${isOccupied ? "occupied" : ""} ${isDragCreateCell ? "drag-over" : ""}`}
                  onMouseDown={(e) => handleCellMouseDown(e, resource.id, date, dateIndex, isOccupied)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent event bubbling

                    if (!isOccupied || e.dataTransfer.types.includes("text/plain")) {
                      handleEventDragOver(e);
                    } else {
                      e.currentTarget.classList.add("drag-not-allowed");
                    }
                  }}
                  onDragLeave={(e) => {
                    handleEventDragLeave(e);
                    e.currentTarget.classList.remove("drag-not-allowed");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent event bubbling

                    const eventId = e.dataTransfer.getData("text/plain");
                    e.currentTarget.classList.remove("drag-not-allowed");
                    e.currentTarget.classList.remove("drag-over");

                    if (eventId && editable) {
                      const droppedEvent = eventMap.get(eventId);
                      if (droppedEvent) {
                        const duration = differenceInDays(new Date(droppedEvent.end), new Date(droppedEvent.start));
                        const dropStart = date;
                        const dropEnd = addDays(date, duration);

                        const existingEvents = getEventsForResource(resource.id).filter(
                          (e) => e.id !== droppedEvent.id,
                        );

                        const hasConflict = existingEvents.some((e) => {
                          const eStart = new Date(e.start);
                          const eEnd = new Date(e.end);
                          return (
                            dropStart < eEnd && dropEnd > eStart // overlap logic
                          );
                        });

                        if (hasConflict) {
                          setErrorMessage("This time slot is already occupied");
                          return;
                        }

                        // Call the event drop handler
                        handleEventDrop(resource.id, date, droppedEvent, e);
                      }
                    }
                  }}
                  onClick={() => {
                    if (dragCreateState.isActive || dragManagerRef.current?.isCurrentlyDropping()) return;

                    if (droppable && !isOccupied) {
                      handleOpenReservationModal(resource.id, date, addDays(date, 1));
                    } else if (isOccupied) {
                      setErrorMessage("Cannot create reservation: time slot already occupied");
                    }
                  }}
                />
              );
            })}

            {/* Render multi-day events as overlays using absolute positioning */}
            {processedEvents.map((item) => {
              if (!item) return null;
              const { event, isStart, isEnd, left, width, isMultiDay } = item;

              const style: React.CSSProperties = {
                backgroundColor: event.backgroundColor || "#3788d8",
                color: event.textColor || "#fff",
                borderRadius: "6.5px",
                padding: "8px 10px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                transition: "transform 0.1s ease, box-shadow 0.1s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "start",
                top: 4,
                position: "absolute",
                width: `${width}px`,
                height: "32px",
                left: `${left}px`,
                zIndex: 3,
              };

              return (
                <div
                  key={`event-${event.id}`}
                  className="timeline-event"
                  data-event-id={event.id}
                  data-multi-day={isMultiDay}
                  data-is-start={isStart}
                  data-is-end={isEnd}
                  data-resource-id={event.resourceId}
                  draggable={editable && event.draggable !== false}
                  style={style}
                  onDragStart={(e) => handleEventDragStart(e, { ...event, style })}
                  onDragEnd={handleEventDragEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEventClick) {
                      handleEventClick(event);
                    }
                  }}
                >
                  <div style={{ pointerEvents: "none", width: "100%" }}>
                    {eventContent ? eventContent(event) : `${!event.draggable ? "🔒" : ""} ${event.title}`}
                  </div>
                </div>
              );
            })}

            {/* Render drag-to-create preview if active for this resource */}
            {dragCreateState.isActive && dragCreateState.resourceId === resource.id && renderDragCreatePreview()}
          </div>
        </div>
      );
    },
    [
      resources,
      resourceEventMap,
      dateColumns,
      totalWidth,
      eventContent,
      resourceContent,
      view,
      editable,
      droppable,
      eventMap,
      calculateEventPosition,
      initialDate,
      handleCellMouseDown,
      handleEventDragOver,
      handleEventDragLeave,
      handleEventDragStart,
      handleEventDragEnd,
      getEventsForResource,
      setErrorMessage,
      handleEventClick,
      handleOpenReservationModal,
      isDragCell,
      renderDragCreatePreview,
      dimensions.cellWidth,
      dimensions.cellHeight,
      dimensions.resourceLabelWidth,
      dragCreateState.isActive,
      onEventClick,
      dragCreateState.resourceId,
      handleEventDrop,
    ],
  );

  // Use React.memo for static components to prevent unnecessary re-renders
  const TimelineHeader = useMemo(
    () => (
      <div
        className="timeline-header"
        style={{
          display: "flex",
          height: dimensions.headerHeight,
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#f5f5f5",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
          zIndex: 20,
        }}
      >
        {/* Fixed resources label header */}
        <div
          className="resource-header-cell"
          style={{
            width: dimensions.resourceLabelWidth,
            minWidth: dimensions.resourceLabelWidth,
            maxWidth: dimensions.resourceLabelWidth,
            padding: "8px 12px",
            fontWeight: "bold",
            borderRight: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            backgroundColor: "#f5f5f5",
            boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
          }}
        >
          Resources ({resources.length})
        </div>

        {/* Scrollable date headers */}
        <div
          ref={headerContentRef}
          style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "hidden",
            display: "flex",
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE and Edge
          }}
          className="timeline-header-content"
        >
          {dateColumns.map((date) => {
            // Special styling for daily view
            const isCurrentDay = view === "daily" && isSameDay(date, initialDate);
            const isTodayDate = view === "daily" && isToday(date);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return (
              <div
                key={date.toISOString()}
                style={{
                  width: dimensions.cellWidth,
                  minWidth: dimensions.cellWidth,
                  maxWidth: dimensions.cellWidth,
                  height: "100%",
                  borderRight: "1px solid #e0e0e0",
                  padding: "8px 4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  backgroundColor: isCurrentDay
                    ? "#e6f7ff"
                    : isTodayDate
                      ? "#fffbe6"
                      : isWeekend && view === "daily"
                        ? "#f8f8f8"
                        : "#f5f5f5",
                }}
                className="date-header-cell"
              >
                {view === "daily" ? (
                  <div style={{ display: "flex", justifyContent: "center", gap: 2, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "1rem",
                        fontWeight: isCurrentDay || isTodayDate ? "bold" : "normal",
                        color: isCurrentDay ? "#0066cc" : isTodayDate ? "#faad14" : "#666",
                      }}
                    >
                      {format(date, "d")}
                    </span>
                    <span
                      style={{
                        fontSize: "1rem",
                        fontWeight: isCurrentDay || isTodayDate ? "bold" : "normal",
                        color: isCurrentDay ? "#0066cc" : isTodayDate ? "#faad14" : "#666",
                      }}
                    >
                      {format(date, "EEE")}
                    </span>
                  </div>
                ) : (
                  formatHeaderDate(date)
                )}
              </div>
            );
          })}
        </div>
      </div>
    ),
    [
      dateColumns,
      dimensions.headerHeight,
      dimensions.resourceLabelWidth,
      dimensions.cellWidth,
      formatHeaderDate,
      initialDate,
      resources.length,
      view,
    ],
  );

  return (
    <div
      className={`virtualized-timeline ${view}-view ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Error message notification */}
      {errorMessage && (
        <div
          className="timeline-error-notification"
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#ff4d4f",
            color: "white",
            padding: "8px 16px",
            borderRadius: "4px",
            zIndex: 1000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Reservation Modal - Now using Portal */}
      <ReservationModal
        isOpen={newReservationModal.isOpen}
        resourceId={newReservationModal.resourceId}
        resourceName={getResourceName(newReservationModal.resourceId)}
        startDate={newReservationModal.startDate}
        endDate={newReservationModal.endDate}
        onClose={handleCloseModal}
        onCreateReservation={handleEventCreate}
      />

      {/* Header area with fixed resources label and scrollable date headers */}
      {TimelineHeader}

      {/* Main content area with virtualized list and fixed resources column */}
      <div
        ref={timelineContentRef}
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          position: "relative",
        }}
        className="timeline-body-container"
      >
        <div style={{ height: "100%", width: dimensions.resourceLabelWidth + totalWidth }}>
          <List
            ref={listRef}
            height={windowDimensions.height - dimensions.headerHeight}
            width={dimensions.resourceLabelWidth + totalWidth}
            itemCount={resources.length}
            itemSize={() => dimensions.cellHeight}
            overscanCount={40}
            className="timeline-virtualized-rows"
            style={{ overflow: "auto" }}
          >
            {rowRenderer}
          </List>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VirtualizedTimeline);
