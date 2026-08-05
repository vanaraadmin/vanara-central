export type SocialPostStatus =
  | "QUEUED"
  | "PREPARING_IMAGE"
  | "IMAGE_READY"
  | "CAPTIONING"
  | "READY_TO_POST"
  | "POSTING"
  | "POSTED"
  | "FAILED"
  | "CANCELLED";

export interface SocialPostQueueItem {
  id: number;
  originalObjectKey: string;
  processedObjectKey: string | null;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedByName: string;
  status: SocialPostStatus;
  queuedAt: string;
  processingStartedAt: string | null;
  imagePreparedAt: string | null;
  captionPreparedAt: string | null;
  scheduledPublishAt: string | null;
  postedAt: string | null;
  failedAt: string | null;
  updatedAt: string;
  attemptCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  openaiRequestCount: number;
  estimatedCostUsd: number;
}

export interface SocialAutomationOverview {
  summary: Record<SocialPostStatus, number>;
  latest: SocialPostQueueItem[];
}

export interface SocialAutomationOverviewResponse {
  success: boolean;
  data?: SocialAutomationOverview;
  error?: string;
}

export interface SocialPostQueueItemResponse {
  success: boolean;
  data?: SocialPostQueueItem;
  error?: string;
}

export interface PrepareSocialImageResult {
  processed: boolean;
  item: SocialPostQueueItem | null;
}

export interface PrepareSocialImageResponse {
  success: boolean;
  data?: PrepareSocialImageResult;
  error?: string;
}

export interface PrepareSocialCaptionResult {
  processed: boolean;
  item: SocialPostQueueItem | null;
}

export interface PrepareSocialCaptionResponse {
  success: boolean;
  data?: PrepareSocialCaptionResult;
  error?: string;
}

export interface PublishSocialPostResult {
  published: boolean;
  cleaned: boolean;
  facebookPostId: string | null;
  instagramPostId: string | null;
}

export interface PublishSocialPostResponse {
  success: boolean;
  data?: PublishSocialPostResult;
  error?: string;
}
