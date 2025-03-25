import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TimelineEvent } from "@/types";

interface ReservationModalProps {
  isOpen: boolean;
  resourceId: string | null;
  resourceName: string;
  startDate: Date | null;
  endDate: Date | null;
  onClose: () => void;
  onCreateReservation: (event: Omit<TimelineEvent, "id">) => void;
}

const ReservationModal: React.FC<ReservationModalProps> = ({
  isOpen,
  resourceId,
  resourceName,
  startDate,
  endDate,
  onClose,
  onCreateReservation,
}) => {
  // State to track if portal element is ready
  const [mounted, setMounted] = useState(false);

  // Local modal state that won't affect parent component
  const [localData, setLocalData] = useState({
    title: "",
    description: "",
    color: "#3788d8",
  });

  // Create portal root element on mount
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset and initialize the local state when the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalData({
        title: "",
        description: "",
        color: "#3788d8",
      });
    }
  }, [isOpen]);

  // Handler for all input changes to update only the local state
  const handleInputChange = (field: string, value: string) => {
    setLocalData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Don't render anything if the modal is closed or missing required props
  if (!isOpen || !resourceId || !startDate || !endDate || !mounted) {
    return null;
  }

  const formatDate = (date: Date | null) => {
    if (!date) return "";
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Create the event object only when submitting the form
    const newEvent: Omit<TimelineEvent, "id"> = {
      title: localData.title.trim() || "Untitled Reservation",
      description: localData.description,
      start: startDate,
      end: endDate,
      resourceId: resourceId,
      backgroundColor: localData.color,
      textColor: "#ffffff",
      draggable: true,
    };

    // Only now pass the complete event to the parent
    onCreateReservation(newEvent);

    // Close the modal
    onClose();
  };

  // Render modal content
  const modalContent = (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        // Close modal when clicking the overlay background
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "20px",
          width: "400px",
          maxWidth: "90%",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>New Reservation</h2>

        <div style={{ marginBottom: "15px" }}>
          <div>
            <strong>Resource:</strong> {resourceName}
          </div>
          <div>
            <strong>From:</strong> {formatDate(startDate)}
          </div>
          <div>
            <strong>To:</strong> {formatDate(endDate)}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "15px" }}>
            <label htmlFor="title" style={{ display: "block", marginBottom: "5px" }}>
              Title
            </label>
            <input
              id="title"
              type="text"
              value={localData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Enter reservation title"
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label htmlFor="description" style={{ display: "block", marginBottom: "5px" }}>
              Description
            </label>
            <textarea
              id="description"
              value={localData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Enter reservation description"
              rows={3}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ddd",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label htmlFor="color" style={{ display: "block", marginBottom: "5px" }}>
              Color
            </label>
            <input
              id="color"
              type="color"
              value={localData.color}
              onChange={(e) => handleInputChange("color", e.target.value)}
              style={{
                width: "100%",
                height: "40px",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "1px solid #ddd",
                backgroundColor: "#f5f5f5",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#3788d8",
                color: "white",
                cursor: "pointer",
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ReservationModal;
