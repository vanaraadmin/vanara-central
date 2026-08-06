import { useCallback, useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { ApiError } from "../../services/api.client";
import { useLanguage } from "../../providers/language.context";
import { saveBookingPassport, classifyPassportForScan, livePassportPreflight, uploadPassportForReview } from "../../services/reception.service";
import type { BookingPassport, PassportData, PassportLivePreflight } from "../../types/reception";
import { analyzeCanvasFrame, type PassportQualityResult } from "../../utils/passport-quality";
import {
  PASSPORT_FRAME_ASPECT_RATIO,
  centerCropForAspectRatio,
  isCropAspectRatioValid,
  mapRenderedGuideToSourceCrop,
  passportGuideRect,
  type SourceCrop,
} from "../../utils/passport-crop";
import {
  initialPassportWorkflowState,
  passportWorkflowReducer,
  type CaptureDebug,
  type PassportFailure,
  type PassportWorkflowState,
} from "../../utils/passport-workflow-state";
import {
  isReadyLatched,
  nextReadyLatchUntil,
  shouldCancelReadyLatch,
  shouldIgnoreReadyDegradationDuringTap,
  shouldIgnoreTemporaryReadyDegradation,
} from "../../utils/passport-ready-latch";
import {
  PASSPORT_AUTO_CAPTURE_DWELL_MS,
  selectBestAutoCaptureCandidate,
  shouldStartAutoCaptureTimer,
  type PassportAutoCaptureCandidate,
} from "../../utils/passport-auto-capture";
import {
  PASSPORT_REVIEW_FIELDS,
  normalizePassportReviewDraft,
  passportReviewSaveDisabledReason,
  type PassportReviewField,
} from "../../utils/passport-review";
import { passportMessage, type PassportMessageKey } from "./passport-messages";

type CameraStartupState = "idle" | "starting" | "ready" | "failed" | "permission_denied" | "unavailable";
type SemanticPreflightState =
  | { status: "idle"; guidance: string; ready: false }
  | { status: "checking"; guidance: string; ready: false }
  | { status: "ready"; guidance: string; ready: true; preflight: PassportLivePreflight }
  | { status: "not_ready"; guidance: string; ready: false; preflight?: PassportLivePreflight }
  | { status: "failed"; guidance: string; ready: false; requestId?: string };
type TorchVideoTrackCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  focusMode?: string[];
  torch?: boolean;
};
type TorchVideoTrackConstraintSet = MediaTrackConstraintSet & {
  exposureMode?: "continuous";
  focusMode?: "continuous";
  torch?: boolean;
};

type ReadyCaptureCandidate = PassportAutoCaptureCandidate & {
  capturedAt: number;
  debug: CaptureDebug;
  file: File;
};

function passportFieldLabel(key: PassportReviewField, translate: (key: string) => string): string {
  const labels: Record<PassportReviewField, string> = {
    firstName: translate("firstName"),
    middleName: translate("middleName"),
    lastName: translate("lastName"),
    passportNumber: translate("passportNumber"),
    nationality: translate("nationality"),
    gender: translate("gender"),
    birthDate: translate("birthDate"),
    expiryDate: translate("expiryDate"),
  };
  return labels[key];
}

const PASSPORT_IMAGE_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif";
const MIN_CAPTURE_LONG_EDGE = 1000;

export interface PassportWorkflowProps {
  bookingId: number;
  guestName: string;
  isMobile: boolean;
  open: boolean;
  onCancel: () => void;
  onSaved: (passport: BookingPassport) => void;
}

