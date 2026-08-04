export interface WarapornKbBackupSummary {
  backupId: string;
  objectPrefix: string;
  status: "PREPARING" | "UPLOADING" | "VERIFYING" | "COMPLETE";
  createdAt: string;
  completedAt: string | null;
  topLevelCollections: string[];
  totalFileCount: number;
  markdownFileCount: number;
  totalBytes: number;
  manifestChecksum: string;
}

export interface WarapornKbBackupsResponse {
  latest: WarapornKbBackupSummary | null;
  backups: WarapornKbBackupSummary[];
}

