# Virtualized Timeline

A high-performance virtualized timeline component for React, designed to handle large datasets with ease.

## Features

- **Virtualization**: Efficiently renders only the visible elements, enabling smooth performance with thousands of events and resources
- **Multiple Views**: Supports monthly and quarterly views
- **Interactive**: Full drag-and-drop support for event creation, movement, and resizing
- **Customizable**: Extensive styling and content customization options
- **TypeScript Support**: Written in TypeScript with comprehensive type definitions

## Requirements

- **Resources**: Supports up to 800+ resources with no performance issues
- **Events**: Efficiently handles 15,000+ events using virtualization techniques
- **React**: Built for React 18+
- **TypeScript**: Full TypeScript support

## Installation

```bash
npm install virtualized-timeline
# or
yarn add virtualized-timeline
```

## Basic Usage

```tsx
import React, { useState } from 'react';
import { VirtualizedTimeline } from 'virtualized-timeline';
import type { TimelineEvent, TimelineResource } from 'virtualized-timeline';

const MyCalendar: React.FC = () => {
  // Sample data
  const resources: TimelineResource[] = [
    { id: 'resource-1', title: 'Resource 1' },
    { id: 'resource-2', title: 'Resource 2' },
    // ...more resources
  ];

  const [events, setEvents] = useState<TimelineEvent[]>([
    {
      id: 'event-1',
      resourceId: 'resource-1',
      title: 'Meeting',
      start: new Date(2023, 4, 10, 10, 0),
      end: new Date(2023, 4, 10, 12, 0),
      backgroundColor: '#3788d8'
    },
    // ...more events
  ]);

  // Event handlers
  const handleEventClick = (event: TimelineEvent) => {
    console.log('Event clicked:', event);
  };

  const handleEventDrop = (info: { event: TimelineEvent; resourceId: string; start: Date; end: Date }) => {
    setEvents(prev =>
      prev.map(evt =>
        evt.id === info.event.id
          ? { ...evt, resourceId: info.resourceId, start: info.start, end: info.end }
          : evt
      )
    );
  };

  return (
    <VirtualizedTimeline
      events={events}
      resources={resources}
      view="monthly"
      onEventClick={handleEventClick}
      onEventDrop={handleEventDrop}
    />
  );
};

export default MyCalendar;
```

## Props

### Main Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `events` | `TimelineEvent[]` | Required | Array of events to display |
| `resources` | `TimelineResource[]` | Required | Array of resources |
| `view` | `'monthly' \| 'quarterly'` | `'monthly'` | Current view mode |
| `initialDate` | `Date` | `new Date()` | Initial date to focus on |
| `dimensions` | `Partial<TimelineDimensions>` | See below | Size configuration for timeline components |
| `onEventClick` | `(event: TimelineEvent) => void` | - | Event click handler |
| `onEventDrop` | `(info: EventDropInfo) => void` | - | Event drop (move) handler |
| `onEventResize` | `(info: EventResizeInfo) => void` | - | Event resize handler |
| `onEventCreate` | `(info: Omit<TimelineEvent, 'id'>) => void` | - | Event creation handler |
| `onDateRangeChange` | `(range: TimelineRange) => void` | - | Date range change handler |
| `editable` | `boolean` | `true` | Enable/disable all event editing |
| `droppable` | `boolean` | `true` | Enable/disable event dropping and creation |
| `resizable` | `boolean` | `true` | Enable/disable event resizing |
| `eventContent` | `(event: TimelineEvent) => React.ReactNode` | - | Custom event content renderer |
| `resourceContent` | `(resource: TimelineResource) => React.ReactNode` | - | Custom resource content renderer |
| `className` | `string` | - | Additional CSS class for the component |
| `style` | `React.CSSProperties` | - | Additional inline styles |

### Default Dimensions

```typescript
const DEFAULT_DIMENSIONS = {
  cellWidth: 150,
  cellHeight: 60,
  headerHeight: 50,
  resourceLabelWidth: 200
};
```

## Types

### TimelineEvent

```typescript
interface TimelineEvent {
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
  [key: string]: any; // Custom properties
}
```

### TimelineResource

```typescript
interface TimelineResource {
  id: string;
  title: string;
  [key: string]: any; // Custom properties
}
```

## Performance Tips

1. **Use the provided virtualization**: The component is optimized to handle large datasets through virtualization.
2. **Limit concurrent visible items**: Set reasonable cell dimensions to avoid rendering too many events at once.
3. **Use memoization**: Wrap event handlers in `useCallback` and derived data with `useMemo`.
4. **Optimize event lookups**: Use the ID-based event lookup for better performance when handling interactions.

## Browser Support

- Chrome, Firefox, Safari, Edge (latest versions)
- IE is not supported

## License

MIT