export function PassportWorkflow({ bookingId, guestName, isMobile, onCancel, onSaved, open }: PassportWorkflowProps) {
  const { translate } = useLanguage();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const activeCaptureIdRef = useRef(0);
  const previewUrlsRef = useRef(new Set<string>());
  const [state, dispatchBase] = useReducer(passportWorkflowReducer, initialPassportWorkflowState);
  const stateRef = useRef(state);
  stateRef.current = state;

  function revokePreviewUrl(url?: string) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  }

  function dispatch(action: Parameters<typeof passportWorkflowReducer>[1]) {
    const previousPreview = "previewUrl" in state ? state.previewUrl : undefined;
    dispatchBase(action);
    if (action.type === "CANCEL" || action.type === "RETAKE") revokePreviewUrl(previousPreview);
  }

  useEffect(() => {
    if (open && state.phase === "CLOSED") {
      activeCaptureIdRef.current += 1;
      dispatchBase({ type: "OPEN", captureId: activeCaptureIdRef.current });
    }
  }, [open, state.phase]);

  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (state.phase === "CAPTURED") void classifyCapturedFile(state.captureId);
    // The workflow reducer owns this transition; classifyCapturedFile intentionally reads the latest state ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function cancelWorkflow() {
    activeCaptureIdRef.current += 1;
    dispatch({ type: "CANCEL" });
    onCancel();
  }

  function retake() {
    activeCaptureIdRef.current += 1;
    dispatch({ type: "RETAKE", captureId: activeCaptureIdRef.current });
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void processSelectedImageFile(file);
  }

  async function processCapturedFile(file: File, debug?: CaptureDebug) {
    const captureId = activeCaptureIdRef.current;
    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.add(previewUrl);
    dispatch({ type: "CAPTURE", captureId, file, previewUrl, debug });
  }

  async function processSelectedImageFile(file: File) {
    const captureId = activeCaptureIdRef.current;
    const result = await cropSelectedImageToPassportFrame(file);
    if (!result.ok) {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      dispatch({ type: "CAPTURE", captureId, file, previewUrl });
      dispatchBase({ type: "START_CLASSIFICATION", captureId });
      dispatchBase({ type: "CLASSIFICATION_REJECTED", captureId, reason: result.failure });
      return;
    }
    await processCapturedFile(result.file, {
      captureId,
      sourceWidth: result.sourceWidth,
      sourceHeight: result.sourceHeight,
      renderedWidth: result.sourceWidth,
      renderedHeight: result.sourceHeight,
      objectFitScale: result.crop.scale,
      guide: {
        x: result.crop.sx,
        y: result.crop.sy,
        width: result.crop.sw,
        height: result.crop.sh,
      },
      crop: result.crop,
      canvasWidth: result.canvasWidth,
      canvasHeight: result.canvasHeight,
      finalBlobBytes: result.file.size,
    });
  }

  async function classifyCapturedFile(captureId: number) {
    let current = latestState();
    if (current.phase !== "CAPTURED" || current.captureId !== captureId) return;
    dispatchBase({ type: "START_CLASSIFICATION", captureId });
    current = latestState();
    const file = "file" in current ? current.file : null;
    if (!file) return;
    try {
      const result = await classifyPassportForScan(file);
      if (activeCaptureIdRef.current !== captureId) return;
      if (result.decision.ready) {
        dispatchBase({ type: "CLASSIFICATION_ACCEPTED", captureId, classification: result.classification });
      } else {
        dispatchBase({ type: "CLASSIFICATION_REJECTED", captureId, reason: failureFromClassification(result.decision) });
      }
    } catch (error) {
      if (activeCaptureIdRef.current !== captureId) return;
      dispatchBase({ type: "CLASSIFICATION_REJECTED", captureId, reason: failureFromError(error, "classification") });
    }
  }

  function latestState(): PassportWorkflowState {
    return stateRef.current;
  }

  async function scanPassport() {
    const current = latestState();
    if (current.phase !== "READY_FOR_OCR" && current.phase !== "OCR_FAILED") return;
    const captureId = current.captureId;
    dispatchBase({ type: "START_OCR", captureId });
    try {
      const result = await uploadPassportForReview(current.file);
      if (activeCaptureIdRef.current !== captureId) return;
      dispatchBase({ type: "OCR_SUCCESS", captureId, objectKey: result.objectKey, passport: result.passport });
    } catch (error) {
      if (activeCaptureIdRef.current !== captureId) return;
      dispatchBase({ type: "OCR_FAILURE", captureId, error: failureFromError(error, "ocr") });
    }
  }

  async function savePassport(passport: PassportData) {
    const current = latestState();
    if (current.phase !== "REVIEW" && current.phase !== "SAVE_FAILED") return;
    const captureId = current.captureId;
    dispatchBase({ type: "START_SAVE", captureId, passport });
    try {
      const saved = await saveBookingPassport(bookingId, current.objectKey, passport);
      if (activeCaptureIdRef.current !== captureId) return;
      dispatchBase({ type: "SAVE_SUCCESS", captureId, passportId: saved.id });
      revokePreviewUrl(current.previewUrl);
      onSaved(saved);
    } catch (error) {
      if (activeCaptureIdRef.current !== captureId) return;
      dispatchBase({ type: "SAVE_FAILURE", captureId, error: failureFromError(error, "save") });
    }
  }

  if (!open || state.phase === "CLOSED" || state.phase === "COMPLETED") return null;
  const reviewingPassport = state.phase === "REVIEW" || state.phase === "SAVING" || state.phase === "SAVE_FAILED";

  return (
    <div className="passport-workflow" role="dialog" aria-modal="true" aria-labelledby="passport-workflow-title">
      <header className="passport-workflow__header">
        <div>
          <span>{reviewingPassport ? translate("reviewPassport") : translate("passportRegistration")}</span>
          <h2 id="passport-workflow-title">{guestName}</h2>
        </div>
      </header>

      <main className="passport-workflow__content">
        {state.phase === "CAMERA" && (
          <PassportCameraStep
            captureId={state.captureId}
            isMobile={isMobile}
            onCancel={cancelWorkflow}
            onCaptureFile={(file, debug) => void processCapturedFile(file, debug)}
            onChooseFromLibrary={() => libraryInputRef.current?.click()}
            onTakePhoto={() => cameraInputRef.current?.click()}
          />
        )}
        {state.phase === "CAPTURED" && (
          <PassportProgressStep
            previewUrl={state.previewUrl}
            title={translate("checkingPassport")}
            items={[translate("confirmingBiodataPage"), translate("checkingBottomPassportCode")]}
            onCancel={cancelWorkflow}
          />
        )}
        {state.phase === "CLASSIFYING" && (
          <PassportProgressStep
            previewUrl={state.previewUrl}
            title={translate("checkingPassport")}
            items={[translate("checkingDocument"), translate("confirmingBiodataPage"), translate("checkingBottomPassportCode")]}
            onCancel={cancelWorkflow}
          />
        )}
        {state.phase === "REJECTED" && (
          <PassportFailureStep
            previewUrl={state.previewUrl}
            title={passportMessage("passport.checkFailed")}
            failure={state.reason}
            primaryLabel={translate("retakePhoto")}
            secondaryLabel={translate("chooseAnotherPhoto")}
            onPrimary={retake}
            onSecondary={() => libraryInputRef.current?.click()}
            onCancel={cancelWorkflow}
          />
        )}
        {state.phase === "READY_FOR_OCR" && (
          <PassportPreviewStep
            debug={state.debug}
            previewUrl={state.previewUrl}
            title={translate("passportPageRecognised")}
            message={translate("passportBiodataReady")}
            primaryLabel={translate("scanPassport")}
            onPrimary={() => void scanPassport()}
            onRetake={retake}
            onCancel={cancelWorkflow}
          />
        )}
        {state.phase === "OCR_RUNNING" && (
          <PassportProgressStep
            previewUrl={state.previewUrl}
            title={translate("scanningPassport")}
            items={[translate("uploading"), translate("readingPassport"), translate("verifyingDetails")]}
          />
        )}
        {state.phase === "OCR_FAILED" && (
          <PassportFailureStep
            previewUrl={state.previewUrl}
            title={passportMessage("passport.ocrFailed")}
            failure={state.error}
            primaryLabel={translate("retakePhoto")}
            secondaryLabel={translate("retryScan")}
            onPrimary={retake}
            onSecondary={() => void scanPassport()}
            onCancel={cancelWorkflow}
          />
        )}
        {(state.phase === "REVIEW" || state.phase === "SAVING" || state.phase === "SAVE_FAILED") && (
          <PassportReviewStep
            error={state.phase === "SAVE_FAILED" ? state.error.message : null}
            isPending={state.phase === "SAVING"}
            passport={state.passport}
            onCancel={cancelWorkflow}
            onRetake={retake}
            onSave={(passport) => void savePassport(passport)}
          />
        )}
      </main>

      <input accept={PASSPORT_IMAGE_ACCEPT} capture="environment" className="reception-passport-input" onChange={selectFile} ref={cameraInputRef} type="file" />
      <input accept={PASSPORT_IMAGE_ACCEPT} className="reception-passport-input" onChange={selectFile} ref={libraryInputRef} type="file" />
    </div>
  );
}

