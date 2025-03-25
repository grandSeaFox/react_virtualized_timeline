import {
  DragCreateState,
  DragState,
  EventDropInfo,
  EventType,
  StateChangeCallback,
  TimelineDragManagerOptions,
  TimelineEvent,
} from "@/types";
import { addDays } from "date-fns";
import React from "react";

export class TimelineDragManager {
  // DOM References
  private readonly containerElement: HTMLElement | null = null;
  private readonly listElement: any | null = null;
  private readonly headerElement: HTMLElement | null = null;

  // Configuration
  private resources: any[] = [];
  private dateColumns: Date[] = [];
  private readonly cellWidth: number = 120;
  private readonly cellHeight: number = 60;
  private readonly editable: boolean = true;
  private readonly droppable: boolean = true;
  private eventMap: Map<string, TimelineEvent> = new Map();

  // Drag state
  private dragCreateState: DragCreateState = {
    isActive: false,
    resourceId: null,
    startDate: null,
    endDate: null,
    startIndex: null,
    endIndex: null,
  };

  private dragState: DragState = {
    isDragging: false,
    currentEvent: null,
    offset: { x: 0, y: 0 },
  };

  private currentResourceIndex: number | null = null;

  // DOM elements
  private dragGhost: HTMLElement | null = null;

  // Scroll state
  private isDropping: boolean = false;
  private isScrolling: boolean = false;
  private scrollThreshold: number = 60;
  private rowScrollThreshold: number = 40;
  private maxScrollSpeed: number = 80;
  private verticalScrollSpeed: number = 0;
  private horizontalScrollSpeed: number = 0;
  private currentScrollTop: number = 0;
  private lastScrollTime: number = 0;
  private animationFrameId: number | null = null;

  // Callbacks
  private readonly onEventDrop: ((info: EventDropInfo) => void) | null = null;
  private setErrorMessage: ((message: string | null) => void) | null = null;
  private readonly handleOpenReservationModal: ((resourceId: string, startDate: Date, endDate: Date) => void) | null =
    null;

  // Observer pattern
  private observers: Map<EventType, StateChangeCallback[]> = new Map();

  constructor(options: TimelineDragManagerOptions) {
    // Initialize from options
    this.containerElement = document.querySelector(options.containerSelector);
    this.listElement = options.listRef;
    this.headerElement = options.headerRef;
    this.resources = options.resources || [];
    this.dateColumns = options.dateColumns || [];
    this.cellWidth = options.cellWidth || this.cellWidth;
    this.cellHeight = options.cellHeight || this.cellHeight;
    this.onEventDrop = options.onEventDrop || null;
    this.setErrorMessage = options.setErrorMessage || null;
    this.handleOpenReservationModal = options.handleOpenReservationModal || null;
    this.editable = options.editable !== undefined ? options.editable : true;
    this.droppable = options.droppable !== undefined ? options.droppable : true;

    console.log("[TimelineDragManager] Initialized", {
      resources: this.resources.length,
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
    });
  }

  // Public methods for component integration

  public initialize(): void {
    this.setupDragStyles();
    this.addEventListeners();
    console.log("[TimelineDragManager] Event listeners added");
  }

  public update(options: { resources?: any[]; dateColumns?: Date[]; eventMap?: Map<string, TimelineEvent> }): void {
    if (options.resources) this.resources = options.resources;
    if (options.dateColumns) this.dateColumns = options.dateColumns;
    if (options.eventMap) this.eventMap = options.eventMap;

    console.log("[TimelineDragManager] Updated with new data", {
      resources: this.resources.length,
      dateColumns: this.dateColumns.length,
      events: this.eventMap.size,
    });
  }

  public destroy(): void {
    this.stopScrolling();
    this.removeEventListeners();
    this.removeDragGhost();
    console.log("[TimelineDragManager] Destroyed");
  }

  // Wrapper methods to match component expectations
  public handleCellMouseDown(
    e: React.MouseEvent,
    resourceId: string,
    date: Date,
    dateIndex: number,
    isOccupied: boolean,
  ): void {
    console.log("[TimelineDragManager] handleCellMouseDown called", { resourceId, dateIndex, isOccupied });
    this.handleMouseDown(e.nativeEvent, resourceId, date, dateIndex, isOccupied);
  }

