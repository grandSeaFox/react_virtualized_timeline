import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { VirtualizedTimeline } from "../src";
import { TimelineEvent, TimelineView, EventDropInfo, EventResizeInfo } from "@/types";
import { resources, events } from "./data";
import "./styles.css";

const App: React.FC = () => {
  // State for current view and events
  const [view, setView] = useState<TimelineView>("daily");
  const [currentEvents, setCurrentEvents] = useState<TimelineEvent[]>(events);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Simulate loading delay for large dataset
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Handle view change
  const handleViewChange = (newView: TimelineView) => {
    setView(newView);
  };

  // Handle event click
  const handleEventClick = (event: TimelineEvent) => {
    console.log("Event clicked:", event);
    alert(`Clicked: ${event.title}`);
  };

  // Handle event drop (moving an event)
  const handleEventDrop = (info: EventDropInfo) => {
    console.log("Event dropped:", info);

    // Update the event with new dates and resource
    setCurrentEvents((prev) =>
      prev.map((event) =>
        event.id === info.event.id
          ? {
              ...event,
              resourceId: info.resourceId,
              start: info.start,
              end: info.end,
            }
          : event,
      ),
    );
  };

  // Handle event resize
  const handleEventResize = (info: EventResizeInfo) => {
    console.log("Event resized:", info);

    // Update the event with new end date
    setCurrentEvents((prev) => prev.map((event) => (event.id === info.event.id ? { ...event, end: info.end } : event)));
  };

  // Handle event creation
  const handleEventCreate = (newEventData: Omit<TimelineEvent, "id">) => {
    console.log("Creating new event:", newEventData);

    const newEvent: TimelineEvent = {
      ...newEventData,
      id: `event-${Date.now()}`,
      resourceId: newEventData.resourceId,
      title: newEventData.title,
      start: newEventData.start,
      end: newEventData.end,
    };

    setCurrentEvents((prev) => [...prev, newEvent]);
  };

  // Handle date navigation for daily view
  const handlePreviousDay = () => {
    const previousDay = new Date(currentDate);
    previousDay.setDate(previousDay.getDate() - 1);
    setCurrentDate(previousDay);
  };

  const handleNextDay = () => {
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setCurrentDate(nextDay);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Format the current date for display
  const formatCurrentDate = () => {
    if (view === "daily") {
      return currentDate.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else if (view === "monthly") {
      return currentDate.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
    } else {
      const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
      return `Q${quarter} ${currentDate.getFullYear()}`;
    }
  };

  // Check if currentDate is today
  const isToday = () => {
    const today = new Date();
    return (
      currentDate.getDate() === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <h2>Loading Timeline...</h2>
        <p>
          Preparing {resources.length} resources and {events.length} events
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="toolbar">
        <h1>Virtualized Timeline</h1>

        <div className="view-controls">
          <button className={view === "daily" ? "active" : ""} onClick={() => handleViewChange("daily")}>
            Daily View
          </button>
          <button className={view === "monthly" ? "active" : ""} onClick={() => handleViewChange("monthly")}>
            Monthly View
          </button>
          <button className={view === "quarterly" ? "active" : ""} onClick={() => handleViewChange("quarterly")}>
            Quarterly View
          </button>
        </div>

        <div className="timeline-controls">
          <button className="timeline-nav-button" onClick={handlePreviousDay}>
            {view === "daily" ? "Previous Day" : view === "monthly" ? "Previous Month" : "Previous Quarter"}
          </button>

          <div className="timeline-date-indicator">
            {formatCurrentDate()}
            {isToday() && <span className="today-badge">Today</span>}
          </div>

          <button className="timeline-nav-button" onClick={handleNextDay}>
            {view === "daily" ? "Next Day" : view === "monthly" ? "Next Month" : "Next Quarter"}
          </button>

          <button className="timeline-nav-button" onClick={handleToday}>
            Today
          </button>
        </div>

        <div className="stats">
          <div>Resources: {resources.length}</div>
          <div>Events: {currentEvents.length}</div>
        </div>
      </div>

      <div className="timeline-container">
        <VirtualizedTimeline
          events={currentEvents}
          resources={resources}
          view={view}
          initialDate={currentDate}
          onEventClick={handleEventClick}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          onEventCreate={handleEventCreate}
          editable={true}
          droppable={true}
          resizable={true}
          dailyViewOptions={{
            daysBefore: 7,
            daysAfter: 7,
            totalDaysRange: 30,
          }}
          dimensions={{
            cellWidth: 120,
            cellHeight: 50,
            headerHeight: 50,
            resourceLabelWidth: 200,
          }}
        />
      </div>
    </div>
  );
};

// Get the root element
const container = document.getElementById("root");
if (!container) throw new Error("Could not find root element");

// Create a root
const root = createRoot(container);

// Render the app
root.render(<App />);