function PassportCameraStep({
  captureId,
  isMobile,
  onCancel,
  onCaptureFile,
  onChooseFromLibrary,
  onTakePhoto,
}: {
  captureId: number;
  isMobile: boolean;
  onCancel: () => void;
  onCaptureFile: (file: File, debug?: CaptureDebug) => void;
  onChooseFromLibrary: () => void;
  onTakePhoto: () => void;
}) {
  const { translate } = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraStateRef = useRef<CameraStartupState>("idle");
  const [cameraState, setCameraState] = useState<CameraStartupState>("idle");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveQuality, setLiveQuality] = useState<PassportQualityResult | null>(null);
  const [semanticPreflight, setSemanticPreflight] = useState<SemanticPreflightState>({ status: "idle", guidance: translate("searchingForPassport"), ready: false });
  const [readyLatchActive, setReadyLatchActive] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const semanticRequestIdRef = useRef(0);
  const semanticInFlightRef = useRef(false);
  const lastSemanticRequestAtRef = useRef(0);
  const autoCaptureEnabled = isMobile;
  const autoCaptureInFlightRef = useRef(false);
  const autoCaptureFailedRef = useRef(false);
  const autoCaptureTimerRef = useRef<number | null>(null);
  const readyLatchedUntilRef = useRef(0);
  const pointerActiveRef = useRef(false);
  const lastReadyCropRef = useRef<ReturnType<typeof videoGuideSourceCrop> | null>(null);
  const lastReadyCandidateRef = useRef<ReadyCaptureCandidate | null>(null);

  const cancelAutoCaptureTimer = useCallback(() => {
    if (autoCaptureTimerRef.current !== null) {
      window.clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    cancelAutoCaptureTimer();
    autoCaptureInFlightRef.current = false;
    autoCaptureFailedRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLiveQuality(null);
    setSemanticPreflight({ status: "idle", guidance: translate("searchingForPassport"), ready: false });
    readyLatchedUntilRef.current = 0;
    lastReadyCropRef.current = null;
    lastReadyCandidateRef.current = null;
    setReadyLatchActive(false);
    setTorchAvailable(false);
    setTorchEnabled(false);
  }, [cancelAutoCaptureTimer, translate]);

  function updateCameraState(nextState: CameraStartupState) {
    cameraStateRef.current = nextState;
    setCameraState(nextState);
  }

  useEffect(() => {
    if (!isMobile) return undefined;
    if (cameraStateRef.current !== "idle") return undefined;
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        updateCameraState("unavailable");
        setCameraError(translate("cameraUnavailable"));
        return;
      }
      const video = videoRef.current;
      if (!video) {
        updateCameraState("failed");
        setCameraError(translate("cameraPreviewFailed"));
        return;
      }
      updateCameraState("starting");
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track?.getCapabilities) {
          const capabilities = track.getCapabilities() as TorchVideoTrackCapabilities;
          const advanced: TorchVideoTrackConstraintSet = {};
          if (capabilities.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
          if (capabilities.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
          if (Object.keys(advanced).length > 0) await track.applyConstraints({ advanced: [advanced] }).catch(() => undefined);
          setTorchAvailable(capabilities.torch === true);
        }
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.srcObject = stream;
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitForVideoEvent(video, ["loadedmetadata", "canplay"], 4_000);
        await video.play();
        await waitForLiveVideoFrame(video, stream, 2_500);
        if (cancelled) return;
        updateCameraState("ready");
      } catch (error) {
        stopCamera();
        const fallback = cameraErrorMessage(error, translate);
        updateCameraState(fallback.status);
        setCameraError(fallback.message);
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraAttempt, isMobile, stopCamera, translate]);

  async function maybeRunSemanticPreflight(video: HTMLVideoElement, quality: PassportQualityResult) {
    const now = Date.now();
    if (quality.blockingIssue) {
      if (shouldIgnoreTemporaryReadyDegradation(quality.blockingIssue, readyLatchedUntilRef.current, now)) return;
      if (shouldIgnoreReadyDegradationDuringTap(quality.blockingIssue, pointerActiveRef.current, readyLatchedUntilRef.current, now)) return;
      semanticRequestIdRef.current += 1;
      if (shouldCancelReadyLatch(quality.blockingIssue)) {
        cancelAutoCaptureTimer();
        readyLatchedUntilRef.current = 0;
        lastReadyCropRef.current = null;
        lastReadyCandidateRef.current = null;
        setReadyLatchActive(false);
      }
      setSemanticPreflight({ status: "not_ready", guidance: localLiveInstruction(quality, translate), ready: false });
      return;
    }
    if (quality.liveState !== "DOCUMENT_DETECTED") {
      semanticRequestIdRef.current += 1;
      cancelAutoCaptureTimer();
      setSemanticPreflight({ status: "idle", guidance: translate("searchingForPassport"), ready: false });
      return;
    }
    if (semanticInFlightRef.current || now - lastSemanticRequestAtRef.current < 1_700) return;
    const requestId = semanticRequestIdRef.current + 1;
    semanticRequestIdRef.current = requestId;
    semanticInFlightRef.current = true;
    lastSemanticRequestAtRef.current = now;
    setSemanticPreflight({ status: "checking", guidance: translate("holdSteady"), ready: false });
    try {
      const file = await semanticFrameFile(video);
      const result = await livePassportPreflight(file);
      if (semanticRequestIdRef.current !== requestId) return;
      if (result.ready) {
        const readyUntil = nextReadyLatchUntil(true, Date.now());
        readyLatchedUntilRef.current = readyUntil;
        setReadyLatchActive(true);
        lastReadyCropRef.current = videoGuideSourceCrop(video);
        const candidate = await readyCaptureCandidate(video, captureId, Date.now(), quality).catch(() => null);
        lastReadyCandidateRef.current = selectBestAutoCaptureCandidate(lastReadyCandidateRef.current, candidate);
        scheduleAutoCapture();
        window.setTimeout(() => {
          if (!isReadyLatched(readyLatchedUntilRef.current, Date.now())) setReadyLatchActive(false);
        }, readyUntil - Date.now());
        setSemanticPreflight({ status: "ready", guidance: translate("ready"), ready: true, preflight: result.preflight });
      } else {
        const instruction = result.preflight.instruction;
        if (isReadyLatched(readyLatchedUntilRef.current, Date.now()) && instruction === "hold_steady") return;
        cancelAutoCaptureTimer();
        setSemanticPreflight({ status: "not_ready", guidance: semanticInstruction(result.preflight, translate), ready: false, preflight: result.preflight });
      }
    } catch (error) {
      if (semanticRequestIdRef.current !== requestId) return;
      setSemanticPreflight({
        status: "failed",
        guidance: error instanceof ApiError && error.requestId ? `${translate("cameraUnavailable")} ${error.requestId}` : translate("cameraUnavailable"),
        ready: false,
        requestId: error instanceof ApiError ? error.requestId : undefined,
      });
    } finally {
      semanticInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (cameraState !== "ready") return undefined;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;
      const liveTrack = streamRef.current?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
      if (!liveTrack) return;
      canvas.width = 360;
      canvas.height = Math.max(1, Math.round(360 / PASSPORT_FRAME_ASPECT_RATIO));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const mapped = videoGuideSourceCrop(video);
      if (!context || !mapped) return;
      const crop = mapped.crop;
      context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      const result = analyzeCanvasFrame(canvas);
      if (result) {
        setLiveQuality(result);
        void maybeRunSemanticPreflight(video, result);
      }
    }, 700);
    return () => window.clearInterval(timer);
    // The camera loop intentionally reads the latest refs; adding the async helper here would restart preview analysis unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState]);

  function scheduleAutoCapture() {
    if (autoCaptureFailedRef.current) return;
    const streamLive = streamRef.current?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    if (!shouldStartAutoCaptureTimer({
      autoCaptureEnabled,
      cameraReady: cameraStateRef.current === "ready",
      captureInFlight: autoCaptureInFlightRef.current,
      candidate: lastReadyCandidateRef.current,
      hasExistingTimer: autoCaptureTimerRef.current !== null,
      now: Date.now(),
      readyUntil: readyLatchedUntilRef.current,
      streamLive,
    })) return;
    autoCaptureTimerRef.current = window.setTimeout(() => {
      autoCaptureTimerRef.current = null;
      void captureFromCamera("auto");
    }, PASSPORT_AUTO_CAPTURE_DWELL_MS);
  }

  function retryCamera() {
    stopCamera();
    updateCameraState("idle");
    setCameraError(null);
    setCameraAttempt((attempt) => attempt + 1);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nextTorch = !torchEnabled;
    await track.applyConstraints({ advanced: [{ torch: nextTorch } as TorchVideoTrackConstraintSet] }).then(() => {
      setTorchEnabled(nextTorch);
    }).catch(() => {
    setCameraError(translate("cameraUnavailable"));
      setTorchAvailable(false);
    });
  }

  async function captureFromCamera(mode: "auto" | "manual") {
    if (autoCaptureInFlightRef.current) return;
    autoCaptureInFlightRef.current = true;
    if (mode === "manual") cancelAutoCaptureTimer();
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      autoCaptureInFlightRef.current = false;
      if (mode === "auto") {
        autoCaptureFailedRef.current = true;
        setCameraError(translate("automaticCaptureFailed"));
      }
      return;
    }
    const liveTrack = streamRef.current?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    if (!liveTrack) {
      autoCaptureInFlightRef.current = false;
      updateCameraState("failed");
      setCameraError(translate("cameraPreviewFailed"));
      return;
    }
    const canvas = document.createElement("canvas");
    const now = Date.now();
    const currentCandidate = isReadyLatched(readyLatchedUntilRef.current, now)
      ? await readyCaptureCandidate(video, captureId, now, liveQuality).catch(() => null)
      : null;
    const candidate = isReadyLatched(readyLatchedUntilRef.current, now)
      ? selectBestAutoCaptureCandidate(lastReadyCandidateRef.current, currentCandidate)
      : null;
    if (candidate && candidate.capturedAt <= readyLatchedUntilRef.current) {
      stopCamera();
      onCaptureFile(candidate.file, candidate.debug);
      return;
    }
    const mapped = isReadyLatched(readyLatchedUntilRef.current, now)
      ? lastReadyCropRef.current ?? videoGuideSourceCrop(video)
      : videoGuideSourceCrop(video);
    if (!mapped) {
      autoCaptureInFlightRef.current = false;
      if (mode === "auto") {
        autoCaptureFailedRef.current = true;
        setCameraError(translate("automaticCaptureFailed"));
      }
      return;
    }
    const crop = mapped.crop;
    if (Math.max(crop.sw, crop.sh) < MIN_CAPTURE_LONG_EDGE || !isCropAspectRatioValid(crop)) {
      autoCaptureInFlightRef.current = false;
      setCameraError(translate("pleaseRetakePhoto"));
      return;
    }
    canvas.width = Math.max(1, Math.round(crop.sw));
    canvas.height = Math.max(1, Math.round(crop.sh));
    const context = canvas.getContext("2d");
    if (!context) {
      autoCaptureInFlightRef.current = false;
      if (mode === "auto") {
        autoCaptureFailedRef.current = true;
        setCameraError(translate("automaticCaptureFailed"));
      }
      return;
    }
    context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        autoCaptureInFlightRef.current = false;
        if (mode === "auto") {
          autoCaptureFailedRef.current = true;
          setCameraError(translate("automaticCaptureFailed"));
        }
        return;
      }
      stopCamera();
      onCaptureFile(new File([blob], "passport-capture.jpg", { type: "image/jpeg" }), {
        captureId,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        renderedWidth: mapped.renderedWidth,
        renderedHeight: mapped.renderedHeight,
        objectFitScale: crop.scale,
        guide: mapped.guide,
        crop,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        finalBlobBytes: blob.size,
      });
    }, "image/jpeg", 0.95);
  }

  const cameraReady = cameraState === "ready";
  const canCapture = cameraReady && (semanticPreflight.ready || readyLatchActive) && !shouldCancelReadyLatch(liveQuality?.blockingIssue);
  const showLiveCamera = isMobile && cameraState !== "unavailable" && cameraState !== "permission_denied" && cameraState !== "failed";
  const showFallbackActions = isMobile && cameraState !== "ready";

  return (
    <section className="passport-wizard-step" aria-label="Passport camera">
      {showLiveCamera ? (
        <div
          className={`passport-camera passport-camera--${(canCapture ? "ready" : "not_ready").toLowerCase().replace("_", "-")}`}
          onPointerDown={() => { pointerActiveRef.current = true; }}
          onPointerUp={() => { pointerActiveRef.current = false; }}
          onPointerCancel={() => { pointerActiveRef.current = false; }}
          onPointerLeave={() => { pointerActiveRef.current = false; }}
        >
          <video ref={videoRef} autoPlay className="passport-camera__video" playsInline muted />
          <canvas ref={canvasRef} className="passport-camera__analysis" aria-hidden="true" />
          <div className="passport-camera__frame" aria-hidden="true" />
          <p className="passport-camera__guidance">
            {cameraState === "starting" ? translate("startingCamera") : semanticPreflight.guidance}
          </p>
        </div>
      ) : (
        <div className="passport-capture__placeholder">
          <strong>{translate("selectPassportPhoto")}</strong>
        </div>
      )}
      {cameraError && <p className="passport-capture__hint">{cameraError}</p>}
      <div className="passport-workflow__actions">
        <button onClick={onCancel} type="button">{translate("cancel")}</button>
        <button onClick={onChooseFromLibrary} type="button">{translate("chooseFromLibrary")}</button>
        {showFallbackActions && <button onClick={onTakePhoto} type="button">{translate("useNativeCamera")}</button>}
        {cameraState === "failed" || cameraState === "permission_denied" || cameraState === "unavailable" ? (
          <button onClick={retryCamera} type="button">{translate("retryCamera")}</button>
        ) : cameraReady ? (
          <>
            {torchAvailable && <button onClick={() => void toggleTorch()} type="button">{torchEnabled ? translate("torchOff") : translate("torchOn")}</button>}
            <button disabled={!canCapture} onClick={() => void captureFromCamera("manual")} type="button">{translate("takePhoto")}</button>
          </>
        ) : !isMobile ? (
          <button onClick={onChooseFromLibrary} type="button">{translate("selectPassportPhoto")}</button>
        ) : null}
      </div>
    </section>
  );
}

