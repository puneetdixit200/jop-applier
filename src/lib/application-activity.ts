import type { ApplicationEvent, Communication, Document } from "./tauri-api";

export type ApplicationActivityKind = "event" | "document" | "communication";

export type ApplicationActivitySources = {
  events: ApplicationEvent[];
  documents: Document[];
  communications: Communication[];
};

export type ApplicationActivityTimelineItem = {
  id: string;
  kind: ApplicationActivityKind;
  label: string;
  detail: string;
  timestamp: string;
  timestampLabel: string;
};

export type ApplicationActivityListItem = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  timestampLabel: string;
};

export type ApplicationActivity = {
  summary: {
    timelineCount: number;
    eventCount: number;
    documentCount: number;
    communicationCount: number;
  };
  timeline: ApplicationActivityTimelineItem[];
  documents: ApplicationActivityListItem[];
  communications: ApplicationActivityListItem[];
};

export function buildApplicationActivity(sources: ApplicationActivitySources): ApplicationActivity {
  const eventLinkedDocumentIds = new Set(
    sources.events
      .map((event) => metadataString(event.metadata, "document_id"))
      .filter((value): value is string => Boolean(value)),
  );
  const eventLinkedCommunicationIds = new Set(
    sources.events
      .map((event) => metadataString(event.metadata, "communication_id"))
      .filter((value): value is string => Boolean(value)),
  );

  const eventItems = sources.events.map(eventTimelineItem);
  const documentTimelineItems = sources.documents
    .filter((document) => !eventLinkedDocumentIds.has(document.id))
    .map(documentTimelineItem);
  const communicationTimelineItems = sources.communications
    .filter((communication) => !eventLinkedCommunicationIds.has(communication.id))
    .map(communicationTimelineItem);
  const timeline = sortByTimestampDesc([
    ...eventItems,
    ...documentTimelineItems,
    ...communicationTimelineItems,
  ]);

  return {
    summary: {
      timelineCount: timeline.length,
      eventCount: sources.events.length,
      documentCount: sources.documents.length,
      communicationCount: sources.communications.length,
    },
    timeline,
    documents: sortByTimestampDesc(sources.documents.map(documentListItem)),
    communications: sortByTimestampDesc(sources.communications.map(communicationListItem)),
  };
}

function eventTimelineItem(event: ApplicationEvent): ApplicationActivityTimelineItem {
  return {
    id: `event-${event.id}`,
    kind: "event",
    label: titleCase(event.event_type),
    detail: event.description ?? event.new_value ?? event.old_value ?? "No details",
    timestamp: event.created_at,
    timestampLabel: formatTimestamp(event.created_at),
  };
}

function documentTimelineItem(document: Document): ApplicationActivityTimelineItem {
  const item = documentListItem(document);
  return {
    ...item,
    id: `document-${document.id}`,
    kind: "document",
  };
}

function communicationTimelineItem(communication: Communication): ApplicationActivityTimelineItem {
  const item = communicationListItem(communication);
  return {
    ...item,
    id: `communication-${communication.id}`,
    kind: "communication",
  };
}

function documentListItem(document: Document): ApplicationActivityListItem {
  const detail = document.ai_model_used
    ? `${document.file_name} · ${document.ai_model_used}`
    : document.file_name;

  return {
    id: document.id,
    label: `${documentTypeLabel(document.type)} v${document.version}`,
    detail,
    timestamp: document.created_at,
    timestampLabel: formatTimestamp(document.created_at),
  };
}

function communicationListItem(communication: Communication): ApplicationActivityListItem {
  const timestamp = communication.sent_at ?? communication.created_at;
  return {
    id: communication.id,
    label: `${titleCase(communication.direction)} ${titleCase(communication.type)}`,
    detail: communication.subject ?? communication.body ?? communication.email_id ?? "No subject",
    timestamp,
    timestampLabel: formatTimestamp(timestamp),
  };
}

function documentTypeLabel(value: string) {
  if (value === "cover_letter") {
    return "Cover Letter";
  }
  return titleCase(value);
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function sortByTimestampDesc<Item extends { id: string; timestamp: string }>(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    const timeDiff = timestampValue(right.timestamp) - timestampValue(left.timestamp);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return left.id.localeCompare(right.id);
  });
}

function timestampValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return `${date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    })
    .replace(",", "")} UTC`;
}

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
