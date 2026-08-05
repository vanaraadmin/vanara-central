import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import { loadSocialAutomationOverview, prepareSocialCaption, prepareSocialImage, publishSocialPost, uploadSocialPhoto } from "../services/social.service";
import type { SocialPostQueueItem, SocialPostStatus } from "../types/social";
import "../styles/SocialAutomationPage.css";

const statusLabels: Record<SocialPostStatus, string> = {
  QUEUED: "Queued",
  PREPARING_IMAGE: "Preparing image",
  IMAGE_READY: "Image ready",
  CAPTIONING: "Captioning",
  READY_TO_POST: "Ready to post",
  POSTING: "Posting",
  POSTED: "Posted",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatContentType(value: string): string {
  if (value === "image/jpeg") return "JPG";
  if (value === "image/png") return "PNG";
  if (value === "image/webp") return "WebP";
  return "Image";
}

function SummaryStrip({ summary }: { summary?: Partial<Record<SocialPostStatus, number>> }) {
  const stats = [
    { label: "Queued", value: summary?.QUEUED ?? 0, tone: "queued" },
    { label: "Image ready", value: summary?.IMAGE_READY ?? 0, tone: "ready" },
    { label: "Ready to post", value: summary?.READY_TO_POST ?? 0, tone: "posted" },
    { label: "Failed", value: summary?.FAILED ?? 0, tone: "failed" },
  ];

  return (
    <dl className="social-summary-strip" aria-label="Social queue summary">
      {stats.map((stat) => (
        <div className={`social-summary-strip__item social-summary-strip__item--${stat.tone}`} key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function QueueItem({
  item,
  onPrepare,
  onPrepareCaption,
  onPublish,
  preparing,
  captioning,
  publishing,
}: {
  item: SocialPostQueueItem;
  onPrepare(item: SocialPostQueueItem): void;
  onPrepareCaption(item: SocialPostQueueItem): void;
  onPublish(item: SocialPostQueueItem): void;
  preparing: boolean;
  captioning: boolean;
  publishing: boolean;
}) {
  const canPrepare = item.status === "QUEUED";
  const canPrepareCaption = item.status === "IMAGE_READY";
  const canPublish = item.status === "READY_TO_POST";
  return (
    <li className={`social-queue-item social-queue-item--${item.status.toLowerCase().replaceAll("_", "-")}`}>
      <span className="social-queue-item__thumb" aria-hidden="true" />
      <span className="social-queue-item__main">
        <strong className="social-queue-item__filename" title={item.originalFileName}>
          {item.originalFileName}
        </strong>
        <small className="social-queue-item__meta">
          {formatDateTime(item.queuedAt)} - {formatSize(item.byteSize)} - {formatContentType(item.contentType)}
        </small>
        {item.status === "FAILED" && item.failureMessage ? (
          <span className="social-queue-item__failure">{item.failureMessage}</span>
        ) : null}
      </span>
      <span className="social-queue-item__actions">
        <span className="social-status">{statusLabels[item.status]}</span>
        {canPrepare ? (
          <button
            aria-label={`Prepare image for ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={preparing}
            onClick={() => onPrepare(item)}
            type="button"
          >
            {preparing ? "Preparing" : "Prepare Image"}
          </button>
        ) : null}
        {canPrepareCaption ? (
          <button
            aria-label={`Prepare caption for ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={captioning}
            onClick={() => onPrepareCaption(item)}
            type="button"
          >
            {captioning ? "Captioning" : "Prepare Caption"}
          </button>
        ) : null}
        {canPublish ? (
          <button
            aria-label={`Publish ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={publishing}
            onClick={() => onPublish(item)}
            type="button"
          >
            {publishing ? "Publishing" : "Publish"}
          </button>
        ) : null}
      </span>
    </li>
  );
}

export default function SocialAutomationPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const replaceSelectedFile = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = file ? URL.createObjectURL(file) : null;
    previewUrlRef.current = nextPreviewUrl;
    setSelectedFile(file);
    setSelectedPreviewUrl(nextPreviewUrl);
  };

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const overview = useQuery({
    queryKey: ["social-automation", "overview"],
    queryFn: ({ signal }) => loadSocialAutomationOverview(signal),
    refetchInterval: 60_000,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadSocialPhoto(file),
    onSuccess: async () => {
      replaceSelectedFile(null);
      setNotice("Queued");
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const prepare = useMutation({
    mutationFn: (item: SocialPostQueueItem) => prepareSocialImage(item.id),
    onSuccess: async () => {
      setNotice("Image ready");
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const caption = useMutation({
    mutationFn: (item: SocialPostQueueItem) => prepareSocialCaption(item.id),
    onSuccess: async () => {
      setNotice("Ready to post");
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const publish = useMutation({
    mutationFn: (item: SocialPostQueueItem) => publishSocialPost(item.id),
    onSuccess: async () => {
      setNotice("Published and cleaned");
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const canUpload = Boolean(selectedFile && !upload.isPending);
  const latest = overview.data?.latest ?? [];
  const summary = overview.data?.summary;

  return (
    <WorkspaceShell title="Social Automation" stickyNavigationTitle="Social Automation" workspace="social" bodyClassName="social-automation-page" wide>
      <VanaraGlassRegion className="social-upload" ariaLabelledBy="social-upload-title">
        <VanaraSectionHeader
          eyebrow="Owner"
          headingId="social-upload-title"
          meta={summary ? `${summary.QUEUED} queued` : "Queue"}
          title="Next Social Photo"
        />

        <form
          className="social-upload__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedFile) upload.mutate(selectedFile);
          }}
        >
          <label className="social-dropzone">
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={upload.isPending}
              onChange={(event) => {
                setNotice(null);
                replaceSelectedFile(event.currentTarget.files?.[0] ?? null);
              }}
              ref={inputRef}
              type="file"
            />
            <span className={selectedPreviewUrl ? "social-dropzone__mark social-dropzone__mark--preview" : "social-dropzone__mark"} aria-hidden="true">
              {selectedPreviewUrl ? <img alt="" src={selectedPreviewUrl} /> : null}
            </span>
            <span className="social-dropzone__copy">
              <strong title={selectedFile?.name}>{selectedFile ? selectedFile.name : "Choose photo"}</strong>
              <small>{selectedFile ? `${formatSize(selectedFile.size)} - ${formatContentType(selectedFile.type)}` : "JPG, PNG or WebP. HEIC is not supported."}</small>
            </span>
          </label>

          <button className="vc-primary-action social-upload__button" disabled={!canUpload} type="submit">
            {upload.isPending ? "Queueing" : "Queue Photo"}
          </button>
        </form>

        {notice ? <p className="social-upload__notice">{notice}</p> : null}
        {upload.isError ? <p className="social-upload__error">{upload.error instanceof Error ? upload.error.message : "Photo could not be queued"}</p> : null}
      </VanaraGlassRegion>

      <VanaraGlassRegion className="social-history" ariaLabelledBy="social-history-title">
        <VanaraSectionHeader
          eyebrow="Status"
          headingId="social-history-title"
          meta={summary ? `${summary.READY_TO_POST} ready` : "Latest"}
          title="Publishing Queue"
        />
        <SummaryStrip summary={summary} />

        {overview.isLoading ? <PageLoading /> : null}
        {overview.isError && !overview.data ? <PageError onRetry={() => void overview.refetch()} /> : null}
        {overview.data && latest.length === 0 ? (
          <section className="social-empty" aria-label="No queued photos">
            <span aria-hidden="true" />
            <h2>No photos waiting</h2>
            <p>Add one resort photo for the next post.</p>
          </section>
        ) : null}
        {latest.length > 0 ? (
          <ul className="social-queue-list" aria-label="Latest queued photos">
            {latest.map((item) => (
              <QueueItem
                item={item}
                key={item.id}
                onPrepare={(queuedItem) => prepare.mutate(queuedItem)}
                onPrepareCaption={(readyItem) => caption.mutate(readyItem)}
                onPublish={(readyItem) => publish.mutate(readyItem)}
                preparing={prepare.isPending && prepare.variables?.id === item.id}
                captioning={caption.isPending && caption.variables?.id === item.id}
                publishing={publish.isPending && publish.variables?.id === item.id}
              />
            ))}
          </ul>
        ) : null}
        {prepare.isError ? <p className="social-upload__error">{prepare.error instanceof Error ? prepare.error.message : "Image could not be prepared"}</p> : null}
        {caption.isError ? <p className="social-upload__error">{caption.error instanceof Error ? caption.error.message : "Caption could not be prepared"}</p> : null}
        {publish.isError ? <p className="social-upload__error">{publish.error instanceof Error ? publish.error.message : "Post could not be published"}</p> : null}
      </VanaraGlassRegion>
    </WorkspaceShell>
  );
}