function PassportPreviewStep({
  debug,
  message,
  onCancel,
  onPrimary,
  onRetake,
  previewUrl,
  primaryLabel,
  title,
}: {
  debug?: CaptureDebug;
  message: string;
  onCancel: () => void;
  onPrimary: () => void;
  onRetake: () => void;
  previewUrl: string;
  primaryLabel: string;
  title: string;
}) {
  const { translate } = useLanguage();
  return (
    <section className="passport-wizard-step" aria-label={title}>
      <img alt="" className="passport-capture__preview" src={previewUrl} />
      <h3>{title}</h3>
      <p className="passport-capture__hint">{message}</p>
      {import.meta.env.DEV && debug && <CropDiagnostics debug={debug} />}
      <div className="passport-workflow__actions">
        <button onClick={onCancel} type="button">{translate("cancel")}</button>
        <button onClick={onRetake} type="button">{translate("retakePhoto")}</button>
        <button onClick={onPrimary} type="button">{primaryLabel}</button>
      </div>
    </section>
  );
}

function CropDiagnostics({ debug }: { debug: CaptureDebug }) {
  return (
    <dl className="passport-capture__diagnostics" aria-label="Passport crop diagnostics">
      <div><dt>Source</dt><dd>{debug.sourceWidth}x{debug.sourceHeight}</dd></div>
      <div><dt>Rendered</dt><dd>{Math.round(debug.renderedWidth)}x{Math.round(debug.renderedHeight)}</dd></div>
      <div><dt>Scale</dt><dd>{(debug.objectFitScale ?? debug.crop.scale).toFixed(3)}</dd></div>
      <div><dt>Guide</dt><dd>{Math.round(debug.guide.width)}x{Math.round(debug.guide.height)}</dd></div>
      <div><dt>Crop</dt><dd>{Math.round(debug.crop.sw)}x{Math.round(debug.crop.sh)}</dd></div>
      <div><dt>Output</dt><dd>{debug.canvasWidth}x{debug.canvasHeight}</dd></div>
      <div><dt>Blob</dt><dd>{debug.finalBlobBytes ?? 0} bytes</dd></div>
    </dl>
  );
}