  public handleEventDragStart(e: React.DragEvent, event: TimelineEvent): void {
    this.handleDragStart(e.nativeEvent, event);
  }

  public handleEventDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.handleDragOver(e.nativeEvent);
  }

  public handleEventDragLeave(e: React.DragEvent): void {
    this.handleDragLeave(e.nativeEvent);
  }

  public handleEventDragEnd(): void {
    console.log("[TimelineDragManager] handleEventDragEnd called");
    this.handleDragEnd();
  }

  public handleEventDrop(resourceId: string, date: Date, event: TimelineEvent, e?: React.DragEvent): void {
    console.log("[TimelineDragManager] handleEventDrop called", {
      resourceId,
      date: date.toISOString(),
      eventId: event.id,
    });
    this.handleDrop(resourceId, date, event, e?.nativeEvent);
  }

  // Observer pattern methods
  public subscribe(event: EventType, callback: StateChangeCallback): () => void {
    if (!this.observers.has(event)) {
      this.observers.set(event, []);
    }

    this.observers.get(event)?.push(callback);
    console.log(`[TimelineDragManager] Subscribed to ${event}`);

    // Return unsubscribe function
    return () => {
      const callbacks = this.observers.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
          console.log(`[TimelineDragManager] Unsubscribed from ${event}`);
        }
      }
    };
  }

  // State access methods
  public getState(): {
    dragCreateState: DragCreateState;
    dragState: DragState;
    currentResourceIndex: number | null;
  } {
    return {
      dragCreateState: { ...this.dragCreateState },
      dragState: { ...this.dragState },
      currentResourceIndex: this.currentResourceIndex,
    };
  }

  public isDragCell(resourceId: string, dateIndex: number): boolean {
    if (
      !this.dragCreateState.isActive ||
      this.dragCreateState.resourceId !== resourceId ||
      this.dragCreateState.startIndex === null ||
      this.dragCreateState.endIndex === null
    ) {
      return false;
    }

    const dragStartIdx = Math.min(this.dragCreateState.startIndex, this.dragCreateState.endIndex);
    const dragEndIdx = Math.max(this.dragCreateState.startIndex, this.dragCreateState.endIndex);

    return dateIndex >= dragStartIdx && dateIndex <= dragEndIdx;
  }

  public renderDragCreatePreview(): React.ReactNode {
    if (
      !this.dragCreateState.isActive ||
      this.dragCreateState.startIndex === null ||
      this.dragCreateState.endIndex === null
    ) {
      return null;
    }

    const startIdx = this.dragCreateState.startIndex;
    const endIdx = this.dragCreateState.endIndex;

    const startIndex = Math.min(startIdx, endIdx);
    const endIndex = Math.max(startIdx, endIdx);

    // Calculate width and position
    const previewWidth = (endIndex - startIndex + 1) * this.cellWidth;
    const left = startIndex * this.cellWidth;

    // Return a proper React element using JSX syntax
    return React.createElement(
      "div",
      {
        className: "timeline-drag-preview",
        key: new Date().toString(),
        style: {
          left: `${left}px`,
          width: `${previewWidth}px`,
        },
      },
      endIndex - startIndex > 0 ? `${endIndex - startIndex + 1} days` : "",
    );
  }

  // Private implementation methods

  private setupDragStyles(): void {
    // Check if styles already exist
    if (document.getElementById("timeline-drag-styles")) return;
    // Add CSS for drag operations
    const styleElement = document.createElement("style");
    styleElement.id = "timeline-drag-styles";
    styleElement.textContent = `
      .timeline-drag-ghost {
        position: fixed;
        padding: 8px 12px;
        background-color: #3788d8;
        color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-size: 14px;
        font-weight: bold;
        pointer-events: none;
        z-index: 9999;
        opacity: 0.9;
        transform: translateZ(0);
        animation: pulse 1.5s infinite alternate;
        width: ${this.dragState.currentEvent?.style?.width as string}px;
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
      
      .timeline-event.dragging {
        opacity: 0.7;
      }
      
      .date-cell.drag-not-allowed {
        background-color: rgba(255, 77, 79, 0.15) !important;
        box-shadow: inset 0 0 0 2px rgba(255, 77, 79, 0.6) !important;
        cursor: not-allowed !important;
      }
      
      .drag-highlight-row {
        background-color: rgba(55, 136, 216, 0.05) !important;
        transition: background-color 0.2s ease;
      }
    `;
    document.head.appendChild(styleElement);
    console.log("[TimelineDragManager] Drag styles added");
  }

  private addEventListeners(): void {
    if (!this.containerElement) {
      console.error("[TimelineDragManager] Container element not found");
      return;
    }

    // We'll use event delegation for most events
    this.containerElement.addEventListener("mousedown", this.onMouseDown);
    this.containerElement.addEventListener("dragstart", this.onDragStart);
    this.containerElement.addEventListener("dragover", this.onDragOver);
    this.containerElement.addEventListener("dragleave", this.onDragLeave);
    this.containerElement.addEventListener("drop", this.onDrop);
    this.containerElement.addEventListener("dragend", this.onDragEnd);
  }

  private removeEventListeners(): void {
    if (!this.containerElement) return;

    this.containerElement.removeEventListener("mousedown", this.onMouseDown);
    this.containerElement.removeEventListener("dragstart", this.onDragStart);
    this.containerElement.removeEventListener("dragover", this.onDragOver);
    this.containerElement.removeEventListener("dragleave", this.onDragLeave);
    this.containerElement.removeEventListener("drop", this.onDrop);
    this.containerElement.removeEventListener("dragend", this.onDragEnd);

    // Also remove document listeners
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }

  // Event handlers
  private onMouseDown = (e: MouseEvent): void => {
    // Check if this is an event element - if so, we'll handle it in onDragStart
    const eventElement = (e.target as HTMLElement).closest(".timeline-event");
    if (eventElement) return;

    // Check if this is a date cell
    const dateCell = (e.target as HTMLElement).closest(".date-cell");
    if (!dateCell) return;

    // Get the resource row
    const row = dateCell.closest(".virtualized-table-row");
    if (!row) return;

    // Extract data
    const resourceId = row.getAttribute("data-resource-id");
    const dateIndex = parseInt(dateCell.getAttribute("data-index") || "-1", 10);
    const dateStr = dateCell.getAttribute("data-date");

    if (!resourceId || dateIndex === -1 || !dateStr) return;

    // Convert date string to Date
    const date = new Date(dateStr);

    // Check if the cell is occupied
    const isOccupied = dateCell.classList.contains("occupied");

    // Now we can call our handler
    this.handleMouseDown(e, resourceId, date, dateIndex, isOccupied);
  };

  private onDragStart = (e: DragEvent): void => {
    const eventElement = (e.target as HTMLElement).closest(".timeline-event");
    if (!eventElement || !e.dataTransfer) return;

    const eventId = eventElement.getAttribute("data-event-id");
    if (!eventId) return;
    // Find the event in the event map

    const event = this.eventMap.get(eventId);
    if (!event) return;
    this.dragState.currentEvent = event;

    this.handleDragStart(e, event);
  };

  private onDragOver = (e: DragEvent): void => {
    if (!this.dragState.isDragging) return;
    e.preventDefault();
    this.handleDragOver(e);
  };

  private onDragLeave = (e: DragEvent): void => {
    this.handleDragLeave(e);
  };

  private onDrop = (e: DragEvent): void => {
    if (!this.dragState.isDragging || !this.dragState.currentEvent || !e.dataTransfer) return;
    e.preventDefault();

    // Get drop target info
    const dateCell = (e.target as HTMLElement).closest(".date-cell");
    if (!dateCell) return;

    const row = dateCell.closest(".virtualized-table-row");
    if (!row) return;

    const resourceId = row.getAttribute("data-resource-id");
    const dateIndex = parseInt(dateCell.getAttribute("data-index") || "-1", 10);
    const dateStr = dateCell.getAttribute("data-date");

    if (!resourceId || dateIndex === -1 || !dateStr) return;

    // Convert date string to Date
    const date = new Date(dateStr);

    // Call our handler
    this.handleDrop(resourceId, date, this.dragState.currentEvent, e);
  };

  private onDragEnd = (): void => {
    this.handleDragEnd();
  };

  private onMouseMove = (e: MouseEvent): void => {
    // Handle drag-to-create
    if (this.dragCreateState.isActive) {
      this.handleDragCreateMove(e);
      return;
    }

    // Handle event dragging
    if (this.dragState.isDragging && this.dragState.currentEvent) {
      this.handleDragMove(e);
    }
  };

  private onMouseUp = (): void => {
    // Handle drag-to-create end
    if (this.dragCreateState.isActive) {
      this.handleDragCreateEnd();
    }
  };

  // Core implementation methods
  private handleMouseDown(e: MouseEvent, resourceId: string, date: Date, dateIndex: number, isOccupied: boolean): void {
    if (!this.droppable || isOccupied || !this.editable) {
      console.log("[TimelineDragManager] Ignoring mouse down - constraints not met", {
        droppable: this.droppable,
        isOccupied,
        editable: this.editable,
      });
      return;
    }

    // Clean up any existing state
    this.cleanupDragState();

    // Store the current scroll position
    this.currentScrollTop = this.getCurrentScrollTop();

    // Initialize the drag-to-create state
    this.updateDragCreateState({
      isActive: true,
      resourceId,
      startDate: date,
      endDate: date,
      startIndex: dateIndex,
      endIndex: dateIndex,
    });

    // Find and set initial resource index
    const foundIndex = this.findResourceIndexFromPosition(e.clientY);
    if (foundIndex !== null) {
      this.updateResourceIndex(foundIndex);
    }

    // Add document listeners
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);

    // Prevent default browser behavior
    e.preventDefault();

    console.log("[TimelineDragManager] Mouse down handled", {
      resourceId,
      date: date.toISOString(),
      dateIndex,
    });
  }

  private handleDragCreateMove(e: MouseEvent): void {
    if (!this.dragCreateState.isActive) return;

    // Find the date cell under the mouse
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const dateCell = elements.find((el) => el.classList.contains("date-cell"));

    if (dateCell) {
      const cellDataset = (dateCell as HTMLElement).dataset;
      const cellIndex = cellDataset.index;

      if (cellIndex) {
        const cellDateIndex = parseInt(cellIndex, 10);
        // Make sure the cellDateIndex is valid
        if (cellDateIndex >= 0 && cellDateIndex < this.dateColumns.length) {
          const cellDate = this.dateColumns[cellDateIndex];

          if (cellDate) {
            // Only update if the end index changed
            if (this.dragCreateState.endIndex !== cellDateIndex) {
              this.updateDragCreateState({
                ...this.dragCreateState,
                endDate: cellDate,
                endIndex: cellDateIndex,
              });

              console.log("[TimelineDragManager] Drag-to-create moved", {
                newEndIndex: cellDateIndex,
                newEndDate: cellDate.toISOString(),
              });
            }
          }
        }
      }
    }
  }

  public checkForConflicts(resourceId: string, startDate: Date, endDate: Date, excludeEventId?: string): boolean {
    const resourceEvents = Array.from(this.eventMap.values()).filter(
      (event) => event.resourceId === resourceId && (excludeEventId ? event.id !== excludeEventId : true),
    );

    return resourceEvents.some((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Check for overlap - standard interval overlap check
      return startDate < eventEnd && endDate > eventStart;
    });
  }

  private checkForListEdgeScroll(mouseY: number): void {
    if (!this.containerElement || !this.listElement || !this.dragState.isDragging) return;

    const containerRect = this.containerElement.getBoundingClientRect();

    // Calculate distances from top and bottom of the container
    const distFromTop = mouseY - containerRect.top;
    const distFromBottom = containerRect.bottom - mouseY;

    let needsVerticalScroll = false;
    let verticalDirection = 0;

    // Check if we're near the top edge
    if (distFromTop < this.rowScrollThreshold) {
      // Scroll up - stronger effect the closer to the edge
      verticalDirection = -1;
      const intensity = Math.max(1, (this.rowScrollThreshold - distFromTop) / 10);
      this.verticalScrollSpeed = -Math.min(this.maxScrollSpeed, Math.ceil(intensity));
      needsVerticalScroll = true;
    }
    // Check if we're near the bottom edge
    else if (distFromBottom < this.rowScrollThreshold) {
      // Scroll down - stronger effect the closer to the edge
      verticalDirection = 1;
      const intensity = Math.max(1, (this.rowScrollThreshold - distFromBottom) / 10);
      this.verticalScrollSpeed = Math.min(this.maxScrollSpeed, Math.ceil(intensity));
      needsVerticalScroll = true;
    } else {
      this.verticalScrollSpeed = 0;
    }

    // Start or stop vertical scrolling based on need
    if (needsVerticalScroll && !this.isScrolling) {
      // Calculate the target resource index based on direction
      if (this.currentResourceIndex !== null) {
        const targetIndex =
          verticalDirection > 0
            ? Math.min(this.resources.length - 1, this.currentResourceIndex + 1)
            : Math.max(0, this.currentResourceIndex - 1);

        // Update the current resource index
        this.updateResourceIndex(targetIndex);
      }

      this.startScrolling();
    } else if (!needsVerticalScroll && !this.horizontalScrollSpeed && this.isScrolling) {
      this.stopScrolling();
    }
  }

  private handleDragCreateEnd(): void {
    if (!this.dragCreateState.isActive) return;

    const currentState = this.dragCreateState;
    console.log("[TimelineDragManager] Drag-to-create ended", currentState);

    if (currentState.resourceId && currentState.startDate && currentState.endDate) {
      // Ensure start and end dates are in the correct order
      const [startDate, endDate] = [currentState.startDate, currentState.endDate].sort(
        (a, b) => a.getTime() - b.getTime(),
      );

      // Open reservation modal if callback provided
      if (this.handleOpenReservationModal) {
        this.handleOpenReservationModal(
          currentState.resourceId,
          startDate,
          addDays(endDate, 1), // End date is exclusive
        );
      }
    }

    // Reset state
    this.updateDragCreateState({
      isActive: false,
      resourceId: null,
      startDate: null,
      endDate: null,
      startIndex: null,
      endIndex: null,
    });

    this.updateResourceIndex(null);

    // Clean up
    this.cleanupDragState();
  }

  private handleDragStart(e: DragEvent, event: TimelineEvent): void {
    if (!e.dataTransfer || !this.editable) return;

    // Set drag data
    e.dataTransfer.setData("text/plain", event.id);
    e.dataTransfer.effectAllowed = "move";

    // Calculate offset
    const targetElement = e.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Capture event width - either from style or calculate from event duration
    let eventWidth: number;
    if (event.style && event.style.width) {
      // Get width from event style if available
      eventWidth =
        typeof event.style.width === "number" ? event.style.width : parseInt(event.style.width as string, 10);
    } else {
      // Calculate based on event duration and cell width
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const durationDays = Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24));
      eventWidth = durationDays * this.cellWidth;
    }

    // Update drag state with width
    this.updateDragState({
      isDragging: true,
      currentEvent: event,
      offset,
      eventWidth: eventWidth,
    });

    // Find and set initial resource index
    const foundIndex = this.findResourceIndexFromPosition(e.clientY);
    if (foundIndex !== null) {
      this.updateResourceIndex(foundIndex);
    }

    // Initialize scroll position
    this.currentScrollTop = this.getCurrentScrollTop();

    // Create visual ghost element for better feedback - now with correct width
    this.createDragGhost(event, e.clientX, e.clientY);

    // Set drag image - use a transparent image to hide browser's default ghost
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);

    // Add the dragging class to the original element
    targetElement.classList.add("dragging");

    // Add document listener for mouse movement to update ghost
    document.addEventListener("mousemove", this.onMouseMove);

    console.log("[TimelineDragManager] Drag started", {
      eventId: event.id,
      offset,
      eventWidth,
    });
  }

  private handleDragMove(e: MouseEvent): void {
    // Update ghost position
    this.updateDragGhostPosition(e.clientX, e.clientY);

    // Check for auto-scroll
    this.checkForAutoScroll(e.clientX, e.clientY);
  }

  private handleDragOver(e: DragEvent): void {
    if (!this.dragState.isDragging) return;
    e.preventDefault();

    // Add visual feedback to the target cell
    const dateCell = (e.target as HTMLElement).closest(".date-cell");
    if (dateCell && !dateCell.classList.contains("drag-over")) {
      // Check for conflicts at this location
      if (this.dragState.currentEvent) {
        const row = dateCell.closest(".virtualized-table-row");
        if (row) {
          const resourceId = row.getAttribute("data-resource-id");
          const dateStr = dateCell.getAttribute("data-date");

          if (resourceId && dateStr) {
            const date = new Date(dateStr);
            const event = this.dragState.currentEvent;
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);
            const duration = Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24));
            const dropStart = date;
            const dropEnd = addDays(date, duration);

            // Check for conflicts, excluding the current event
            const hasConflict = this.checkForConflicts(resourceId, dropStart, dropEnd, event.id);

            if (hasConflict) {
              dateCell.classList.add("drag-not-allowed");
              dateCell.classList.remove("drag-over");
              return;
            } else {
              dateCell.classList.remove("drag-not-allowed");
            }
          }
        }
      }

      dateCell.classList.add("drag-over");
    }

    // Update ghost position if available
    if (this.dragGhost) {
      this.updateDragGhostPosition(e.clientX, e.clientY);
    }

    // Check for both container edge scrolling and list edge scrolling
    this.checkForAutoScroll(e.clientX, e.clientY);
    this.checkForListEdgeScroll(e.clientY);
  }

  private handleDragLeave(e: DragEvent): void {
    // Remove visual feedback
    const dateCell = (e.target as HTMLElement).closest(".date-cell");
    if (dateCell) {
      dateCell.classList.remove("drag-over");
    }
  }

  private handleDragEnd(): void {
    // Stop scrolling
    this.stopScrolling();

    // Remove drag ghost
    this.removeDragGhost();

    // Remove ALL drag-related classes from elements
    document.querySelectorAll(".timeline-event.dragging").forEach((el) => {
      el.classList.remove("dragging");
    });

    document.querySelectorAll(".date-cell.drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });

    document.querySelectorAll(".date-cell.drag-not-allowed").forEach((el) => {
      el.classList.remove("drag-not-allowed");
    });

    document.querySelectorAll(".drag-highlight-row").forEach((el) => {
      el.classList.remove("drag-highlight-row");
    });

    // Reset drag state
    this.updateDragState({
      isDragging: false,
      currentEvent: null,
      offset: { x: 0, y: 0 },
      eventWidth: undefined,
    });

    // Reset resource index
    this.updateResourceIndex(null);

    // Remove document listeners
    document.removeEventListener("mousemove", this.onMouseMove);

    console.log("[TimelineDragManager] Drag ended with complete cleanup");
  }

  private handleDrop(resourceId: string, date: Date, event: TimelineEvent, e?: DragEvent): void {
    if (!this.onEventDrop) return;

    // Set the dropping flag
    this.isDropping = true;

    // Clean up visual feedback - be more thorough
    if (e) {
      // Clean up the specific cell
      const dateCell = (e.target as HTMLElement).closest(".date-cell");
      if (dateCell) {
        dateCell.classList.remove("drag-over");
        dateCell.classList.remove("drag-not-allowed");
      }

      // Clean up all cells that might have drag-related classes
      document.querySelectorAll(".date-cell.drag-over, .date-cell.drag-not-allowed").forEach((cell) => {
        cell.classList.remove("drag-over");
        cell.classList.remove("drag-not-allowed");
      });
    }

    // Calculate the duration of the event
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const eventDuration = eventEnd.getTime() - eventStart.getTime();

    // Create new end date based on same duration
    const newEnd = new Date(date.getTime() + eventDuration);

    // Check for conflicts with existing events (excluding the current event)
    const hasConflict = this.checkForConflicts(resourceId, date, newEnd, event.id);

    if (hasConflict) {
      // Show error message and abort the drop
      if (this.setErrorMessage) {
        this.setErrorMessage("Cannot drop event: time slot already occupied");
      }

      // Clean up
      this.handleDragEnd();
      this.isDropping = false;
      return;
    }

    // Create a deep copy of the event to avoid mutating the original
    const updatedEvent = { ...event };

    // Ensure we preserve the original width and style
    if (this.dragState.eventWidth) {
      updatedEvent.style = {
        ...(typeof updatedEvent.style === "object" ? updatedEvent.style : {}),
        width: `${this.dragState.eventWidth}px`, // Ensure width has px units
      };
    }

    // Update event dates
    updatedEvent.start = date;
    updatedEvent.end = newEnd;
    updatedEvent.resourceId = resourceId;

    try {
      // Call the provided callback with the fully updated event
      this.onEventDrop({
        event: updatedEvent,
        resourceId,
        start: date,
        end: newEnd,
        originalWidth: this.dragState.eventWidth,
        preserveWidth: true,
      });
    } catch (error) {
      console.error("[TimelineDragManager] Error in onEventDrop callback:", error);
      // Show error to user
      if (this.setErrorMessage) {
        this.setErrorMessage("Error occurred while updating event. Please try again.");
      }
    }

    // Clean up
    this.handleDragEnd();

    // Reset the dropping flag after a delay
    setTimeout(() => {
      this.isDropping = false;
    }, 300);
  }

  // Helper methods
  private cleanupDragState(): void {
    // Stop scrolling
    this.stopScrolling();

    // Remove drag ghost
    this.removeDragGhost();

    // Clean up document listeners
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }

  private createDragGhost(event: TimelineEvent, x: number, y: number): void {
    // Remove any existing ghost
    this.removeDragGhost();

    // Create a new ghost element
    const ghost = document.createElement("div");
    ghost.className = "timeline-drag-ghost";
    ghost.style.top = `${y - this.dragState.offset.y}px`;
    ghost.style.left = `${x - this.dragState.offset.x}px`;

    // Apply width from drag state
    if (this.dragState.eventWidth) {
      ghost.style.width = `${this.dragState.eventWidth}px`;
    }

    // Apply styling based on event properties
    if (event.backgroundColor) ghost.style.backgroundColor = event.backgroundColor;
    if (event.textColor) ghost.style.color = event.textColor;

    // Set content
    ghost.textContent = event.title || "Event";

    // Add to document
    document.body.appendChild(ghost);
    this.dragGhost = ghost;

    console.log("[TimelineDragManager] Created drag ghost", {
      x,
      y,
      title: event.title,
      width: this.dragState.eventWidth,
    });
  }

  private updateDragGhostPosition(x: number, y: number): void {
    if (!this.dragGhost) return;

    this.dragGhost.style.left = `${x - this.dragState.offset.x}px`;
    this.dragGhost.style.top = `${y - this.dragState.offset.y}px`;
  }

  public isCurrentlyDropping(): boolean {
    return this.isDropping;
  }

  private removeDragGhost(): void {
    if (this.dragGhost) {
      this.dragGhost.remove();
      this.dragGhost = null;
      console.log("[TimelineDragManager] Removed drag ghost");
    }
  }

  private checkForAutoScroll(x: number, y: number): void {
    if (!this.containerElement) return;

    // Only auto-scroll for event dragging, not for drag-to-create
    if (!this.dragState.isDragging) return;

    const rect = this.containerElement.getBoundingClientRect();

    let needsScrolling = false;

    // Calculate horizontal scroll speed
    if (x < rect.left + this.scrollThreshold) {
      this.horizontalScrollSpeed = -Math.ceil((this.scrollThreshold - (x - rect.left)) / 4);
      needsScrolling = true;
    } else if (x > rect.right - this.scrollThreshold) {
      this.horizontalScrollSpeed = Math.ceil((x - (rect.right - this.scrollThreshold)) / 4);
      needsScrolling = true;
    } else {
      this.horizontalScrollSpeed = 0;
    }

    // Calculate vertical scroll speed
    if (y < rect.top + this.scrollThreshold) {
      this.verticalScrollSpeed = -Math.ceil((this.scrollThreshold - (y - rect.top)) / 4);
      needsScrolling = true;
    } else if (y > rect.bottom - this.scrollThreshold) {
      this.verticalScrollSpeed = Math.ceil((y - (rect.bottom - this.scrollThreshold)) / 4);
      needsScrolling = true;
    } else {
      this.verticalScrollSpeed = 0;
    }

    // Start or stop scrolling as needed
    if (needsScrolling && !this.isScrolling) {
      this.startScrolling();
    } else if (!needsScrolling && this.isScrolling) {
      this.stopScrolling();
    }
  }

  private startScrolling(): void {
    if (this.isScrolling) return;

    this.isScrolling = true;
    this.lastScrollTime = Date.now();

    // Use requestAnimationFrame for smoother scrolling
    const scrollFrame = () => {
      if (!this.isScrolling) return;

      // Throttle for smoother scrolling
      const now = Date.now();
      if (now - this.lastScrollTime < 16) {
        // ~60fps
        this.animationFrameId = requestAnimationFrame(scrollFrame);
        return;
      }
      this.lastScrollTime = now;

      // Only continue scrolling if we're actually dragging
      if (!this.dragState.isDragging) {
        this.stopScrolling();
        return;
      }

      // Handle horizontal scrolling
      if (this.horizontalScrollSpeed !== 0 && this.containerElement) {
        this.containerElement.scrollLeft += this.horizontalScrollSpeed;

        // Sync header scroll
        if (this.headerElement) {
          this.headerElement.scrollLeft = this.containerElement.scrollLeft;
        }
      }

      // Handle vertical scrolling for the list, with enhanced handling for row navigation
      if (this.verticalScrollSpeed !== 0 && this.listElement) {
        // Update the scroll position
        this.currentScrollTop += this.verticalScrollSpeed;

        // Make sure we don't scroll past bounds
        this.currentScrollTop = Math.max(0, this.currentScrollTop);
        const maxScroll = this.resources.length * this.cellHeight;
        this.currentScrollTop = Math.min(maxScroll, this.currentScrollTop);

        // Use list's scrollTo method for virtualized list
        this.listElement.scrollTo(this.currentScrollTop);

        // Find the new resource index based on scroll position
        const approxIndex = Math.floor(this.currentScrollTop / this.cellHeight);
        const boundedIndex = Math.min(Math.max(0, approxIndex), this.resources.length - 1);

        // Only update the resource index if it changed
        if (this.currentResourceIndex !== boundedIndex) {
          this.updateResourceIndex(boundedIndex);
        }

        // Update drag ghost position for smoother visual
        if (this.dragGhost && this.dragState.isDragging) {
          const currentTop = parseFloat(this.dragGhost.style.top);
          this.dragGhost.style.top = `${currentTop + this.verticalScrollSpeed}px`;
        }
      }

      this.animationFrameId = requestAnimationFrame(scrollFrame);
    };

    this.animationFrameId = requestAnimationFrame(scrollFrame);
  }

  private stopScrolling(): void {
    if (!this.isScrolling) return;

    this.isScrolling = false;
    this.horizontalScrollSpeed = 0;
    this.verticalScrollSpeed = 0;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log("[TimelineDragManager] Stopped auto-scrolling");
  }

  private getCurrentScrollTop(): number {
    if (!this.listElement) return 0;

    if ("state" in this.listElement && typeof this.listElement.state === "object" && this.listElement.state !== null) {
      const state = this.listElement.state as any;
      return typeof state.scrollOffset === "number" ? state.scrollOffset : 0;
    }

    return 0;
  }

  private findResourceIndexFromPosition(mouseY: number): number | null {
    if (!this.containerElement) return null;

    const containerRect = this.containerElement.getBoundingClientRect();
    const yRelativeToTop = mouseY - containerRect.top;

    // Find all row elements
    const rowElements = this.containerElement.querySelectorAll(".virtualized-table-row");

    // If we're above all rows, return the first index
    if (yRelativeToTop <= 0) return 0;

    // Find the row the mouse is over
    for (let i = 0; i < rowElements.length; i++) {
      const row = rowElements[i] as HTMLElement;
      const rowRect = row.getBoundingClientRect();

      // Check if mouse is within this row's bounds
      if (mouseY >= rowRect.top && mouseY <= rowRect.bottom) {
        // For virtualized lists, get the index relative to visible rows
        const visibleIndex = i;

        // Get the actual resource index if possible
        const scrollOffset = this.getCurrentScrollTop();
        const approximateIndex = Math.floor(scrollOffset / this.cellHeight) + visibleIndex;
        return Math.min(approximateIndex, this.resources.length - 1);
      }
    }

    // If we're below all rows, return the last index
    return this.resources.length - 1;
  }

  // State update methods with observer notifications
  private updateDragCreateState(newState: DragCreateState): void {
    this.dragCreateState = newState;
    this.notifyObservers("dragCreateStateChange", newState);
  }

  private updateDragState(newState: DragState): void {
    this.dragState = newState;
    this.notifyObservers("dragStateChange", newState);
  }

  private updateResourceIndex(index: number | null): void {
    this.currentResourceIndex = index;
    this.notifyObservers("resourceIndexChange", index);
  }

  private notifyObservers(event: EventType, data: any): void {
    const callbacks = this.observers.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }
}
