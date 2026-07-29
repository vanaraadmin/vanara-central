export interface SyncMetricsSnapshot {
  recordsRead: number;
  recordsWritten: number;
  recordsSkipped: number;
  recordsFailed: number;
}

export class SyncMetrics {
  recordsRead = 0;
  recordsWritten = 0;
  recordsSkipped = 0;
  recordsFailed = 0;

  read(count = 1): void {
    this.recordsRead += count;
  }

  written(count = 1): void {
    this.recordsWritten += count;
  }

  skipped(count = 1): void {
    this.recordsSkipped += count;
  }

  failed(count = 1): void {
    this.recordsFailed += count;
  }

  snapshot(): SyncMetricsSnapshot {
    return {
      recordsRead: this.recordsRead,
      recordsWritten: this.recordsWritten,
      recordsSkipped: this.recordsSkipped,
      recordsFailed: this.recordsFailed,
    };
  }
}
