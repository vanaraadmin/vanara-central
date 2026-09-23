import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import { loadSocialAutomationOverview, prepareSocialCaption, prepareSocialImage, publishSocialPost, uploadSocialPhoto } from "../services/social.service";
import type { SocialPostQueueItem, SocialPostStatus } from "../types/social";
import { useLanguage } from "../providers/language.context";
import "../styles/SocialAutomationPage.css";

const statusLabels: Record<SocialPostStatus, [string, string]> = {
  QUEUED: ["Queued", "อยู่ในคิว"],
  PREPARING_IMAGE: ["Preparing image", "กำลังเตรียมรูป"],
  IMAGE_READY: ["Image ready", "รูปพร้อมแล้ว"],
  CAPTIONING: ["Captioning", "กำลังสร้างคำบรรยาย"],
  READY_TO_POST: ["Ready to post", "พร้อมโพสต์"],
  POSTING: ["Posting", "กำลังโพสต์"],
  POSTED: ["Posted", "โพสต์แล้ว"],
  FAILED: ["Failed", "ไม่สำเร็จ"],
  CANCELLED: ["Cancelled", "ยกเลิกแล้ว"],
};

function formatDateTime(value: string, thai: boolean): string {
  return new Intl.DateTimeFormat(thai ? "th-TH" : "en-GB", {
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

function SummaryStrip({ summary, thai }: { summary?: Partial<Record<SocialPostStatus, number>>; thai: boolean }) {
  const stats = [
    { label: thai ? "อยู่ในคิว" : "Queued", value: summary?.QUEUED ?? 0, tone: "queued" },
    { label: thai ? "รูปพร้อมแล้ว" : "Image ready", value: summary?.IMAGE_READY ?? 0, tone: "ready" },
    { label: thai ? "พร้อมโพสต์" : "Ready to post", value: summary?.READY_TO_POST ?? 0, tone: "posted" },
    { label: thai ? "ไม่สำเร็จ" : "Failed", value: summary?.FAILED ?? 0, tone: "failed" },
  ];

  return (
    <dl className="social-summary-strip" aria-label={thai ? "สรุปคิวโซเชียล" : "Social queue summary"}>
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
  onRetry,
  preparing,
  captioning,
  publishing,
  retrying,
  thai,
}: {
  item: SocialPostQueueItem;
  onPrepare(item: SocialPostQueueItem): void;
  onPrepareCaption(item: SocialPostQueueItem): void;
  onPublish(item: SocialPostQueueItem): void;
  onRetry(item: SocialPostQueueItem): void;
  preparing: boolean;
  captioning: boolean;
  publishing: boolean;
  retrying: boolean;
  thai: boolean;
}) {
  const t = (english: string, thaiText: string) => thai ? thaiText : english;
  const canPrepare = item.status === "QUEUED";
  const canPrepareCaption = item.status === "IMAGE_READY";
  const canPublish = item.status === "READY_TO_POST";
  const canRetry = item.status === "FAILED" && item.imageRecoveryState === "RETRY_SAFE";
  return (
    <li className={`social-queue-item social-queue-item--${item.status.toLowerCase().replaceAll("_", "-")}`}>
      <span className="social-queue-item__thumb" aria-hidden="true" />
      <span className="social-queue-item__main">
        <strong className="social-queue-item__filename" title={item.originalFileName}>
          {item.originalFileName}
        </strong>
        <small className="social-queue-item__meta">
          {formatDateTime(item.queuedAt, thai)} - {formatSize(item.byteSize)} - {formatContentType(item.contentType)}
        </small>
        {item.status === "FAILED" && item.failureMessage ? (
          <span className="social-queue-item__failure">{item.failureMessage}</span>
        ) : null}
      </span>
      <span className="social-queue-item__actions">
        <span className="social-status">{statusLabels[item.status][thai ? 1 : 0]}</span>
        {canPrepare ? (
          <button
            aria-label={`${t("Prepare image for", "เตรียมรูปสำหรับ")} ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={preparing}
            onClick={() => onPrepare(item)}
            type="button"
          >
            {preparing ? t("Preparing", "กำลังเตรียม") : t("Prepare Image", "เตรียมรูป")}
          </button>
        ) : null}
        {canPrepareCaption ? (
          <button
            aria-label={`${t("Prepare caption for", "สร้างคำบรรยายสำหรับ")} ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={captioning}
            onClick={() => onPrepareCaption(item)}
            type="button"
          >
            {captioning ? t("Captioning", "กำลังสร้างคำบรรยาย") : t("Prepare Caption", "สร้างคำบรรยาย")}
          </button>
        ) : null}
        {canPublish ? (
          <button
            aria-label={`${t("Publish", "โพสต์")} ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={publishing}
            onClick={() => onPublish(item)}
            type="button"
          >
            {publishing ? t("Publishing", "กำลังโพสต์") : t("Publish", "โพสต์")}
          </button>
        ) : null}
        {canRetry ? (
          <button
            aria-label={`${t("Retry image preparation for", "ลองเตรียมรูปอีกครั้งสำหรับ")} ${item.originalFileName}`}
            className="social-queue-item__prepare"
            disabled={retrying}
            onClick={() => onRetry(item)}
            type="button"
          >
            {retrying ? t("Queueing retry", "กำลังเข้าคิวใหม่") : t("Retry Image", "ลองเตรียมรูปอีกครั้ง")}
          </button>
        ) : null}
      </span>
    </li>
  );
}

export default function SocialAutomationPage() {
  const { language } = useLanguage();
  const thai = language === "th";
  const t = (english: string, thaiText: string) => thai ? thaiText : english;
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
      setNotice(t("Queued", "อยู่ในคิว"));
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const prepare = useMutation({
    mutationFn: (item: SocialPostQueueItem) => prepareSocialImage(item.id),
    onSuccess: async () => {
      setNotice(t("Image ready", "รูปพร้อมแล้ว"));
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const caption = useMutation({
    mutationFn: (item: SocialPostQueueItem) => prepareSocialCaption(item.id),
    onSuccess: async () => {
      setNotice(t("Ready to post", "พร้อมโพสต์"));
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const retry = useMutation({
    mutationFn: (item: SocialPostQueueItem) => prepareSocialImage(item.id),
    onSuccess: async () => {
      setNotice(t("Image ready", "รูปพร้อมแล้ว"));
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const publish = useMutation({
    mutationFn: (item: SocialPostQueueItem) => publishSocialPost(item.id),
    onSuccess: async () => {
      setNotice(t("Published and cleaned", "โพสต์แล้วและล้างคิวเรียบร้อย"));
      await queryClient.invalidateQueries({ queryKey: ["social-automation", "overview"] });
    },
  });

  const canUpload = Boolean(selectedFile && !upload.isPending);
  const latest = overview.data?.latest ?? [];
  const summary = overview.data?.summary;

  return (
    <WorkspaceShell title={t("Social Automation", "โซเชียลมีเดีย")} stickyNavigationTitle={t("Social Automation", "โซเชียลมีเดีย")} workspace="social" bodyClassName="social-automation-page" wide>
      <VanaraGlassRegion className="social-upload" ariaLabelledBy="social-upload-title">
        <VanaraSectionHeader
          eyebrow={t("Social", "โซเชียล")}
          headingId="social-upload-title"
          meta={summary ? t(`${summary.QUEUED} queued`, `${summary.QUEUED} รายการในคิว`) : t("Queue", "คิว")}
          title={t("Next Social Photo", "รูปถัดไปสำหรับโซเชียล")}
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
              <strong title={selectedFile?.name}>{selectedFile ? selectedFile.name : t("Choose photo", "เลือกรูป")}</strong>
              <small>{selectedFile ? `${formatSize(selectedFile.size)} - ${formatContentType(selectedFile.type)}` : t("JPG, PNG or WebP. HEIC is not supported.", "JPG, PNG หรือ WebP ไม่รองรับ HEIC")}</small>
            </span>
          </label>

          <button className="vc-primary-action social-upload__button" disabled={!canUpload} type="submit">
            {upload.isPending ? t("Queueing", "กำลังเข้าคิว") : t("Queue Photo", "เพิ่มรูปเข้าคิว")}
          </button>
        </form>

        {notice ? <p className="social-upload__notice">{notice}</p> : null}
        {upload.isError ? <p className="social-upload__error">{upload.error instanceof Error ? upload.error.message : "Photo could not be queued"}</p> : null}
      </VanaraGlassRegion>

      <VanaraGlassRegion className="social-history" ariaLabelledBy="social-history-title">
        <VanaraSectionHeader
          eyebrow={t("Status", "สถานะ")}
          headingId="social-history-title"
          meta={summary ? t(`${summary.READY_TO_POST} ready`, `${summary.READY_TO_POST} รายการพร้อมโพสต์`) : t("Latest", "ล่าสุด")}
          title={t("Publishing Queue", "คิวเผยแพร่")}
        />
        <SummaryStrip summary={summary} thai={thai} />

        {overview.isLoading ? <PageLoading /> : null}
        {overview.isError && !overview.data ? <PageError onRetry={() => void overview.refetch()} /> : null}
        {overview.data && latest.length === 0 ? (
          <section className="social-empty" aria-label={t("No queued photos", "ไม่มีรูปในคิว")}>
            <span aria-hidden="true" />
            <h2>{t("No photos waiting", "ไม่มีรูปที่รอโพสต์")}</h2>
            <p>{t("Add one resort photo for the next post.", "เพิ่มรูปรีสอร์ตสำหรับโพสต์ถัดไป")}</p>
          </section>
        ) : null}
        {latest.length > 0 ? (
          <ul className="social-queue-list" aria-label={t("Latest queued photos", "รูปที่เข้าคิวล่าสุด")}>
            {latest.map((item) => (
              <QueueItem
                item={item}
                key={item.id}
                onPrepare={(queuedItem) => prepare.mutate(queuedItem)}
                onPrepareCaption={(readyItem) => caption.mutate(readyItem)}
                onPublish={(readyItem) => publish.mutate(readyItem)}
                onRetry={(failedItem) => retry.mutate(failedItem)}
                preparing={prepare.isPending && prepare.variables?.id === item.id}
                captioning={caption.isPending && caption.variables?.id === item.id}
                publishing={publish.isPending && publish.variables?.id === item.id}
                retrying={retry.isPending && retry.variables?.id === item.id}
                thai={thai}
              />
            ))}
          </ul>
        ) : null}
        {prepare.isError ? <p className="social-upload__error">{prepare.error instanceof Error ? prepare.error.message : "Image could not be prepared"}</p> : null}
        {caption.isError ? <p className="social-upload__error">{caption.error instanceof Error ? caption.error.message : "Caption could not be prepared"}</p> : null}
        {publish.isError ? <p className="social-upload__error">{publish.error instanceof Error ? publish.error.message : "Post could not be published"}</p> : null}
        {retry.isError ? <p className="social-upload__error">{retry.error instanceof Error ? retry.error.message : "Image retry could not be queued"}</p> : null}
      </VanaraGlassRegion>
    </WorkspaceShell>
  );
}
