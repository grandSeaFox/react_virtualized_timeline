import { TimelineEvent, TimelineResource } from "@/types";
import { addDays, startOfDay, format, addMonths, subMonths, differenceInDays } from "date-fns";

// Generate sample resources
export const generateResources = (count: number = 800): TimelineResource[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: `resource-${index + 1}`,
    title: `Resource ${index + 1}`,
    department:
      index % 5 === 0
        ? "Marketing"
        : index % 4 === 0
          ? "Sales"
          : index % 3 === 0
            ? "Engineering"
            : index % 2 === 0
              ? "Support"
              : "Operations",
  }));
};

// Define event types with associated colors and typical durations
const eventTypes = [
  { type: "Meeting", color: "#3788d8", minDuration: 1, maxDuration: 1 }, // Meetings are usually 1 day
  { type: "Task", color: "#e67c73", minDuration: 1, maxDuration: 3 }, // Tasks can be 1-3 days
  { type: "Project", color: "#33a853", minDuration: 3, maxDuration: 7 }, // Projects typically 3-7 days
  { type: "Break", color: "#fbbc04", minDuration: 1, maxDuration: 1 }, // Breaks are usually 1 day
  { type: "Planning", color: "#8e24aa", minDuration: 2, maxDuration: 4 }, // Planning sessions 2-4 days
];

// Generate sample events with no overlaps, supporting multi-day events
export const generateEvents = (resources: TimelineResource[], targetCount: number = 15000): TimelineEvent[] => {
  const now = new Date();
  const events: TimelineEvent[] = [];

  // Map to track which cells are occupied
  // Key format: "resourceId_dateString"
  const occupiedCells = new Map<string, boolean>();

  // Define date range
  const startDate = subMonths(now, 6);
  const endDate = addMonths(now, 6);
  const totalDateRange = differenceInDays(endDate, startDate);

  // Maximum attempts to find unoccupied cells
  const maxAttempts = targetCount * 5;
  let attempts = 0;

  while (events.length < targetCount && attempts < maxAttempts) {
    attempts++;

    // Select a random resource
    const resourceIndex = Math.floor(Math.random() * resources.length);
    const resource = resources[resourceIndex];

    // Select a random event type
    const eventTypeIndex = Math.floor(Math.random() * eventTypes.length);
    const { type, color, minDuration, maxDuration } = eventTypes[eventTypeIndex];

    // Determine event duration (in days)
    const duration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;

    // Generate a random start date within our range
    // Adjust to ensure end date falls within range
    const maxStartDayOffset = totalDateRange - duration;
    const randomDays = Math.floor(Math.random() * maxStartDayOffset);
    const eventStartDate = startOfDay(addDays(startDate, randomDays));
    const eventEndDate = addDays(eventStartDate, duration);

    // Check if all days in the event duration are available
    let allCellsAvailable = true;
    const cellsToOccupy = [];

    // Check each day of the event duration
    for (let day = 0; day < duration; day++) {
      const currentDate = addDays(eventStartDate, day);
      const dateString = format(currentDate, "yyyy-MM-dd");
      const cellKey = `${resource.id}_${dateString}`;

      if (occupiedCells.has(cellKey)) {
        allCellsAvailable = false;
        break;
      }

      cellsToOccupy.push(cellKey);
    }

    // Skip if any cell in the duration is already occupied
    if (!allCellsAvailable) {
      continue;
    }

    // Mark all cells in the duration as occupied
    for (const cellKey of cellsToOccupy) {
      occupiedCells.set(cellKey, true);
    }

    // Create the multi-day event
    events.push({
      id: `event-${events.length + 1}`,
      resourceId: resource.id,
      title: `${type} ${events.length + 1}`,
      start: eventStartDate,
      end: eventEndDate,
      backgroundColor: color,
      borderColor: color,
      textColor: "#ffffff",
      type,
      duration,
      editable: Math.random() > 0.2, // 80% of events are editable
      draggable: Math.random() > 0.3, // 70% of events are draggable
      resizable: Math.random() > 0.3, // 70% of events are resizable
    });
  }

  console.log(
    `Generated ${events.length} events (${events.filter((e) => e.duration > 1).length} multi-day) after ${attempts} attempts`,
  );

  return events;
};