function PassportProgressStep({ items, onCancel, previewUrl, title }: { items: string[]; onCancel?: () => void; previewUrl: string; title: string }) {
  const { translate } = useLanguage();
  return (
    <section className="passport-wizard-step" aria-label={title}>
      <img alt="" className="passport-capture__preview" src={previewUrl} />
      <h3>{title}</h3>
      <ol className="passport-capture__progress" aria-label={title}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ol>
      {onCancel && (
        <div className="passport-workflow__actions passport-workflow__actions--single">
          <button onClick={onCancel} type="button">{translate("cancel")}</button>
        </div>
      )}
    </section>
  );
}

function PassportFailureStep({
  failure,
  onCancel,
  onPrimary,
  onSecondary,
  previewUrl,
  primaryLabel,
  secondaryLabel,
  title,
}: {
  failure: PassportFailure;
  onCancel: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
  previewUrl: string;
  primaryLabel: string;
  secondaryLabel: string;
  title: string;
}) {
  const { translate } = useLanguage();
  return (
    <section className="passport-wizard-step" aria-label={title}>
      <img alt="" className="passport-capture__preview" src={previewUrl} />
      <h3>{title}</h3>
      <p className="reception-modal__error" role="alert">{failure.message}</p>
      {failure.requestId && (
        <details className="passport-review__technical">
          <summary>{translate("details")}</summary>
          <small>Request ID: {failure.requestId}</small>
        </details>
      )}
      <div className="passport-workflow__actions">
        <button onClick={onCancel} type="button">{translate("cancel")}</button>
        <button onClick={onSecondary} type="button">{secondaryLabel}</button>
        <button onClick={onPrimary} type="button">{primaryLabel}</button>
      </div>
    </section>
  );
}

