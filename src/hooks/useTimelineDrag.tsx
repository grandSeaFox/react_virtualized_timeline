import React, { useCallback, useState, useRef, useEffect } from "react";
import { addDays } from "date-fns";
import { VariableSizeList as List } from "react-window";
import { TimelineEvent, EventDropInfo, TimelineView } from "@/types";

interface TimelineDragOptions {
  // Shared options
  timelineContentRef: React.RefObject<HTMLDivElement>;
  headerContentRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<List>;
  view?: TimelineView;

  // Drag-to-create specific options
  dateColumns?: Date[];
  cellWidth?: number;
  droppable?: boolean;
  editable?: boolean;
  getEventsForResource?: (resourceId: string) => TimelineEvent[];
  setErrorMessage?: (message: string | null) => void;
  handleOpenReservationModal?: (resourceId: string, startDate: Date, endDate: Date) => void;

  // Drag-and-drop specific options
  onEventDrop?: (info: EventDropInfo) => void;

  // List scrolling options
  resources?: any[]; // Resources array to determine scroll boundaries
  dimensions?: { cellHeight: number }; // Cell dimensions for calculating scroll position
}

interface DragCreateState {
  isActive: boolean;
  resourceId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  startIndex: number | null;
  endIndex: number | null;
}

interface DragState {
  isDragging: boolean;
  currentEvent: TimelineEvent | null;
  offset: { x: number; y: number };
  mouseMoveHandler: ((e: MouseEvent) => void) | null;
}

interface AutoScrollState {
  active: boolean;
  verticalScrollSpeed: number;
  horizontalScrollSpeed: number;
  animationFrameId: number;
  scrollThreshold: number;
  maxScrollSpeed: number;
  currentVerticalScroll: number;
  resourcesLength: number;
  lastScrollTime: number;
}

