import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfDay,
  endOfDay,
  format,
  isSameDay,
  addDays,
  isBefore,
  isWithinInterval,
  addMonths,
} from "date-fns";
import { TimelineEvent, TimelineView, TimelineRange, DailyViewOptions } from "@/types";

interface TimelineEventsOptions {
  events: TimelineEvent[];
  resources: Array<{ id: string; title: string }>;
  view: TimelineView;
  initialDate: Date;
  dailyOptions: DailyViewOptions;
  onEventClick?: (event: TimelineEvent) => void;
  onEventCreate?: (event: Omit<TimelineEvent, "id">) => void;
}

export function useTimelineEvents({
  events,
  resources,
  dailyOptions,
  onEventClick,
  onEventCreate,
}: TimelineEventsOptions) {
  const isMounted = useRef(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New reservation modal state
  const [newReservationModal, setNewReservationModal] = useState<{
    isOpen: boolean;
    resourceId: string | null;
    startDate: Date | null;
    endDate: Date | null;
  }>({
    isOpen: false,
    resourceId: null,
    startDate: null,
    endDate: null,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Clear error message after a timeout
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        if (isMounted.current) {
          setErrorMessage(null);
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Calculate the date range based on the view
  const calculateDateRange = useCallback(
    (date: Date, viewType: string): TimelineRange => {
      let startDate, endDate;

      if (viewType === "monthly") {
        // For monthly view, show 3 months before and 8 months after
        startDate = startOfMonth(addMonths(date, -3));
        endDate = endOfMonth(addMonths(date, 8));
      } else if (viewType === "quarterly") {
        // For quarterly view, show 1 quarter before and 3 quarters after
        startDate = startOfQuarter(addMonths(date, -3));
        endDate = endOfQuarter(addMonths(date, 9));
      } else if (viewType === "daily") {
        // For daily view, show daysBefore days before and daysAfter days after
        const { daysBefore = 7, totalDaysRange = 30 } = dailyOptions;
        startDate = startOfDay(addDays(date, -daysBefore));

        // Allow scrolling up to totalDaysRange days ahead
        const maxEndDate = addDays(date, totalDaysRange);
        endDate = endOfDay(maxEndDate);
      } else {
        // Default to monthly if view not recognized
        startDate = startOfMonth(addMonths(date, -3));
        endDate = endOfMonth(addMonths(date, 8));
      }

      return {
        startDate,
        endDate,
        visibleStartDate: viewType === "daily" ? startOfDay(date) : startOfMonth(date),
        visibleEndDate: viewType === "daily" ? endOfDay(addDays(date, dailyOptions.daysAfter || 7)) : endOfMonth(date),
      };
    },
    [dailyOptions],
  );

  // Function to calculate event position and width for multi-day events
  const calculateEventPosition = useCallback(
    (
      event: TimelineEvent,
      dateColumns: Date[],
    ): {
      isVisible: boolean;
      isStart: boolean;
      isEnd: boolean;
      startIndex: number;
      endIndex: number;
      width: number;
    } => {
      if (!event.start || !event.end) {
        return { isVisible: false, isStart: false, isEnd: false, startIndex: -1, endIndex: -1, width: 0 };
      }

      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Find indices in visible dateColumns
      const startIndex = dateColumns.findIndex((date) => isSameDay(date, eventStart));
      const endIndex = dateColumns.findIndex((date) => {
        // For end date, we check the day before, since end date is exclusive
        const effectiveEndDate = addDays(eventEnd, -1);
        return isSameDay(date, effectiveEndDate);
      });

      // Check if event is visible in the current date range
      const isVisible =
        startIndex !== -1 ||
        endIndex !== -1 ||
        (startIndex === -1 &&
          endIndex === -1 &&
          dateColumns.some((date) => isWithinInterval(date, { start: eventStart, end: addDays(eventEnd, -1) })));

      if (!isVisible) {
        return { isVisible: false, isStart: false, isEnd: false, startIndex: -1, endIndex: -1, width: 0 };
      }

      // Calculate effective indices considering events that start or end outside visible range
      const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
      const effectiveEndIndex = endIndex === -1 ? dateColumns.length - 1 : endIndex;

      // Calculate width in cells
      const width = effectiveEndIndex - effectiveStartIndex + 1;

      return {
        isVisible,
        isStart: startIndex !== -1,
        isEnd: endIndex !== -1,
        startIndex: effectiveStartIndex,
        endIndex: effectiveEndIndex,
        width,
      };
    },
    [],
  );

  // Create a map for quick event lookup by ID
  const eventMap = useMemo(() => {
    const map = new Map<string, TimelineEvent>();
    events.forEach((event) => {
      if (event && event.id) {
        map.set(event.id, event);
      }
    });
    return map;
  }, [events]);

  // Create a resource-based index for faster event lookups
  const resourceEventIndex = useMemo(() => {
    const index = new Map<string, TimelineEvent[]>();

    events.forEach((event) => {
      if (event && event.resourceId) {
        const resourceEvents = index.get(event.resourceId) || [];
        resourceEvents.push(event);
        index.set(event.resourceId, resourceEvents);
      }
    });

    return index;
  }, [events]);

  // Get all events for a specific resource
  const getEventsForResource = useCallback(
    (resourceId: string): TimelineEvent[] => {
      return resourceEventIndex.get(resourceId) || [];
    },
    [resourceEventIndex],
  );

  // Memoize resource-event mappings with occupied dates
  const resourceEventMap = useMemo(() => {
    const map = new Map<
      string,
      {
        events: TimelineEvent[];
        occupiedDates: Set<string>;
      }
    >();

    resources.forEach((resource) => {
      if (!resource || !resource.id) return;

      const resourceEvents = getEventsForResource(resource.id);
      const occupiedDates = new Set<string>();

      resourceEvents.forEach((event) => {
        if (!event.start || !event.end) return;

        let currentDate = new Date(event.start);
        const eventEnd = new Date(event.end);

        while (isBefore(currentDate, eventEnd)) {
          occupiedDates.add(format(currentDate, "yyyy-MM-dd"));
          currentDate = addDays(currentDate, 1);
        }
      });

      map.set(resource.id, {
        events: resourceEvents,
        occupiedDates,
      });
    });

    return map;
  }, [resources, getEventsForResource]);

  // Filter events for a specific resource and time cell
  const getEventsForCell = useCallback(
    (resourceId: string, date: Date, viewType: TimelineView): TimelineEvent[] => {
      let start: Date;
      let end: Date;

      // Set interval based on view type
      if (viewType === "monthly") {
        start = startOfMonth(date);
        end = endOfMonth(date);
      } else if (viewType === "quarterly") {
        start = startOfQuarter(date);
        end = endOfQuarter(date);
      } else if (viewType === "daily") {
        // Handle daily view
        start = startOfDay(date);
        end = endOfDay(date);
      } else {
        // Default to monthly if view not recognized
        start = startOfMonth(date);
        end = endOfMonth(date);
      }

      // Filter events that belong to this resource and fall within the time range
      return events.filter((event) => {
        // Check if the event belongs to this resource
        if (!event || !event.resourceId || event.resourceId !== resourceId) {
          return false;
        }

        if (!event.start || !event.end) {
          return false;
        }

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Check if the event intersects with the cell's time range
        return (eventStart <= end && eventEnd >= start) || (eventStart >= start && eventStart <= end);
      });
    },
    [events],
  );

  // Get events for a specific date range
  const getEventsInDateRange = useCallback(
    (startDate: Date, endDate: Date, resourceId?: string): TimelineEvent[] => {
      return events.filter((event) => {
        // Filter by resource if provided
        if (resourceId && (!event.resourceId || event.resourceId !== resourceId)) {
          return false;
        }

        if (!event.start || !event.end) {
          return false;
        }

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Check if the event intersects with the date range
        return (eventStart <= endDate && eventEnd >= startDate) || (eventStart >= startDate && eventStart <= endDate);
      });
    },
    [events],
  );

  // Get resource name
  const getResourceName = useCallback(
    (resourceId: string | null) => {
      if (!resourceId) return "";
      const resource = resources.find((r) => r && r.id === resourceId);
      return resource && resource.title ? resource.title : "";
    },
    [resources],
  );

  // Handle event click
  const handleEventClick = useCallback(
    (event: TimelineEvent) => {
      if (isMounted.current && onEventClick && event) {
        onEventClick(event);
      }
    },
    [onEventClick],
  );

  // Handle event creation
  const handleEventCreate = useCallback(
    (newEvent: Omit<TimelineEvent, "id">) => {
      if (isMounted.current && newEvent) {
        console.log("Creating new event:", newEvent);

        // Call the parent component's event create handler
        if (onEventCreate) {
          onEventCreate(newEvent);
        }

        // Close the modal
        handleCloseModal();
      }
    },
    [onEventCreate],
  );

  // Modal handlers
  const handleOpenReservationModal = useCallback((resourceId: string, startDate: Date, endDate: Date) => {
    if (resourceId && startDate && endDate) {
      console.log("Opening reservation modal:", { resourceId, startDate, endDate });
      setNewReservationModal({
        isOpen: true,
        resourceId,
        startDate,
        endDate,
      });
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setNewReservationModal({
      isOpen: false,
      resourceId: null,
      startDate: null,
      endDate: null,
    });
  }, []);

  // Check for conflicts
  const checkTimeSlotConflict = useCallback(
    (resourceId: string, startDate: Date, endDate: Date, excludeEventId?: string): boolean => {
      if (!resourceId || !startDate || !endDate) return false;

      const existingEvents = getEventsForResource(resourceId).filter((e) => !excludeEventId || e.id !== excludeEventId);

      return existingEvents.some((e) => {
        if (!e.start || !e.end) return false;

        const eStart = new Date(e.start);
        const eEnd = new Date(e.end);
        return startDate < eEnd && endDate > eStart;
      });
    },
    [getEventsForResource],
  );

  return {
    eventMap,
    resourceEventMap,
    getEventsForResource,
    getEventsForCell,
    getEventsInDateRange,
    calculateEventPosition,
    calculateDateRange,
    handleEventClick,
    handleEventCreate,
    getResourceName,
    newReservationModal,
    handleOpenReservationModal,
    handleCloseModal,
    checkTimeSlotConflict,
    errorMessage,
    setErrorMessage,
  };
}