function PassportReviewStep({
  error,
  isPending,
  onCancel,
  onRetake,
  onSave,
  passport,
}: {
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onRetake: () => void;
  onSave: (passport: PassportData) => void;
  passport: PassportData;
}) {
  const { translate } = useLanguage();
  const [draft, setDraft] = useState<PassportData>(() => normalizePassportReviewDraft(passport));

  const verification = passportVerificationSummary(draft);
  const nameReview = passportNameReviewSummary(draft);
  const passportNumberRequiresConfirmation = verification?.state !== undefined && verification.state !== "AUTO_VERIFIED" && verification.state !== "MANUALLY_VERIFIED";
  const saveDisabledReason = passportReviewSaveDisabledReason({
    isSaving: isPending,
    ocrCompleted: true,
    passport: draft,
  });
  const verifierTimedOut = passport.verification && typeof passport.verification === "object" && "timing" in passport.verification
    ? (passport.verification.timing as { verifierTimedOut?: boolean; visualOpenAiRequestId?: string | null; mrzOpenAiRequestId?: string | null; verifierOpenAiRequestId?: string | null } | undefined)?.verifierTimedOut === true
    : false;
  const timing = passport.verification && typeof passport.verification === "object" && "timing" in passport.verification
    ? passport.verification.timing as { visualOpenAiRequestId?: string | null; mrzOpenAiRequestId?: string | null; verifierOpenAiRequestId?: string | null }
    : null;

  return (
    <section className="passport-review passport-wizard-step" aria-label={translate("reviewPassport")}>
      <div className="passport-review__fields">
        {PASSPORT_REVIEW_FIELDS.map((field) => (
          <label key={field.key}>
            <span>{passportFieldLabel(field.key, translate)}</span>
            <input
              onChange={(event) => setDraft(updateDraftField(draft, field.key, event.target.value.trim() || null))}
              value={draft[field.key] ?? ""}
            />
          </label>
        ))}
      </div>
      {verification && (
        <section className="passport-review__verification" aria-label={translate("verification")}>
          <strong>{translate("passportNumber")}: {verification.state.replace(/_/g, " ")}</strong>
          {verifierTimedOut && (
            <p className="passport-capture__hint">{translate("passportCheckTimedOut")}</p>
          )}
          {verification.visualCandidate || verification.mrzCandidate ? (
            <dl className="passport-review__candidates">
              {verification.visualCandidate && <div><dt>{translate("passportVisualCandidate")}</dt><dd>{verification.visualCandidate}</dd></div>}
              {verification.mrzCandidate && <div><dt>{translate("passportMrzCandidate")}</dt><dd>{verification.mrzCandidate}</dd></div>}
            </dl>
          ) : null}
          {verification.issues.length > 0 && (
            <ul>
              {verification.issues.map((issue) => <li key={issue}>{issue.replace(/_/g, " ")}</li>)}
            </ul>
          )}
          {passportNumberRequiresConfirmation && draft.passportNumber && (
            <button
              disabled={isPending}
              onClick={() => setDraft(markPassportNumberManuallyVerified(draft))}
              type="button"
            >
              {translate("confirmPassportNumber")}
            </button>
          )}
          {verifierTimedOut && timing && (
            <details className="passport-review__technical">
              <summary>{translate("details")}</summary>
              <small>
                Visual request: {timing.visualOpenAiRequestId ?? "n/a"} · MRZ request: {timing.mrzOpenAiRequestId ?? "n/a"} · Verifier request: {timing.verifierOpenAiRequestId ?? "timeout"}
              </small>
            </details>
          )}
        </section>
      )}
      {nameReview.length > 0 && (
        <section className="passport-review__verification" aria-label={translate("passportGivenNamesNeedReview")}>
          <strong>{translate("passportGivenNamesNeedReview")}</strong>
          <ul>
            {nameReview.map((issue) => <li key={issue}>{issue.replace(/_/g, " ")}</li>)}
          </ul>
        </section>
      )}
      {error && <p className="reception-modal__error" role="alert">{error}</p>}
      {saveDisabledReason && <p className="passport-review__save-reason" role="status">{saveDisabledReason}</p>}
      <div className="passport-workflow__actions passport-review-actions">
        <button disabled={isPending} onClick={onCancel} type="button">{translate("cancel")}</button>
        <button disabled={isPending} onClick={onRetake} type="button">{translate("retakePhoto")}</button>
        <button disabled={Boolean(saveDisabledReason)} onClick={() => onSave(normalizePassportReviewDraft(draft))} type="button">
          {isPending ? translate("saving") : translate("savePassport")}
        </button>
      </div>
    </section>
  );
}

function updateDraftField(passport: PassportData, field: PassportReviewField, value: string | null): PassportData {
  const next = { ...passport, [field]: value };
  if (field !== "passportNumber") return next;
  return markPassportNumberNeedsConfirmation(next);
}

function passportVerificationSummary(passport: PassportData): { state: string; issues: string[]; visualCandidate?: string | null; mrzCandidate?: string | null } | null {
  const verification = passport.verification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) return null;
  const consensus = verification.consensus as {
    fields?: {
      passportNumber?: {
        state?: string;
        issues?: string[];
        conflicts?: unknown[];
        visualPass1?: string | null;
        visualPass2?: string | null;
        mrzPass1?: string | null;
        mrzPass2?: string | null;
      };
    };
    unresolvedCriticalConflicts?: number;
  };
  const passportNumber = consensus.fields?.passportNumber;
  return {
    state: passportNumber?.state ?? "NEEDS_CONFIRMATION",
    visualCandidate: passportNumber?.visualPass1 ?? passportNumber?.visualPass2 ?? null,
    mrzCandidate: passportNumber?.mrzPass1 ?? passportNumber?.mrzPass2 ?? null,
    issues: [
      ...(passportNumber?.issues ?? []),
      ...((passportNumber?.conflicts?.length ?? 0) > 0 ? ["PASSPORT_NUMBER_CONFLICT"] : []),
      ...((consensus.unresolvedCriticalConflicts ?? 0) > 0 ? ["UNRESOLVED_CRITICAL_FIELDS"] : []),
    ],
  };
}

