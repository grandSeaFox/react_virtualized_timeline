import { useState, useCallback, useEffect, useRef } from "react";
import { VirtualizationConfig } from "@/types";

interface VirtualizationState {
  startIndex: number;
  endIndex: number;
  visibleItems: number[];
}

export function useVirtualization({ itemCount, estimatedItemSize, overscanCount = 3 }: VirtualizationConfig) {
  const isMounted = useRef(true);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [virtualizationState, setVirtualizationState] = useState<VirtualizationState>({
    startIndex: 0,
    endIndex: 0,
    visibleItems: [],
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Calculate visible range of items
  const calculateRange = useCallback(() => {
    if (!isMounted.current || viewportHeight === 0) return;

    const estimatedStartIndex = Math.floor(scrollTop / estimatedItemSize);
    const startIndex = Math.max(0, estimatedStartIndex - overscanCount);

    const visibleItemCount = Math.ceil(viewportHeight / estimatedItemSize);
    const endIndex = Math.min(itemCount - 1, estimatedStartIndex + visibleItemCount + overscanCount);

    const visibleItems = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i);

    setVirtualizationState({
      startIndex,
      endIndex,
      visibleItems,
    });
  }, [viewportHeight, scrollTop, itemCount, estimatedItemSize, overscanCount]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!isMounted.current) return;
    const { scrollTop } = event.currentTarget;
    setScrollTop(scrollTop);
  }, []);

  // Handle resize events
  useEffect(() => {
    if (!isMounted.current) return;

    const handleResize = () => {
      // We would measure the actual container here in a real implementation
      if (typeof window !== "undefined") {
        setViewportHeight(window.innerHeight);
      }
    };

    handleResize();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }
  }, []);

  // Recalculate visible range when dependencies change
  useEffect(() => {
    if (isMounted.current) {
      calculateRange();
    }
  }, [calculateRange, viewportHeight, scrollTop, itemCount]);

  // Calculate position and style for an item
  const getItemStyle = useCallback(
    (index: number) => {
      return {
        position: "absolute" as const,
        top: index * estimatedItemSize,
        height: estimatedItemSize,
        left: 0,
        right: 0,
      };
    },
    [estimatedItemSize],
  );

  // Calculate total content height
  const totalHeight = itemCount * estimatedItemSize;

  return {
    virtualItems: virtualizationState.visibleItems.map((index) => ({
      index,
      style: getItemStyle(index),
    })),
    totalHeight,
    startIndex: virtualizationState.startIndex,
    endIndex: virtualizationState.endIndex,
    handleScroll,
  };
}