export function useTimelineDrag({
  timelineContentRef,
  headerContentRef,
  listRef,
  dateColumns = [],
  cellWidth = 120,
  droppable = true,
  editable = true,
  getEventsForResource = () => [],
  setErrorMessage = () => {},
  handleOpenReservationModal = () => {},
  onEventDrop,
  view = "daily",
  resources = [],
  dimensions = { cellHeight: 60 },
}: TimelineDragOptions) {
  // Debug logging function
  const log = (message: string, data?: any): void => {
    console.log(`[TimelineDrag] ${message}`, data !== undefined ? data : "");
  };

  log("Initializing useTimelineDrag hook", {
    resources: resources.length,
    view,
    droppable,
    editable,
  });

  // Drag-to-create state
  const dragCreateStateRef = useRef<DragCreateState>({
    isActive: false,
    resourceId: null,
    startDate: null,
    endDate: null,
    startIndex: null,
    endIndex: null,
  });

  const [dragCreateState, setDragCreateState] = useState<DragCreateState>({
    isActive: false,
    resourceId: null,
    startDate: null,
    endDate: null,
    startIndex: null,
    endIndex: null,
  });

  // Drag-and-drop state
  const [draggedEvent, setDraggedEvent] = useState<TimelineEvent | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Drag and drop refs
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    currentEvent: null,
    offset: { x: 0, y: 0 },
    mouseMoveHandler: null,
  });

  // For tracking resource position during dragging
  const [currentResourceIndex, setCurrentResourceIndex] = useState<number | null>(null);

  // Reference to the currently active drag ghost element
  const dragGhostRef = useRef<HTMLElement | null>(null);

  // Component mount state
  const isMounted = useRef<boolean>(true);

  // Store mouse event listeners to clean them up properly
  const eventListenersRef = useRef<{
    mouseMoveHandler: ((e: MouseEvent) => void) | null;
    mouseUpHandler: ((e: MouseEvent) => void) | null;
  }>({
    mouseMoveHandler: null,
    mouseUpHandler: null,
  });

  // Auto-scroll parameters - unified for both dragging modes
  const autoScrollRef = useRef<AutoScrollState>({
    active: false,
    verticalScrollSpeed: 0,
    horizontalScrollSpeed: 0,
    animationFrameId: 0,
    scrollThreshold: 60, // pixels from edge to trigger auto-scroll
    maxScrollSpeed: 30, // Increased for faster scrolling
    currentVerticalScroll: 0, // Track current list scroll offset
    resourcesLength: resources.length, // Total number of resources
    lastScrollTime: 0, // For throttling
  });

  // Update resources length when it changes
  useEffect(() => {
    autoScrollRef.current.resourcesLength = resources.length;
    log("Updated resources length", resources.length);
  }, [resources.length]);

  // Get current scroll position safely
  const getCurrentScrollOffset = useCallback((): number => {
    if (!listRef?.current) return 0;

    // Type-safe access to list instance
    const list = listRef.current;

    // Access state in a type-safe way, assuming it has a scrollOffset property
    // Using optional chaining and type guard
    if ("state" in list && typeof list.state === "object" && list.state !== null) {
      const state = list.state as { scrollOffset?: number };
      const offset = typeof state.scrollOffset === "number" ? state.scrollOffset : 0;
      log("Current scroll offset", offset);
      return offset;
    }

    log("Failed to get scroll offset, returning 0");
    return 0;
  }, [listRef?.current]);
  // Stop auto-scroll animation
  const stopAutoScroll = useCallback((): void => {
    if (!autoScrollRef.current.active) {
      log("Auto-scroll already inactive, skipping stop");
      return;
    }

    log("Stopping auto-scroll", {
      verticalSpeed: autoScrollRef.current.verticalScrollSpeed,
      horizontalSpeed: autoScrollRef.current.horizontalScrollSpeed,
      frameId: autoScrollRef.current.animationFrameId,
    });

    autoScrollRef.current.active = false;
    autoScrollRef.current.verticalScrollSpeed = 0;
    autoScrollRef.current.horizontalScrollSpeed = 0;

    if (autoScrollRef.current.animationFrameId) {
      cancelAnimationFrame(autoScrollRef.current.animationFrameId);
      autoScrollRef.current.animationFrameId = 0;
    }
  }, []);

  // Start auto-scroll animation with enhanced list scrolling
  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current.active) {
      log("Auto-scroll already active, skipping start");
      return;
    }

    log("Starting auto-scroll");
    autoScrollRef.current.active = true;
    autoScrollRef.current.lastScrollTime = Date.now();

    const performAutoScroll = (): void => {
      if (!autoScrollRef.current.active) {
        log("Auto-scroll no longer active, stopping animation");
        return;
      }

      // Only continue scrolling if we're actually dragging an event
      if (!dragStateRef.current.isDragging) {
        log("No longer dragging, stopping auto-scroll");
        stopAutoScroll();
        return;
      }

      // Throttle scrolling for smoother performance
      const now = Date.now();
      if (now - autoScrollRef.current.lastScrollTime < 16) {
        // Cap at ~60fps
        autoScrollRef.current.animationFrameId = requestAnimationFrame(performAutoScroll);
        return;
      }
      autoScrollRef.current.lastScrollTime = now;

      // Apply scrolling if we have valid refs
      if (timelineContentRef?.current) {
        // Handle horizontal scrolling
        if (autoScrollRef.current.horizontalScrollSpeed !== 0) {
          const prevScrollLeft = timelineContentRef.current.scrollLeft;
          timelineContentRef.current.scrollLeft += autoScrollRef.current.horizontalScrollSpeed;

          log("Horizontal scroll", {
            speed: autoScrollRef.current.horizontalScrollSpeed,
            prevScrollLeft,
            newScrollLeft: timelineContentRef.current.scrollLeft,
          });

          // Sync header scroll
          if (headerContentRef?.current) {
            headerContentRef.current.scrollLeft = timelineContentRef.current.scrollLeft;
          }
        }

        // Handle vertical scrolling for react-window list
        if (autoScrollRef.current.verticalScrollSpeed !== 0 && listRef?.current) {
          // Calculate new scroll position based on speed
          const prevVerticalScroll = autoScrollRef.current.currentVerticalScroll;
          autoScrollRef.current.currentVerticalScroll += autoScrollRef.current.verticalScrollSpeed;

          // Apply scroll with boundaries check
          const maxScroll = dimensions.cellHeight * autoScrollRef.current.resourcesLength;
          const newScroll = Math.max(0, Math.min(autoScrollRef.current.currentVerticalScroll, maxScroll));

          log("Vertical scroll", {
            speed: autoScrollRef.current.verticalScrollSpeed,
            prevPosition: prevVerticalScroll,
            newPosition: newScroll,
            maxScroll,
          });

          // Use react-window's scrollTo method for virtualized scrolling
          listRef.current.scrollTo(newScroll);

          // Update the drag ghost position if it exists
          if (dragGhostRef.current && dragStateRef.current.currentEvent) {
            const ghostY = parseFloat(dragGhostRef.current.style.top || "0");
            dragGhostRef.current.style.top = `${ghostY + autoScrollRef.current.verticalScrollSpeed}px`;
            log("Updated ghost position during scroll", {
              ghostY,
              newY: ghostY + autoScrollRef.current.verticalScrollSpeed,
            });
          }
        }
      }

      autoScrollRef.current.animationFrameId = requestAnimationFrame(performAutoScroll);
    };

    autoScrollRef.current.animationFrameId = requestAnimationFrame(performAutoScroll);
  }, [dimensions.cellHeight, stopAutoScroll, timelineContentRef?.current, headerContentRef?.current, listRef?.current]);

  // Clean up any active listeners
  const cleanupListeners = useCallback((): void => {
    log("Cleaning up event listeners");

    if (eventListenersRef.current.mouseMoveHandler) {
      document.removeEventListener("mousemove", eventListenersRef.current.mouseMoveHandler);
      eventListenersRef.current.mouseMoveHandler = null;
      log("Removed mousemove listener");
    }

    if (eventListenersRef.current.mouseUpHandler) {
      document.removeEventListener("mouseup", eventListenersRef.current.mouseUpHandler);
      eventListenersRef.current.mouseUpHandler = null;
      log("Removed mouseup listener");
    }

    // Stop auto-scrolling
    stopAutoScroll();

    // Clean up drag ghost
    if (dragGhostRef.current) {
      log("Removing drag ghost element");
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  }, [stopAutoScroll]);

  // Enhanced function to find the resource index based on mouse position
  const findResourceIndexFromPosition = useCallback(
    (mouseY: number): number | null => {
      if (!timelineContentRef?.current) return null;

      const containerRect = timelineContentRef.current.getBoundingClientRect();
      const yRelativeToTop = mouseY - containerRect.top;

      log("Finding resource index from position", {
        mouseY,
        containerTop: containerRect.top,
        yRelativeToTop,
      });

      // Find all row elements
      const rowElements = timelineContentRef.current.querySelectorAll(".virtualized-table-row");
      log("Found row elements", rowElements.length);

      // If we're above all rows, return the first index
      if (yRelativeToTop <= 0) {
        log("Mouse is above all rows, returning first index (0)");
        return 0;
      }

      // Find the row the mouse is over
      for (let i = 0; i < rowElements.length; i++) {
        const row = rowElements[i] as HTMLElement;
        const rowRect = row.getBoundingClientRect();

        // Check if mouse is within this row's bounds
        if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
          // For virtualized lists, get the index relative to visible rows
          const visibleIndex = i;

          // Get the actual resource index if possible
          if (listRef?.current) {
            // Get the current scroll offset safely
            const scrollOffset = getCurrentScrollOffset();

            // Calculate the approximate index based on scroll position
            const approximateIndex = Math.floor(scrollOffset / dimensions.cellHeight) + visibleIndex;
            const finalIndex = Math.min(approximateIndex, resources.length - 1);

            log("Found resource at visible index", {
              visibleIndex,
              scrollOffset,
              approximateIndex,
              finalIndex,
            });

            return finalIndex;
          }

          log("List ref not available, returning visible index", visibleIndex);
          return visibleIndex;
        }
      }

      // If we're below all rows, return the last index
      log("Mouse is below all rows, returning last index", resources.length - 1);
      return resources.length - 1;
    },
    [dimensions.cellHeight, resources.length, getCurrentScrollOffset, timelineContentRef?.current, listRef?.current],
  );

  // Update ghost position during dragging
  const updateDragGhostPosition = useCallback((mouseX: number, mouseY: number): void => {
    if (!dragGhostRef.current || !dragStateRef.current.currentEvent) return;

    // Position the ghost near the cursor but with a slight offset to be visible
    const offset = dragStateRef.current.offset;
    dragGhostRef.current.style.left = `${mouseX - offset.x}px`;
    dragGhostRef.current.style.top = `${mouseY - offset.y}px`;

    log("Updated ghost position", { mouseX, mouseY, ghostX: mouseX - offset.x, ghostY: mouseY - offset.y });
  }, []);

  // Unified function to check for and handle auto-scrolling with improved list handling
  const handleAutoScroll = useCallback(
    (mouseEvent: MouseEvent): void => {
      // Only process auto-scrolling if we're actively dragging an event
      if (!dragStateRef.current.isDragging || !dragStateRef.current.currentEvent) {
        log("Not in active drag state, skipping auto-scroll handling");
        return;
      }

      if (!timelineContentRef?.current) {
        log("Timeline content ref is not available, skipping auto-scroll");
        return;
      }

      // Update the ghost position
      updateDragGhostPosition(mouseEvent.clientX, mouseEvent.clientY);

      const containerRect = timelineContentRef.current.getBoundingClientRect();
      const mouseX = mouseEvent.clientX;
      const mouseY = mouseEvent.clientY;

      log("Auto-scroll check", {
        mouseX,
        mouseY,
        containerRect: {
          left: containerRect.left,
          right: containerRect.right,
          top: containerRect.top,
          bottom: containerRect.bottom,
          width: containerRect.width,
          height: containerRect.height,
        },
      });

      // Calculate distances from horizontal edges
      const distanceFromLeft = mouseX - containerRect.left;
      const distanceFromRight = containerRect.right - mouseX;
      const threshold = autoScrollRef.current.scrollThreshold;
      const maxSpeed = autoScrollRef.current.maxScrollSpeed;

      // Calculate horizontal scroll speed - always enabled for dragging
      let newHorizontalSpeed = 0;
      if (distanceFromLeft < threshold && distanceFromLeft >= 0) {
        const intensity = Math.max(0, 1 - distanceFromLeft / threshold);
        newHorizontalSpeed = -Math.ceil(intensity * maxSpeed);
        log("Near left edge, setting horizontal speed", newHorizontalSpeed);
      } else if (distanceFromRight < threshold && distanceFromRight >= 0) {
        const intensity = Math.max(0, 1 - distanceFromRight / threshold);
        newHorizontalSpeed = Math.ceil(intensity * maxSpeed);
        log("Near right edge, setting horizontal speed", newHorizontalSpeed);
      }

      if (newHorizontalSpeed !== autoScrollRef.current.horizontalScrollSpeed) {
        log("Updating horizontal scroll speed", {
          old: autoScrollRef.current.horizontalScrollSpeed,
          new: newHorizontalSpeed,
        });
        autoScrollRef.current.horizontalScrollSpeed = newHorizontalSpeed;
      }

      // Determine if we're near the top or bottom of the visible list
      const distanceFromTop = mouseY - containerRect.top;
      const distanceFromBottom = containerRect.bottom - mouseY;

      let newVerticalSpeed = 0;

      // Calculate vertical scroll speed for the list - only when dragging existing events
      if (distanceFromTop < threshold && distanceFromTop >= 0) {
        const intensity = Math.max(0, 1 - distanceFromTop / threshold);
        newVerticalSpeed = -Math.ceil(intensity * maxSpeed);
        log("Near top edge, setting vertical speed", newVerticalSpeed);

        // Set current resource index for edge detection
        if (currentResourceIndex === null || currentResourceIndex > 0) {
          const foundIndex = findResourceIndexFromPosition(mouseY);
          if (foundIndex !== null) {
            log("Updating current resource index near top", {
              old: currentResourceIndex,
              new: foundIndex,
            });
            setCurrentResourceIndex(foundIndex);
          }
        }
      } else if (distanceFromBottom < threshold && distanceFromBottom >= 0) {
        const intensity = Math.max(0, 1 - distanceFromBottom / threshold);
        newVerticalSpeed = Math.ceil(intensity * maxSpeed);
        log("Near bottom edge, setting vertical speed", newVerticalSpeed);

        // Set current resource index for edge detection
        if (currentResourceIndex === null || currentResourceIndex < resources.length - 1) {
          const foundIndex = findResourceIndexFromPosition(mouseY);
          if (foundIndex !== null) {
            log("Updating current resource index near bottom", {
              old: currentResourceIndex,
              new: foundIndex,
            });
            setCurrentResourceIndex(foundIndex);
          }
        }
      } else {
        // Not near top or bottom edges
        log("Not near vertical edges, clearing vertical speed");

        // Set current resource index when not scrolling
        const foundIndex = findResourceIndexFromPosition(mouseY);
        if (foundIndex !== null) {
          if (currentResourceIndex !== foundIndex) {
            log("Updating current resource index (not near edges)", {
              old: currentResourceIndex,
              new: foundIndex,
            });
            setCurrentResourceIndex(foundIndex);
          }
        } else {
          setCurrentResourceIndex(null);
        }
      }

      if (newVerticalSpeed !== autoScrollRef.current.verticalScrollSpeed) {
        log("Updating vertical scroll speed", {
          old: autoScrollRef.current.verticalScrollSpeed,
          new: newVerticalSpeed,
        });
        autoScrollRef.current.verticalScrollSpeed = newVerticalSpeed;
      }

      // Initialize current scroll position if needed
      if (listRef?.current && autoScrollRef.current.currentVerticalScroll === 0) {
        autoScrollRef.current.currentVerticalScroll = getCurrentScrollOffset();
        log("Initialized current vertical scroll position", autoScrollRef.current.currentVerticalScroll);
      }

      // Check if we're at the top or bottom boundary and adjust vertical scroll
      if (currentResourceIndex === 0 && autoScrollRef.current.verticalScrollSpeed < 0) {
        // At top, check if we should stop scrolling up
        if (autoScrollRef.current.currentVerticalScroll <= 0) {
          log("At top boundary, stopping upward scroll");
          autoScrollRef.current.verticalScrollSpeed = 0;
        }
      } else if (currentResourceIndex === resources.length - 1 && autoScrollRef.current.verticalScrollSpeed > 0) {
        // At bottom, check if we should stop scrolling down
        const maxScroll = dimensions.cellHeight * autoScrollRef.current.resourcesLength;
        if (autoScrollRef.current.currentVerticalScroll >= maxScroll) {
          log("At bottom boundary, stopping downward scroll");
          autoScrollRef.current.verticalScrollSpeed = 0;
        }
      }

      // Start or stop scrolling based on calculated speeds
      if (autoScrollRef.current.verticalScrollSpeed !== 0 || autoScrollRef.current.horizontalScrollSpeed !== 0) {
        if (!autoScrollRef.current.active) {
          log("Starting auto-scroll due to non-zero speeds", {
            vertical: autoScrollRef.current.verticalScrollSpeed,
            horizontal: autoScrollRef.current.horizontalScrollSpeed,
          });
          startAutoScroll();
        }
      } else if (autoScrollRef.current.active) {
        log("Stopping auto-scroll due to zero speeds");
        stopAutoScroll();
      }
    },
    [
      startAutoScroll,
      stopAutoScroll,
      findResourceIndexFromPosition,
      currentResourceIndex,
      resources.length,
      dimensions.cellHeight,
      getCurrentScrollOffset,
      updateDragGhostPosition,
      timelineContentRef?.current,
      listRef?.current,
    ],
  );

  // DRAG-TO-CREATE FUNCTIONALITY

  // Handle mouse down for drag-to-create
  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, resourceId: string, date: Date, dateIndex: number, isOccupied: boolean): void => {
      log("Cell mouse down", {
        resourceId,
        date: date.toISOString(),
        dateIndex,
        isOccupied,
        clientX: e.clientX,
        clientY: e.clientY,
      });

      if (!droppable || isOccupied || !editable || !resourceId || !date) {
        log("Ignoring cell mouse down due to constraints", {
          droppable,
          isOccupied,
          editable,
          hasResourceId: !!resourceId,
          hasDate: !!date,
        });
        return;
      }

      // Clean up any existing listeners
      cleanupListeners();

      // Find and set initial resource index
      const foundIndex = findResourceIndexFromPosition(e.clientY);
      if (foundIndex !== null) {
        log("Setting current resource index on cell mouse down", foundIndex);
        setCurrentResourceIndex(foundIndex);
      }

      // Initialize list scroll position
      if (listRef?.current) {
        autoScrollRef.current.currentVerticalScroll = getCurrentScrollOffset();
        log("Initialized current vertical scroll on cell mouse down", autoScrollRef.current.currentVerticalScroll);
      }

      // Initialize the drag state
      const initialState: DragCreateState = {
        isActive: true,
        resourceId,
        startDate: date,
        endDate: date,
        startIndex: dateIndex,
        endIndex: dateIndex,
      };

      log("Initializing drag-to-create state", initialState);

      // Update both the ref and the state
      dragCreateStateRef.current = initialState;
      setDragCreateState(initialState);

      // Handler for mouse move during drag-to-create
      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (!dragCreateStateRef.current.isActive) {
          log("Drag-to-create no longer active, ignoring mouse move");
          return;
        }

        log("Drag-to-create mouse move", {
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
        });

        // Note: we DON'T call handleAutoScroll here for drag-to-create
        // as per requirements, auto-scrolling should only happen for event dragging

        // Find the date cell under the mouse
        const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
        const dateCell = elements.find((el) => el.classList.contains("date-cell"));

        if (dateCell) {
          const cellDataset = (dateCell as HTMLElement).dataset;
          const cellIndex = cellDataset.index;

          if (cellIndex) {
            const cellDateIndex = parseInt(cellIndex, 10);
            // Make sure the cellDateIndex is valid
            if (cellDateIndex >= 0 && cellDateIndex < dateColumns.length) {
              const cellDate = dateColumns[cellDateIndex];

              if (cellDate) {
                // Get previous state for comparison
                const prevState = { ...dragCreateStateRef.current };

                // Only update the ref during active dragging
                dragCreateStateRef.current = {
                  ...dragCreateStateRef.current,
                  endDate: cellDate,
                  endIndex: cellDateIndex,
                };

                log("Updating drag-to-create state", {
                  previousEndIndex: prevState.endIndex,
                  newEndIndex: cellDateIndex,
                  newEndDate: cellDate.toISOString(),
                });

                // Update visible state for UI with throttling
                requestAnimationFrame(() => {
                  setDragCreateState({
                    ...dragCreateStateRef.current,
                  });
                });
              }
            }
          }
        }
      };

      // Handler for mouse up after drag-to-create
      const handleMouseUp = (): void => {
        log("Mouse up after drag-to-create");

        const currentState = dragCreateStateRef.current;
        log("Current drag-to-create state on mouse up", currentState);

        if (currentState.isActive && currentState.resourceId && currentState.startDate && currentState.endDate) {
          // Ensure start and end dates are in the correct order
          const [startDate, endDate] = [currentState.startDate, currentState.endDate].sort(
            (a, b) => a.getTime() - b.getTime(),
          );

          log("Processed drag-to-create date range", {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          });

          // Check for conflicts
          const existingEvents = getEventsForResource(currentState.resourceId);
          log("Checking conflicts against existing events", existingEvents.length);

          const hasConflict = existingEvents.some((e) => {
            if (!e.start || !e.end) return false;

            const eStart = new Date(e.start);
            const eEnd = new Date(e.end);
            const conflict = startDate < eEnd && addDays(endDate, 1) > eStart; // overlap logic

            if (conflict) {
              log("Conflict detected with event", {
                eventId: e.id,
                eventStart: eStart.toISOString(),
                eventEnd: eEnd.toISOString(),
              });
            }

            return conflict;
          });

          if (hasConflict) {
            log("Time slot conflict detected, showing error message");
            setErrorMessage("Time slot conflict detected");
          } else {
            log("No conflicts detected, opening reservation modal", {
              resourceId: currentState.resourceId,
              startDate: startDate.toISOString(),
              endDate: addDays(endDate, 1).toISOString(),
            });

            // Open the reservation modal with the selected date range
            handleOpenReservationModal(
              currentState.resourceId,
              startDate,
              addDays(endDate, 1), // End date is exclusive
            );
          }
        }

        // Reset drag state
        const resetState = {
          isActive: false,
          resourceId: null,
          startDate: null,
          endDate: null,
          startIndex: null,
          endIndex: null,
        };

        log("Resetting drag-to-create state", resetState);
        dragCreateStateRef.current = resetState;

        // Update UI state
        setDragCreateState(resetState);
        setCurrentResourceIndex(null);

        // Clean up
        cleanupListeners();
      };

      // Store listeners in ref for cleanup
      eventListenersRef.current.mouseMoveHandler = handleMouseMove;
      eventListenersRef.current.mouseUpHandler = handleMouseUp;

      log("Adding mouse event listeners for drag-to-create");
      // Add event listeners
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      // Prevent default browser behavior
      e.preventDefault();
    },
    [
      dateColumns,
      droppable,
      editable,
      getEventsForResource,
      setErrorMessage,
      handleOpenReservationModal,
      cleanupListeners,
      findResourceIndexFromPosition,
      getCurrentScrollOffset,
      listRef?.current,
    ],
  );

  // DRAG-AND-DROP FUNCTIONALITY

  // Create an actual visual drag ghost element for user feedback
  const createDragGhost = useCallback(
    (event: TimelineEvent, x: number, y: number, offsetX: number, offsetY: number): HTMLElement => {
      // Clean up any existing ghost
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
      }

      // Create a new ghost element
      const ghost = document.createElement("div");
      ghost.className = "timeline-drag-ghost";
      ghost.style.position = "fixed";
      ghost.style.top = `${y - offsetY}px`;
      ghost.style.left = `${x - offsetX}px`;
      ghost.style.padding = "8px 12px";
      ghost.style.backgroundColor = event.backgroundColor || "#3788d8";
      ghost.style.color = event.textColor || "#fff";
      ghost.style.borderRadius = "4px";
      ghost.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
      ghost.style.fontSize = "14px";
      ghost.style.fontWeight = "bold";
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = "9999";
      ghost.style.minWidth = "100px";
      ghost.style.textAlign = "center";
      ghost.style.opacity = "0.9";
      ghost.style.transform = "translateZ(0)"; // Force GPU acceleration
      ghost.textContent = event.title || "Event";

      // Add to document
      document.body.appendChild(ghost);

      log("Created drag ghost element", {
        x,
        y,
        offsetX,
        offsetY,
        text: event.title,
        backgroundColor: event.backgroundColor,
      });

      // Store reference
      dragGhostRef.current = ghost;

      return ghost;
    },
    [],
  );

  // Handle drag start for existing events - THIS IS KEY FOR SCROLLING
  const handleEventDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, event: TimelineEvent): void => {
      log("Event drag start", {
        eventId: event.id,
        eventTitle: event.title,
        clientX: e.clientX,
        clientY: e.clientY,
        resourceId: event.resourceId,
        start: event.start,
        end: event.end,
      });

      // Set data for drag operation
      e.dataTransfer.setData("text/plain", event.id);
      e.dataTransfer.effectAllowed = "move";
      log("Set drag data with event ID", event.id);

      // Find and set initial resource index
      const foundIndex = findResourceIndexFromPosition(e.clientY);
      if (foundIndex !== null) {
        log("Setting current resource index on drag start", foundIndex);
        setCurrentResourceIndex(foundIndex);
      }

      // Initialize list scroll position
      if (listRef?.current) {
        autoScrollRef.current.currentVerticalScroll = getCurrentScrollOffset();
        log("Initialized current vertical scroll on drag start", autoScrollRef.current.currentVerticalScroll);
      }

      // Calculate and store drag offset
      const targetElement = e.currentTarget as HTMLElement;
      const rect = targetElement.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      log("Calculated drag offset", { offsetX, offsetY });

      // Handler for mouse move during event dragging
      const handleMouseMove = (moveEvent: MouseEvent): void => {
        // IMPORTANT: Only handle auto-scrolling if we're actively dragging
        if (dragStateRef.current.isDragging && dragStateRef.current.currentEvent) {
          log("Mouse move during event drag", {
            clientX: moveEvent.clientX,
            clientY: moveEvent.clientY,
            isDragging: dragStateRef.current.isDragging,
            hasEvent: !!dragStateRef.current.currentEvent,
          });
          handleAutoScroll(moveEvent);
        } else {
          log("Ignoring mouse move - not in active drag state", {
            isDragging: dragStateRef.current.isDragging,
            hasEvent: !!dragStateRef.current.currentEvent,
          });
        }
      };

      // Add mousemove listener for auto-scroll
      log("Adding mousemove listener for event dragging");
      document.addEventListener("mousemove", handleMouseMove);

      // Update drag state
      const newDragState = {
        isDragging: true,
        currentEvent: event,
        offset: { x: offsetX, y: offsetY },
        mouseMoveHandler: handleMouseMove,
      };

      log("Updating drag state ref", newDragState);
      dragStateRef.current = newDragState;

      // Set drag image - use a transparent image to hide browser's default ghost
      // but still keep the native HTML5 drag and drop working
      if (e.dataTransfer.setDragImage) {
        // Create an invisible 1x1 pixel transparent image
        const img = new Image();
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        e.dataTransfer.setDragImage(img, 0, 0);
        log("Set transparent drag image");
      }

      if (isMounted.current) {
        log("Updating drag state in React state", {
          draggedEventId: event.id,
          isDragging: true,
          offsetX,
          offsetY,
        });

        setDraggedEvent(event);
        setIsDragging(true);
        setDragOffset({ x: offsetX, y: offsetY });

        // Add dragging classes
        document.body.classList.add("timeline-dragging");
        document.body.classList.add(`timeline-dragging-${view}`);
        log("Added dragging classes to body");
      }
    },
    [view, handleAutoScroll, findResourceIndexFromPosition, getCurrentScrollOffset, listRef.current],
  );

  // Handle drag end
  const handleEventDragEnd = useCallback((): void => {
    log("Event drag end");

    // Clean up mousemove listener
    if (dragStateRef.current.mouseMoveHandler) {
      log("Removing mousemove listener");
      document.removeEventListener("mousemove", dragStateRef.current.mouseMoveHandler);
    }

    // Remove drag ghost element if exists
    if (dragGhostRef.current) {
      log("Removing drag ghost element");
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }

    // Stop any active auto-scrolling
    stopAutoScroll();

    // Reset drag state
    const resetDragState = {
      isDragging: false,
      currentEvent: null,
      offset: { x: 0, y: 0 },
      mouseMoveHandler: null,
    };

    log("Resetting drag state ref", resetDragState);
    dragStateRef.current = resetDragState;

    if (isMounted.current) {
      log("Updating React state for drag end");
      setDraggedEvent(null);
      setIsDragging(false);
      setCurrentResourceIndex(null);

      // Remove dragging classes
      document.body.classList.remove("timeline-dragging");
      document.body.classList.remove(`timeline-dragging-${view}`);
      log("Removed dragging classes from body");
    }
  }, [view, stopAutoScroll]);

  // Handle event drop
  const handleEventDrop = useCallback(
    (resourceId: string, date: Date, event: TimelineEvent, e?: React.DragEvent<HTMLDivElement>): void => {
      log("Event drop", {
        resourceId,
        date: date.toISOString(),
        eventId: event?.id,
        eventTitle: event?.title,
        clientX: e?.clientX,
        clientY: e?.clientY,
      });

      if (!event || !isMounted.current) {
        log("Invalid drop - missing event or component unmounted", {
          hasEvent: !!event,
          isMounted: isMounted.current,
        });
        return;
      }

      const adjustedDate = new Date(date);
      log("Adjusted drop date", adjustedDate.toISOString());

      // Calculate the duration of the event
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const eventDuration = eventEnd.getTime() - eventStart.getTime();

      log("Event duration calculation", {
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        durationMs: eventDuration,
      });

      // Create new end date based on same duration
      const newEnd = new Date(adjustedDate.getTime() + eventDuration);
      log("Calculated new end date", newEnd.toISOString());

      // Prepare drop info
      const dropInfo: EventDropInfo = {
        event,
        resourceId,
        start: adjustedDate,
        end: newEnd,
      };

      log("Dispatching onEventDrop with info", dropInfo);

      // Call the provided callback
      onEventDrop?.(dropInfo);

      // Clean up any lingering drag ghost
      if (dragGhostRef.current) {
        log("Cleaning up drag ghost after drop");
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
    },
    [onEventDrop],
  );

  // Handle drag over for visual feedback
  const handleEventDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation(); // Prevent event bubbling

      // Add visual feedback
      if (e.currentTarget instanceof HTMLElement) {
        log("Drag over cell", {
          clientX: e.clientX,
          clientY: e.clientY,
          target: e.currentTarget.classList.toString(),
        });
        e.currentTarget.classList.add("drag-over");

        // Update the drop effect
        e.dataTransfer.dropEffect = "move";

        // Update ghost position if available
        if (dragGhostRef.current && dragStateRef.current.isDragging) {
          updateDragGhostPosition(e.clientX, e.clientY);
        }
      }
    },
    [updateDragGhostPosition],
  );

  // Handle drag leave to remove visual feedback
  const handleEventDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    // Remove visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      log("Drag leave cell", {
        clientX: e.clientX,
        clientY: e.clientY,
        target: e.currentTarget.classList.toString(),
      });
      e.currentTarget.classList.remove("drag-over");
    }
  }, []);

  // Check if a cell is part of the current drag selection
  const isDragCell = useCallback(
    (resourceId: string, dateIndex: number): boolean => {
      if (
        !dragCreateState.isActive ||
        dragCreateState.resourceId !== resourceId ||
        dragCreateState.startIndex === null ||
        dragCreateState.endIndex === null
      ) {
        return false;
      }

      const dragStartIdx = Math.min(dragCreateState.startIndex, dragCreateState.endIndex);
      const dragEndIdx = Math.max(dragCreateState.startIndex, dragCreateState.endIndex);

      return dateIndex >= dragStartIdx && dateIndex <= dragEndIdx;
    },
    [dragCreateState.isActive, dragCreateState.resourceId, dragCreateState.startIndex, dragCreateState.endIndex],
  );

  // Memoized drag preview component
  const DragPreviewComponent = React.memo(({ state, width }: { state: DragCreateState; width: number }) => {
    if (!state.isActive || state.startIndex === null || state.endIndex === null) {
      return null;
    }

    const startIdx = state.startIndex;
    const endIdx = state.endIndex;

    const startIndex = Math.min(startIdx, endIdx);
    const endIndex = Math.max(startIdx, endIdx);

    // Calculate width and position
    const previewWidth = (endIndex - startIndex + 1) * width;
    const left = startIndex * width;

    return (
      <div
        className="timeline-drag-preview"
        style={{
          left: `${left}px`,
          width: `${previewWidth}px`,
        }}
      >
        {endIndex - startIndex > 0 ? `${endIndex - startIndex + 1} days` : ""}
      </div>
    );
  });

  // Render drag-to-create preview
  const renderDragCreatePreview = useCallback((): React.ReactNode => {
    log("Rendering drag create preview", {
      isActive: dragCreateState.isActive,
      startIndex: dragCreateState.startIndex,
      endIndex: dragCreateState.endIndex,
    });
    return <DragPreviewComponent state={dragCreateState} width={cellWidth} />;
  }, [dragCreateState, cellWidth, dragCreateState.startIndex, dragCreateState.endIndex]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      log("Component unmounting, cleaning up");
      isMounted.current = false;
      cleanupListeners();
    };
  }, [cleanupListeners]);

  // Add CSS to document for drag ghost styling
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .timeline-drag-ghost {
        animation: pulse 1.5s infinite alternate;
        transition: transform 0.1s ease-out;
      }
      
      @keyframes pulse {
        0% { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        100% { box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
      }
      
      .date-cell.drag-over {
        background-color: rgba(55, 136, 216, 0.15) !important;
        box-shadow: inset 0 0 0 2px rgba(55, 136, 216, 0.6) !important;
        transition: all 0.1s ease-out;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return {
    // Drag-to-create
    dragCreateState,
    handleCellMouseDown,
    renderDragCreatePreview,
    isDragCell,

    // Drag-and-drop
    draggedEvent,
    isDragging,
    dragOffset,
    handleEventDragStart,
    handleEventDragEnd,
    handleEventDrop,
    handleEventDragOver,
    handleEventDragLeave,

    // Resource position tracking
    currentResourceIndex,
  };
}