// Distributed version with balanced events per resource and multi-day support
export const generateEventsDistributed = (
  resources: TimelineResource[],
  eventsPerResource: number = 50,
): TimelineEvent[] => {
  const now = new Date();
  const events: TimelineEvent[] = [];

  // Map to track which cells are occupied
  const occupiedCells = new Map<string, boolean>();

  // Define date range - 3 months before and 9 months after current date
  const startDate = subMonths(now, 3);
  const endDate = addMonths(now, 9);
  const totalDateRange = differenceInDays(endDate, startDate);

  // For each resource, generate events
  resources.forEach((resource) => {
    // Track attempts per resource to avoid infinite loops
    let resourceAttempts = 0;
    const maxResourceAttempts = eventsPerResource * 10;
    let eventsCreated = 0;

    // Calculate percentage of multi-day events (30% by default)
    const multiDayEventPercentage = 0.3;
    const targetMultiDayEvents = Math.round(eventsPerResource * multiDayEventPercentage);
    let multiDayEventsCreated = 0;

    while (eventsCreated < eventsPerResource && resourceAttempts < maxResourceAttempts) {
      resourceAttempts++;

      // Determine if this should be a multi-day event
      const shouldBeMultiDay = multiDayEventsCreated < targetMultiDayEvents;

      // Select an appropriate event type
      let eventTypeIndex;
      if (shouldBeMultiDay) {
        // Select only from event types with possible multi-day durations
        const multiDayTypes = eventTypes.filter((type) => type.maxDuration > 1);
        eventTypeIndex = Math.floor(Math.random() * multiDayTypes.length);
        const { type, color, minDuration, maxDuration } = multiDayTypes[eventTypeIndex];

        // Determine event duration (in days) - ensure it's at least 2 days
        const duration = Math.max(2, Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration);

        // Generate a random start date within our range
        const maxStartDayOffset = totalDateRange - duration;
        const randomDays = Math.floor(Math.random() * maxStartDayOffset);
        const eventStartDate = startOfDay(addDays(startDate, randomDays));
        const eventEndDate = addDays(eventStartDate, duration);

        // Check if all days in the event duration are available
        let allCellsAvailable = true;
        const cellsToOccupy = [];

        // Check each day of the event duration
        for (let day = 0; day < duration; day++) {
          const currentDate = addDays(eventStartDate, day);
          const dateString = format(currentDate, "yyyy-MM-dd");
          const cellKey = `${resource.id}_${dateString}`;

          if (occupiedCells.has(cellKey)) {
            allCellsAvailable = false;
            break;
          }

          cellsToOccupy.push(cellKey);
        }

        // Skip if any cell in the duration is already occupied
        if (!allCellsAvailable) {
          continue;
        }

        // Mark all cells in the duration as occupied
        for (const cellKey of cellsToOccupy) {
          occupiedCells.set(cellKey, true);
        }

        // Create the multi-day event
        events.push({
          id: `event-${resource.id}-${eventsCreated + 1}`,
          resourceId: resource.id,
          title: `${type} ${resource.title.split(" ")[1]}-${eventsCreated + 1}`,
          start: eventStartDate,
          end: eventEndDate,
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          type,
          duration,
          editable: Math.random() > 0.2,
          draggable: Math.random() > 0.3,
          resizable: Math.random() > 0.3,
        });

        multiDayEventsCreated++;
        eventsCreated++;
      } else {
        // Single-day event logic
        // Select from all event types but force duration to 1
        eventTypeIndex = Math.floor(Math.random() * eventTypes.length);
        const { type, color } = eventTypes[eventTypeIndex];

        // Generate a random date within our range
        const randomDays = Math.floor(Math.random() * totalDateRange);
        const eventDate = startOfDay(addDays(startDate, randomDays));

        // Create a unique cell key
        const dateString = format(eventDate, "yyyy-MM-dd");
        const cellKey = `${resource.id}_${dateString}`;

        // Skip if cell is already occupied
        if (occupiedCells.has(cellKey)) {
          continue;
        }

        // Mark cell as occupied
        occupiedCells.set(cellKey, true);

        // Create the single-day event
        events.push({
          id: `event-${resource.id}-${eventsCreated + 1}`,
          resourceId: resource.id,
          title: `${type} ${resource.title.split(" ")[1]}-${eventsCreated + 1}`,
          start: eventDate,
          end: addDays(eventDate, 1),
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          type,
          duration: 1,
          editable: Math.random() > 0.2,
          draggable: Math.random() > 0.3,
          resizable: Math.random() > 0.3,
        });

        eventsCreated++;
      }
    }
  });

  // Calculate stats for logging
  const multiDayEvents = events.filter((e) => (e as any).duration > 1).length;
  const totalDuration = events.reduce((sum, e) => sum + ((e as any).duration || 1), 0);

  console.log(
    `Generated ${events.length} events (${multiDayEvents} multi-day, ${((multiDayEvents / events.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Average event duration: ${(totalDuration / events.length).toFixed(2)} days`);

  return events;
};

// Create resources
export const resources = generateResources(700);

// Create events - choose one of the generation methods
// export const events = generateEvents(resources, 5000);
export const events = generateEventsDistributed(resources, 50);
