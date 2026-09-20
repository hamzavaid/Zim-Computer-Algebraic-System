export interface HistoryEntry {
  readonly expression: string;
  readonly createdAt?: string;
}

export interface HistoryState {
  readonly version: 1;
  readonly entries: readonly HistoryEntry[];
}

export function clearHistory(): HistoryState {
  return { version: 1, entries: [] };
}

export function migrateHistory(serialized: string | null): HistoryState {
  if (!serialized) return clearHistory();
  try {
    const value = JSON.parse(serialized) as unknown;
    if (Array.isArray(value)) {
      return {
        version: 1,
        entries: value
          .filter((entry): entry is string => typeof entry === "string")
          .map((expression) => ({ expression })),
      };
    }
    if (value && typeof value === "object") {
      const record = value as { version?: unknown; entries?: unknown };
      if (record.version === 1 && Array.isArray(record.entries)) {
        return {
          version: 1,
          entries: record.entries.filter(
            (entry): entry is HistoryEntry =>
              Boolean(entry) &&
              typeof entry === "object" &&
              typeof (entry as HistoryEntry).expression === "string",
          ),
        };
      }
    }
  } catch {
    // Corrupt local state is replaced by an empty, versioned history.
  }
  return clearHistory();
}