function passportNameReviewSummary(passport: PassportData): string[] {
  const verification = passport.verification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) return [];
  const consensus = verification.consensus as {
    fields?: {
      firstName?: {
        issues?: string[];
      };
    };
  };
  return consensus.fields?.firstName?.issues?.filter((issue) => issue.includes("GIVEN_NAMES")) ?? [];
}

function markPassportNumberManuallyVerified(passport: PassportData): PassportData {
  if (!passport.passportNumber) return passport;
  const verification = passport.verification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) return passport;
  const nextVerification = structuredClone(verification) as {
    consensus?: {
      fields?: {
        passportNumber?: {
          value?: string | null;
          state?: string;
          source?: string;
          issues?: string[];
          conflicts?: unknown[];
          visualPass1?: string | null;
          visualPass2?: string | null;
        };
      };
    };
  };
  const passportNumber = nextVerification.consensus?.fields?.passportNumber;
  if (!passportNumber) return passport;
  passportNumber.value = passport.passportNumber.trim();
  passportNumber.state = "MANUALLY_VERIFIED";
  passportNumber.source = "manual";
  passportNumber.issues = [];
  passportNumber.conflicts = [];
  passportNumber.visualPass1 = passport.passportNumber.trim();
  passportNumber.visualPass2 = passport.passportNumber.trim();
  return { ...passport, verification: nextVerification };
}

function markPassportNumberNeedsConfirmation(passport: PassportData): PassportData {
  const verification = passport.verification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) return passport;
  const nextVerification = structuredClone(verification) as {
    consensus?: {
      fields?: {
        passportNumber?: {
          state?: string;
          issues?: string[];
          conflicts?: unknown[];
          value?: string | null;
          visualPass1?: string | null;
          visualPass2?: string | null;
        };
      };
    };
  };
  const passportNumber = nextVerification.consensus?.fields?.passportNumber;
  if (!passportNumber) return passport;
  passportNumber.value = passport.passportNumber?.trim() || null;
  passportNumber.state = "NEEDS_CONFIRMATION";
  passportNumber.issues = Array.from(new Set([...(passportNumber.issues ?? []), "PASSPORT_NUMBER_REVIEW_REQUIRED"]));
  passportNumber.visualPass1 = passport.passportNumber?.trim() || null;
  passportNumber.visualPass2 = passport.passportNumber?.trim() || null;
  return { ...passport, verification: nextVerification };
}

function failureFromClassification(decision: { code: string; message: string; messageKey?: PassportMessageKey }): PassportFailure {
  const map: Record<string, PassportFailure["code"]> = {
    not_a_passport: "NOT_PASSPORT",
    not_biodata_page: "NOT_BIODATA_PAGE",
    passport_confidence_low: "DOCUMENT_CROPPED",
    passport_incomplete: "DOCUMENT_CROPPED",
    mrz_not_visible: "MRZ_NOT_VISIBLE",
    unreadable_darkness: "TOO_DARK",
    unreadable_blur: "TOO_BLURRED",
    excessive_glare: "TOO_MUCH_GLARE",
  };
  return { code: map[decision.code] ?? "UNKNOWN", message: decision.messageKey ? passportMessage(decision.messageKey, decision.message) : decision.message };
}

function failureFromError(error: unknown, stage: "classification" | "ocr" | "save"): PassportFailure {
  const message = error instanceof Error ? error.message : "";
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const lower = message.toLowerCase();
  if (stage === "save") {
    if (lower.includes("passport number")) return { code: "OCR_VALIDATION_FAILED", message: passportMessage("passport.numberNotVerified"), technical: true, requestId };
    if (lower.includes("tm30 mandatory field missing")) return { code: "SAVE_FAILED", message, technical: true, requestId };
    if (lower.includes("tm30") || lower.includes("inconsistency")) return { code: "OCR_VALIDATION_FAILED", message: passportMessage("passport.ocrInconsistency"), technical: true, requestId };
    return { code: "SAVE_FAILED", message: message || passportMessage("passport.saveFailed"), technical: true, requestId };
  }
  if (stage === "classification") {
    if (lower.includes("timed out") || lower.includes("timeout")) return { code: "CLASSIFICATION_TIMEOUT", message: passportMessage("passport.openAiTimeout"), technical: true, requestId };
    return { code: "CLASSIFICATION_NETWORK_ERROR", message: message || passportMessage("passport.networkProblem"), technical: true, requestId };
  }
  if (lower.includes("verification") && (lower.includes("timed out") || lower.includes("timeout"))) return { code: "OCR_TIMEOUT", message: passportMessage("passport.openAiTimeout"), technical: true, requestId };
  if (lower.includes("timed out") || lower.includes("timeout")) return { code: "OCR_TIMEOUT", message: passportMessage("passport.openAiTimeout"), technical: true, requestId };
  if (lower.includes("malformed") || lower.includes("invalid response") || lower.includes("schema")) {
    return { code: "OCR_PARSE_ERROR", message: passportMessage("passport.unknownInternal"), technical: true, requestId };
  }
  if (lower.includes("mrz")) {
    return { code: "OCR_VALIDATION_FAILED", message: passportMessage("passport.mrzValidationFailed"), technical: true, requestId };
  }
  if (lower.includes("verified") || lower.includes("passport number")) {
    return { code: "OCR_VALIDATION_FAILED", message: passportMessage("passport.numberNotVerified"), technical: true, requestId };
  }
  if (lower.includes("temporarily unavailable")) return { code: "OCR_MODEL_ERROR", message: passportMessage("passport.openAiTimeout"), technical: true, requestId };
  return { code: "OCR_MODEL_ERROR", message: message || passportMessage("passport.notReadable"), technical: true, requestId };
}

async function cropSelectedImageToPassportFrame(file: File): Promise<
  | {
    ok: true;
    file: File;
    sourceWidth: number;
    sourceHeight: number;
    crop: SourceCrop;
    canvasWidth: number;
    canvasHeight: number;
  }
  | { ok: false; failure: PassportFailure }
> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) {
    return { ok: false, failure: { code: "UNKNOWN", message: passportMessage("passport.imageUnreadable"), technical: true } };
  }

  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const crop = centerCropForAspectRatio(sourceWidth, sourceHeight);
  const longEdge = Math.max(crop.sw, crop.sh);
  if (longEdge < MIN_CAPTURE_LONG_EDGE) {
    bitmap.close();
    return {
      ok: false,
      failure: {
        code: "OCR_VALIDATION_FAILED",
        message: passportMessage("passport.imageTooSmall"),
      },
    };
  }

  if (!isCropAspectRatioValid(crop)) {
    bitmap.close();
    return {
      ok: false,
      failure: {
        code: "DOCUMENT_CROPPED",
        message: passportMessage("passport.cropFailed"),
      },
    };
  }

  const outputScale = Math.min(1, Math.max(1600 / longEdge, 0));
  const canvasWidth = Math.max(1, Math.round(crop.sw * outputScale));
  const canvasHeight = Math.max(1, Math.round(crop.sh * outputScale));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { ok: false, failure: { code: "UNKNOWN", message: passportMessage("passport.imageUnreadable"), technical: true } };
  }
  context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) {
    return { ok: false, failure: { code: "UNKNOWN", message: passportMessage("passport.imageUnreadable"), technical: true } };
  }
  return {
    ok: true,
    file: new File([blob], "passport-capture.jpg", { type: "image/jpeg" }),
    sourceWidth,
    sourceHeight,
    crop,
    canvasWidth,
    canvasHeight,
  };
}

function videoGuideSourceCrop(video: HTMLVideoElement) {
  const box = video.getBoundingClientRect();
  const renderedWidth = box.width || video.clientWidth;
  const renderedHeight = box.height || video.clientHeight;
  if (video.videoWidth === 0 || video.videoHeight === 0 || renderedWidth === 0 || renderedHeight === 0) return null;
  const guide = passportGuideRect(renderedWidth, renderedHeight);
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    renderedWidth,
    renderedHeight,
    guide,
    objectFit: "cover",
  });
  return { renderedWidth, renderedHeight, guide, crop };
}

async function semanticFrameFile(video: HTMLVideoElement): Promise<File> {
  const mapped = videoGuideSourceCrop(video);
  if (!mapped) throw new Error("Passport frame could not be prepared.");
  const crop = mapped.crop;
  const maxLongEdge = 800;
  const scale = Math.min(1, maxLongEdge / Math.max(crop.sw, crop.sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.sw * scale));
  canvas.height = Math.max(1, Math.round(crop.sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Passport frame could not be prepared.");
  context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Passport frame could not be prepared.");
  return new File([blob], "passport-live-preflight.jpg", { type: "image/jpeg" });
}

async function readyCaptureCandidate(video: HTMLVideoElement, captureId: number, capturedAt: number, quality: PassportQualityResult | null): Promise<ReadyCaptureCandidate | null> {
  const mapped = videoGuideSourceCrop(video);
  if (!mapped) return null;
  const crop = mapped.crop;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.sw));
  canvas.height = Math.max(1, Math.round(crop.sh));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) return null;
  return {
    capturedAt,
    borderEdgeRatio: quality?.metrics.borderEdgeRatio ?? 0,
    cropValid: isCropAspectRatioValid(crop),
    documentCoverage: quality?.metrics.documentCoverage ?? 0,
    edgeVariance: quality?.metrics.edgeVariance ?? 0,
    file: new File([blob], "passport-capture.jpg", { type: "image/jpeg" }),
    debug: {
      captureId,
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      renderedWidth: mapped.renderedWidth,
      renderedHeight: mapped.renderedHeight,
      objectFitScale: crop.scale,
      guide: mapped.guide,
      crop,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      finalBlobBytes: blob.size,
    },
  };
}

function semanticInstruction(preflight: PassportLivePreflight, translate: (key: string) => string): string {
  if (preflight.instruction === "ready") return translate("ready");
  if (preflight.instruction === "move_inside_frame") return translate("movePassportInsideFrame");
  if (preflight.instruction === "open_biodata_page") return translate("openBiodataPage");
  if (preflight.instruction === "move_closer") return translate("moveCloser");
  if (preflight.instruction === "show_bottom_code") return translate("showBottomCode");
  if (preflight.instruction === "hold_steady") return translate("holdSteady");
  if (preflight.instruction === "more_light") return translate("moreLightNeeded");
  if (!preflight.biodataPageDetected) return translate("openBiodataPage");
  if (!preflight.documentInsideFrame) return translate("movePassportInsideFrame");
  if (!preflight.mrzLikelyVisible) return translate("showBottomCode");
  return translate("searchingForPassport");
}

function localLiveInstruction(quality: PassportQualityResult, translate: (key: string) => string): string {
  if (quality.blockingIssue === "IMAGE_TOO_DARK") return translate("moreLightNeeded");
  if (quality.blockingIssue === "IMAGE_BLURRED") return translate("holdSteady");
  if (quality.blockingIssue === "DOCUMENT_TOO_SMALL") return translate("moveCloser");
  if (quality.blockingIssue === "DOCUMENT_CROPPED") return translate("movePassportInsideFrame");
  return translate("searchingForPassport");
}

function waitForVideoEvent(video: HTMLVideoElement, events: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => cleanup(() => reject(new Error("Video metadata timed out."))), timeoutMs);
    const onReady = () => cleanup(resolve);
    const cleanup = (done: () => void) => {
      window.clearTimeout(timeout);
      events.forEach((event) => video.removeEventListener(event, onReady));
      done();
    };
    events.forEach((event) => video.addEventListener(event, onReady, { once: true }));
  });
}

function waitForLiveVideoFrame(video: HTMLVideoElement, stream: MediaStream, timeoutMs: number): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const liveTrack = stream.getVideoTracks().some((track) => track.readyState === "live");
      if (liveTrack && video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Camera preview timed out."));
        return;
      }
      window.requestAnimationFrame(check);
    }
    check();
  });
}

function cameraErrorMessage(error: unknown, translate: ReturnType<typeof useLanguage>["translate"]): { status: CameraStartupState; message: string } {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    return { status: "permission_denied", message: translate("cameraUnavailable") };
  }
  if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "OverconstrainedError")) {
    return { status: "unavailable", message: translate("cameraUnavailable") };
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return { status: "failed", message: translate("cameraPreviewFailed") };
  }
  return { status: "failed", message: translate("cameraPreviewFailed") };
}
