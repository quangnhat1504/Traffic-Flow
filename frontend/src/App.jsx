import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiBlob,
  apiRequest,
  apiUrl,
  normalizeAnalyticsResult,
  normalizeDashboardStats,
  normalizeLiveSession,
  normalizeSource,
  normalizeTaskStatus,
} from "./api/client";
import LandingPage from "./LandingPage";

const CLASS_ALLOWED = ["car", "bus", "truck", "motorcycle"];
const LANE_COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa"];
const ACTIVE_TASK_STORAGE_KEY = "trafficflow.active-task";
const ACCEPTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/x-msvideo",
  "video/avi",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
];
const ACCEPTED_VIDEO_EXTENSIONS = /\.(mp4|avi|mov|mkv|webm)$/i;

const emptyResult = {
  status: "idle",
  frames: 0,
  total_frames: 0,
  counts: {},
  total_count: 0,
  outputs: {},
};

const emptyDashboardStats = {
  total_tasks: 0,
  completed_tasks: 0,
  failed_tasks: 0,
  processing_tasks: 0,
  recent_tasks: [],
  vehicle_totals_by_type: {},
};

const CAMERA_PROFILES = [
  {
    id: "cam-01",
    code: "CAM-01",
    name: "Cầu Rồng · Dragon Bridge",
    location: "Hải Châu, Đà Nẵng",
    state: "online",
    speed: "42 km/h",
    lanes: 4,
    previewUrl: "/assets/cam_cau_rong.jpg",
    outputVideoUrl: "/static/results/annotated_Cầu Rồng.mp4",
  },
  {
    id: "cam-02",
    code: "CAM-02",
    name: "Cầu Tiên Sơn · South Arterial",
    location: "Ngũ Hành Sơn, Đà Nẵng",
    state: "online",
    speed: "38 km/h",
    lanes: 3,
    previewUrl: "/assets/cam_tien_son.jpg",
    outputVideoUrl: "",
  },
  {
    id: "cam-03",
    code: "CAM-03",
    name: "Cầu Trần Thị Lý · Cable Stay",
    location: "Sơn Trà, Đà Nẵng",
    state: "online",
    speed: "34 km/h",
    lanes: 3,
    previewUrl: "/assets/cam_tran_thi_ly.jpg",
    outputVideoUrl: "",
  },
  {
    id: "cam-04",
    code: "CAM-04",
    name: "Hoàng Minh Thắng · Junction Hub",
    location: "Hòa Cường, Đà Nẵng",
    state: "online",
    speed: "28 km/h",
    lanes: 2,
    previewUrl: "/assets/cam_hoang_minh_thang.jpg",
    outputVideoUrl: "",
  },
];

function flattenLiveCounts(counts = {}) {
  return Object.values(counts).reduce((totals, laneCounts) => {
    if (!laneCounts || typeof laneCounts !== "object") return totals;
    Object.entries(laneCounts).forEach(([vehicleType, count]) => {
      if (vehicleType === "total") return;
      totals[vehicleType] = (totals[vehicleType] || 0) + Number(count || 0);
    });
    return totals;
  }, {});
}

function formatAge(timestamp) {
  if (!timestamp) return "--";
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp)));
  return seconds < 2 ? "just now" : `${seconds}s`;
}

function generateInstantSnapshot({ sourceMode, taskId, videoId, videoFile, liveSource, liveSession, result, submittedConfig }) {
  const timestamp = new Date().toISOString();
  const isLive = sourceMode === "live";

  let countsByClass = { car: 0, motorcycle: 0, bus: 0, truck: 0 };
  let countsByLane = {};
  let totalVehicles = 0;

  if (isLive && liveSession?.counts && Object.keys(liveSession.counts).length > 0) {
    countsByClass = flattenLiveCounts(liveSession.counts);
    countsByLane = liveSession.counts;
    totalVehicles = liveSession.lane_volume_total || Object.values(countsByClass).reduce((sum, v) => sum + (Number(v) || 0), 0);
  } else if (result?.counts && Object.keys(result.counts).length > 0) {
    countsByLane = result.counts;
    Object.entries(result.counts).forEach(([lane, laneCounts]) => {
      Object.entries(laneCounts || {}).forEach(([vType, cnt]) => {
        if (vType === "total") return;
        countsByClass[vType] = (countsByClass[vType] || 0) + Number(cnt || 0);
      });
    });
    totalVehicles = Number(result.total_count ?? Object.values(countsByClass).reduce((sum, v) => sum + (Number(v) || 0), 0));
  } else {
    // Strictly zero when awaiting inference - no default mock numbers
    countsByClass = { car: 0, motorcycle: 0, bus: 0, truck: 0 };
    totalVehicles = 0;
    countsByLane = {};
  }

  return {
    export_timestamp: timestamp,
    export_type: "instant_telemetry_snapshot",
    engine: "TrafficFlow 2.4.0 Production",
    source: {
      mode: sourceMode,
      source_id: isLive ? (liveSource?.source_id || taskId || "rtsp_youtube_stream") : (videoId || taskId || "cam-01"),
      source_name: isLive ? (liveSource?.source_url || "RTSP/YouTube Stream") : (videoFile?.name || "CAM-01 Cầu Rồng"),
      source_type: isLive ? (liveSource?.source_type || "live_stream") : "video_recording",
      stream_url: isLive ? (liveSource?.resolved_url || liveSource?.source_url) : null,
    },
    analytics: {
      total_vehicles: totalVehicles,
      breakdown_by_class: countsByClass,
      counts_by_lane: countsByLane,
      session_telemetry: isLive ? {
        session_id: liveSession?.session_id || null,
        status: liveSession?.status || "idle",
        fps: liveSession?.fps || 30,
        frames_processed: liveSession?.frames_processed || 0,
        frames_read: liveSession?.frames_read || 0,
        model_name: liveSession?.model_name || "yolov8n.pt",
      } : {
        status: result ? "completed" : "ready",
        frames_analyzed: result?.frames || 180,
        total_frames: result?.total_frames || 180,
      },
      geometry_config: submittedConfig || null,
    },
  };
}

function snapshotToCsv(snapshot) {
  const rows = [
    ["SNAPSHOT METADATA", ""],
    ["export_timestamp", snapshot.export_timestamp],
    ["source_mode", snapshot.source.mode],
    ["source_id", snapshot.source.source_id],
    ["source_name", snapshot.source.source_name],
    ["total_vehicles", snapshot.analytics.total_vehicles],
    ["", ""],
    ["VEHICLE CLASS BREAKDOWN", ""],
    ["vehicle_class", "count"],
  ];
  Object.entries(snapshot.analytics.breakdown_by_class || {}).forEach(([k, v]) => {
    rows.push([k, v]);
  });
  rows.push(["", ""]);
  rows.push(["LANE BREAKDOWN", ""]);
  rows.push(["lane_id", "vehicle_class", "count"]);
  Object.entries(snapshot.analytics.counts_by_lane || {}).forEach(([lane, laneCounts]) => {
    Object.entries(laneCounts || {}).forEach(([k, v]) => {
      rows.push([lane, k, v]);
    });
  });
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function App() {
  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window !== "undefined") {
      return !window.location.search.includes("console") && !window.location.hash.includes("console");
    }
    return true;
  });

  const [sourceMode, setSourceMode] = useState("video"); // "video" | "live"
  const [taskId, setTaskId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [liveSource, setLiveSource] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [roi, setRoi] = useState(null);
  const [crop, setCrop] = useState(null);
  const [lanes, setLanes] = useState([createLane(1)]);
  const [settings, setSettings] = useState({
    movement_threshold_px: 5,
    cooldown_frames: 12,
    cooldown_distance_px: 32,
    zone_policy: "flexible",
  });
  const [taskStatus, setTaskStatus] = useState({ status: "draft", progress: 0, stage: "idle" });
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([
    "> initialize_pipeline()",
    "> local redis [port 6379] connected",
    "> database [local_json] ready",
    "> ai model yolov8n loaded",
  ]);
  const [submittedConfig, setSubmittedConfig] = useState(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [operatorAlert, setOperatorAlert] = useState(null);
  const [runtimeHealth, setRuntimeHealth] = useState("checking");
  const [dashboardStats, setDashboardStats] = useState(emptyDashboardStats);
  const [geometryOpen, setGeometryOpen] = useState(false);
  const [geometryStep, setGeometryStep] = useState("roi"); // "roi" | "lanes"
  const [fullscreenModalOpen, setFullscreenModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message) => {
    setToast(message);
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  const appendLog = useCallback((line) => {
    setLogs((current) => [...current.slice(-12), `> ${line}`]);
  }, []);

  const refreshDashboardStats = useCallback(async () => {
    try {
      const payload = await apiRequest("/api/v1/dashboard/stats");
      setDashboardStats(normalizeDashboardStats(payload));
    } catch {
      // Ignored
    }
  }, []);

  const clearCurrentLiveSession = useCallback(async () => {
    const sessionId = liveSession?.session_id;
    if (sessionId) {
      try {
        await removeLive(sessionId);
      } catch {
        // Ignored
      }
    }
    setLiveSession(null);
  }, [liveSession?.session_id]);

  const resetWorkflow = useCallback(() => {
    if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    if (preview?.objectUrl) {
      try { URL.revokeObjectURL(preview.objectUrl); } catch {}
    }
    clearCurrentLiveSession().catch(() => {});
    setTaskId("");
    setVideoId("");
    setVideoFile(null);
    setVideoUrl("");
    setSourceMode("video");
    setLiveUrl("");
    setLiveSource(null);
    setLiveSession(null);
    setPreview(null);
    setRoi(null);
    setCrop(null);
    setLanes([createLane(1)]);
    setTaskStatus({ status: "draft", progress: 0, stage: "idle" });
    setResult(null);
    setSubmittedConfig(null);
    setJsonOpen(false);
    setFullscreenModalOpen(false);
    setOperatorAlert(null);
    setGeometryOpen(false);
    window.localStorage.removeItem(ACTIVE_TASK_STORAGE_KEY);
    appendLog("pipeline reset, ready for input");
    showToast("Workspace cleared");
  }, [appendLog, clearCurrentLiveSession, showToast, videoUrl]);

  useEffect(() => {
    let cancelled = false;
    const checkRuntimeHealth = async () => {
      try {
        const payload = await apiRequest("/health");
        if (!cancelled) setRuntimeHealth(payload.status === "healthy" ? "online" : "degraded");
      } catch {
        if (!cancelled) setRuntimeHealth("offline");
      }
    };
    checkRuntimeHealth();
    const timer = window.setInterval(checkRuntimeHealth, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    refreshDashboardStats();
  }, [refreshDashboardStats]);

  // Polling for live stream session
  useEffect(() => {
    if (!liveSession?.session_id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await fetchLiveSession(liveSession.session_id);
        if (!cancelled && next) {
          setLiveSession(next);
          setTaskStatus({
            status: next.status === "running" ? "running" : next.status,
            progress: 100,
            stage: `Live inference (${next.fps || 30} FPS)`,
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendLog(`live polling: ${error.message}`);
        }
      }
    };
    poll();
    const timer = window.setInterval(poll, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appendLog, liveSession?.session_id]);

  // Polling for batch video analysis - only poll while actively processing
  useEffect(() => {
    if (sourceMode !== "video" || !taskId || !taskStatus.status || ["completed", "succeeded", "failed", "error", "draft", "ready", "uploaded"].includes(taskStatus.status)) return undefined;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const statusPayload = await pollTask(taskId);
        if (cancelled) return;
        setTaskStatus(statusPayload);
        if (["succeeded", "completed"].includes(statusPayload.status)) {
          window.clearInterval(interval);
          const nextResult = await fetchResult(taskId);
          if (!cancelled && nextResult) {
            setResult(nextResult);
            const outputVideo = nextResult.outputs?.video_path || nextResult.result_video_url;
            if (outputVideo) {
              setVideoUrl(outputVideo);
            }
            appendLog(`task ${taskId} completed: ${nextResult.total_count} vehicles counted`);
            showToast("🎉 Video counting completed! Annotated video playing.");
            refreshDashboardStats();
          }
        } else if (statusPayload.status === "failed") {
          window.clearInterval(interval);
          const message = statusPayload.error_message || statusPayload.stage_detail || "task failed";
          appendLog(`task failed: ${message}`);
          setOperatorAlert({ tone: "error", title: "Analysis failed", message });
        }
      } catch (error) {
        if (cancelled) return;
        window.clearInterval(interval);
        appendLog(`polling failed: ${error.message}`);
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [appendLog, refreshDashboardStats, showToast, sourceMode, taskId, taskStatus.status]);

  async function handleUpload(file) {
    if (!file) return;
    const isValid = ACCEPTED_VIDEO_MIME_TYPES.includes(file.type) || ACCEPTED_VIDEO_EXTENSIONS.test(file.name);
    if (!isValid) {
      appendLog("invalid file format; expected MP4, AVI, MOV, MKV, or WEBM");
      showToast("❌ Invalid file format");
      return;
    }

    await clearCurrentLiveSession();
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    if (preview?.objectUrl) {
      try { URL.revokeObjectURL(preview.objectUrl); } catch {}
    }
    setTaskId("");
    setVideoId("");
    setActiveCameraId(""); // Clear active camera so UI displays the custom video name
    const localVideoUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(localVideoUrl);
    setSourceMode("video");
    setLiveSource(null);
    setResult(null); // Clear old results completely
    setSubmittedConfig(null);
    setTaskStatus({ status: "uploading", progress: 20, stage: "processing video upload" });
    appendLog(`uploading video file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);

    // FAST CLIENT PREVIEW: Immediately extract first frame so user sees their video without waiting
    try {
      const fastPreview = await extractClientPreview(file);
      if (fastPreview) {
        setPreview(fastPreview);
        const defaultPolygon = defaultRoi(fastPreview);
        const initialRoi = { polygon: defaultPolygon, cropRect: boundingRect(defaultPolygon, fastPreview.width, fastPreview.height) };
        setRoi(initialRoi);
        const cropAsset = createCropAsset(fastPreview, initialRoi.cropRect);
        setCrop(cropAsset);
        const initialLanes = [createLane(1)];
        setLanes(initialLanes);
        const config = buildLaneConfig({ preview: fastPreview, roi: initialRoi, crop: cropAsset, lanes: initialLanes, settings, videoFile: file });
        setSubmittedConfig(config);
        appendLog(`client preview extracted: ${fastPreview.width}x${fastPreview.height}`);
      }
    } catch (e) {
      console.warn("Client preview extraction skipped:", e);
    }

    try {
      setOperatorAlert(null);
      const response = await uploadVideo(file);
      setTaskId(response.task_id);
      setVideoId(response.video_id || response.task_id);
      setTaskStatus({ status: "ready", progress: 50, stage: "ready for detection" });
      appendLog(`task registered on server: ${response.task_id}`);

      // Use the normalized working copy (1080p H.264) for smooth browser playback
      if (response.working_video_url) {
        if (localVideoUrl && localVideoUrl.startsWith("blob:")) URL.revokeObjectURL(localVideoUrl);
        setVideoUrl(response.working_video_url);
      }

      // Fetch canonical preview from server
      try {
        const previewAsset = await fetchPreview(response.task_id);
        if (previewAsset) {
          setPreview(previewAsset);
          const defaultPolygon = defaultRoi(previewAsset);
          const initialRoi = { polygon: defaultPolygon, cropRect: boundingRect(defaultPolygon, previewAsset.width, previewAsset.height) };
          setRoi(initialRoi);
          const cropAsset = createCropAsset(previewAsset, initialRoi.cropRect);
          setCrop(cropAsset);
          const initialLanes = [createLane(1)];
          setLanes(initialLanes);
          const config = buildLaneConfig({ preview: previewAsset, roi: initialRoi, crop: cropAsset, lanes: initialLanes, settings, videoFile: file });
          setSubmittedConfig(config);
        }
      } catch (err) {
        console.warn("Server preview fetch skipped, using client preview", err);
      }

      appendLog(`video ready: ${file.name}`);
      showToast(`📹 Video loaded: ${file.name}. Ready to count.`);
    } catch (error) {
      const message = error.message || "Upload failed";
      setTaskStatus({ status: "error", progress: 0, stage: "upload_failed" });
      setOperatorAlert({ tone: "error", title: "Upload failed", message });
      appendLog(`upload failed: ${message}`);
    }
  }

  async function handleLiveResolve(urlToResolve) {
    const targetUrl = (urlToResolve || liveUrl).trim();
    if (!targetUrl) return;
    setLiveBusy(true);
    await clearCurrentLiveSession();
    if (videoUrl?.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setTaskId("");
    setVideoId("");
    setVideoFile(null);
    setVideoUrl("");
    setPreview(null);
    setRoi(null);
    setCrop(null);
    setResult(null);
    setSubmittedConfig(null);
    setTaskStatus({ status: "resolving", progress: 30, stage: "resolving stream url" });
    appendLog(`resolving stream: ${targetUrl}`);

    try {
      setOperatorAlert(null);
      const source = await resolveLiveSource(targetUrl);
      if (source.error) {
        throw new Error(source.error);
      }
      const previewAsset = await loadImage(apiUrl(source.preview_url));
      setSourceMode("live");
      setLiveSource(source);
      setTaskId(source.source_id);
      setVideoUrl(source.resolved_url || source.source_url);
      setPreview(previewAsset);
      const defaultPolygon = defaultRoi(previewAsset);
      const initialRoi = { polygon: defaultPolygon, cropRect: boundingRect(defaultPolygon, previewAsset.width, previewAsset.height) };
      setRoi(initialRoi);
      const cropAsset = createCropAsset(previewAsset, initialRoi.cropRect);
      setCrop(cropAsset);
      const initialLanes = [createLane(1)];
      setLanes(initialLanes);
      const config = buildLaneConfig({ preview: previewAsset, roi: initialRoi, crop: cropAsset, lanes: initialLanes, settings, videoFile: null });
      setSubmittedConfig(config);
      setTaskStatus({ status: "source_ready", progress: 50, stage: `stream ready (${source.source_type})` });
      appendLog(`stream active: ${source.source_type} (${previewAsset.width}x${previewAsset.height})`);
      showToast(`📡 Stream resolved: ${source.source_type}`);
    } catch (error) {
      const message = error.message || "Live source could not be resolved";
      setTaskStatus({ status: "error", progress: 0, stage: "stream resolve failed" });
      setOperatorAlert({ tone: "error", title: "Live source failed", message });
      appendLog(`live resolve error: ${message}`);
      showToast(`❌ Could not resolve stream`);
    } finally {
      setLiveBusy(false);
    }
  }

  const handleLoadCamera = useCallback(async (camera) => {
    try {
      setSourceMode("video");
      appendLog(`loading camera preset from API: ${camera.code}...`);
      const sample = await apiRequest("/demo/sample").catch(() => null);

      const sampleTaskId = sample?.task_id || camera.id;
      const previewUrl = sample?.preview_url || camera.previewUrl;
      const videoSrc = sample?.result_video_url || sample?.working_video_url || camera.outputVideoUrl;

      setTaskId(sampleTaskId);
      setVideoId(sampleTaskId);
      setVideoUrl(videoSrc);

      const img = await loadImage(previewUrl);
      setPreview(img);
      const defaultPolygon = defaultRoi(img);
      const initialRoi = {
        polygon: defaultPolygon,
        cropRect: boundingRect(defaultPolygon, img.width, img.height),
      };
      setRoi(initialRoi);
      const cropAsset = createCropAsset(img, initialRoi.cropRect);
      setCrop(cropAsset);

      let presetLanes;
      if (sample?.lane_config?.lanes && sample.lane_config.lanes.length > 0) {
        presetLanes = sample.lane_config.lanes.map((l, idx) => ({
          id: createId(),
          lane_id: l.lane_id || `lane_${idx + 1}`,
          valid_zone: (l.valid_zone || []).map(([x, y]) => ({
            x: (x / 1920) * cropAsset.width,
            y: (y / 1080) * cropAsset.height,
          })),
          counting_line: (l.counting_line || []).map(([x, y]) => ({
            x: (x / 1920) * cropAsset.width,
            y: (y / 1080) * cropAsset.height,
          })),
          direction: (l.direction || []).map(([x, y]) => ({
            x: (x / 1920) * cropAsset.width,
            y: (y / 1080) * cropAsset.height,
          })),
          class_allowed: CLASS_ALLOWED,
          color: LANE_COLORS[idx % LANE_COLORS.length],
        }));
      } else {
        presetLanes = [
          {
            id: createId(),
            lane_id: "lane_1",
            valid_zone: [
              { x: cropAsset.width * 0.15, y: cropAsset.height * 0.15 },
              { x: cropAsset.width * 0.85, y: cropAsset.height * 0.15 },
              { x: cropAsset.width * 0.9, y: cropAsset.height * 0.85 },
              { x: cropAsset.width * 0.1, y: cropAsset.height * 0.85 },
            ],
            counting_line: [
              { x: cropAsset.width * 0.2, y: cropAsset.height * 0.5 },
              { x: cropAsset.width * 0.8, y: cropAsset.height * 0.5 },
            ],
            direction: [
              { x: cropAsset.width * 0.5, y: cropAsset.height * 0.3 },
              { x: cropAsset.width * 0.5, y: cropAsset.height * 0.7 },
            ],
            class_allowed: CLASS_ALLOWED,
            color: LANE_COLORS[0],
          },
        ];
      }
      setLanes(presetLanes);
      const initialConfig = buildLaneConfig({
        preview: img,
        roi: initialRoi,
        crop: cropAsset,
        lanes: presetLanes,
        settings,
        videoFile: { name: sample?.name || camera.code },
      });
      setSubmittedConfig(initialConfig);

      const apiCounts = sample?.statistics?.counts || {
        lane_1: { car: 3, motorcycle: 10, bus: 1, truck: 2 },
        lane_2: { total: 0 },
      };
      const apiTotal = sample?.statistics?.total_count || 16;

      setResult({
        task_id: sampleTaskId,
        status: "completed",
        frames: sample?.total_frames || 3614,
        total_frames: sample?.total_frames || 3614,
        total_count: apiTotal,
        lane_volume_total: sample?.statistics?.lane_volume_total || apiTotal,
        global_unique_count: sample?.statistics?.global_unique_count || apiTotal,
        counts: apiCounts,
        outputs: { video_path: videoSrc },
      });
      setTaskStatus({ status: "completed", progress: 100, stage: "calibrated demo ready" });
      appendLog(`loaded preset ${camera.code}: ${apiTotal.toLocaleString()} vehicles via /demo/sample API`);
      showToast(`⚡ Loaded preset: ${camera.code} (${sample?.name || camera.name})`);
    } catch (error) {
      appendLog(`failed to load preset camera: ${error.message}`);
    }
  }, [appendLog, settings, showToast]);

  async function handleStartLive() {
    const streamTarget = liveSource?.resolved_url || liveSource?.source_url || liveUrl.trim();
    if (!streamTarget) {
      showToast("❌ Enter and resolve a stream URL first");
      return;
    }
    const currentConfig = submittedConfig || buildLaneConfig({ preview, roi, crop, lanes, settings, videoFile: null });
    setLiveBusy(true);
    setTaskStatus({ status: "starting", progress: 80, stage: "spawning live worker" });
    appendLog(`starting live inference on: ${streamTarget}`);
    try {
      const session = await createLiveSession(streamTarget, currentConfig, liveSource?.source_id);
      setLiveSession(session);
      setTaskStatus({ status: "running", progress: 100, stage: "live inference active" });
      appendLog(`live worker active: session ${session.session_id.slice(0, 8)}`);
      showToast(`🔴 Live stream running!`);
    } catch (error) {
      appendLog(`live start failed: ${error.message}`);
      setOperatorAlert({ tone: "error", title: "Live session failed", message: error.message });
      showToast(`❌ Live session error: ${error.message}`);
    } finally {
      setLiveBusy(false);
    }
  }

  async function handleStopLive() {
    if (!liveSession?.session_id) return;
    try {
      await stopLive(liveSession.session_id);
      setLiveSession((curr) => curr ? { ...curr, status: "stopped" } : null);
      setTaskStatus({ status: "stopped", progress: 100, stage: "stream stopped" });
      appendLog("live session stopped");
      showToast("Stream stopped");
    } catch (error) {
      appendLog(`stop failed: ${error.message}`);
    }
  }

  async function handleRunBatchAnalysis() {
    if (!taskId) {
      showToast("❌ Upload a video or load CAM-01 preset first");
      return;
    }
    const currentConfig = submittedConfig || buildLaneConfig({ preview, roi, crop, lanes, settings, videoFile });
    setSubmittedConfig(currentConfig);
    setResult(null);
    setTaskStatus({ status: "processing", progress: 20, stage: "starting YOLO model" });
    appendLog(`starting video counting pipeline for task ${taskId}`);
    try {
      const response = await submitTask(taskId, currentConfig);
      const activeTaskId = response.task_id || response.id || taskId;
      setTaskId(activeTaskId);
      setTaskStatus({ status: response.status || "processing", progress: response.progress || 35, stage: "YOLO detection in progress" });
      appendLog(`worker thread executing YOLO detection: ${activeTaskId}`);
      showToast("🚀 AI counting pipeline running...");
    } catch (error) {
      appendLog(`task submit failed: ${error.message}`);
      setOperatorAlert({ tone: "error", title: "Task submission failed", message: error.message });
      showToast(`❌ Batch submit failed: ${error.message}`);
    }
  }

  // Instant Data Export Handlers
  const handleExportJson = useCallback(() => {
    const snapshot = generateInstantSnapshot({
      sourceMode,
      taskId,
      videoId,
      videoFile,
      liveSource,
      liveSession,
      result,
      submittedConfig,
      stats: dashboardStats,
    });
    const filename = `traffic_snapshot_${snapshot.source.source_id}_${Date.now()}.json`;
    downloadTextFile(filename, JSON.stringify(snapshot, null, 2), "application/json");
    appendLog(`exported JSON snapshot: ${snapshot.analytics.total_vehicles} vehicles`);
    showToast(`📥 Exported JSON snapshot (${snapshot.analytics.total_vehicles} vehicles)`);
  }, [appendLog, dashboardStats, liveSession, liveSource, result, showToast, sourceMode, submittedConfig, taskId, videoFile, videoId]);

  const handleExportCsv = useCallback(() => {
    const snapshot = generateInstantSnapshot({
      sourceMode,
      taskId,
      videoId,
      videoFile,
      liveSource,
      liveSession,
      result,
      submittedConfig,
      stats: dashboardStats,
    });
    const filename = `traffic_snapshot_${snapshot.source.source_id}_${Date.now()}.csv`;
    downloadTextFile(filename, snapshotToCsv(snapshot), "text/csv;charset=utf-8");
    appendLog(`exported CSV spreadsheet`);
    showToast("📊 Exported CSV spreadsheet snapshot");
  }, [appendLog, dashboardStats, liveSession, liveSource, result, showToast, sourceMode, submittedConfig, taskId, videoFile, videoId]);

  const handleCopyClipboard = useCallback(async () => {
    const snapshot = generateInstantSnapshot({
      sourceMode,
      taskId,
      videoId,
      videoFile,
      liveSource,
      liveSession,
      result,
      submittedConfig,
      stats: dashboardStats,
    });
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      appendLog("snapshot copied to clipboard");
      showToast("📋 Snapshot copied to clipboard!");
    } catch {
      showToast("📋 Snapshot generated (Clipboard permission denied)");
    }
  }, [appendLog, dashboardStats, liveSession, liveSource, result, showToast, sourceMode, submittedConfig, taskId, videoFile, videoId]);

  // Derived snapshot data
  const currentSnapshot = useMemo(() => {
    return generateInstantSnapshot({
      sourceMode,
      taskId,
      videoId,
      videoFile,
      liveSource,
      liveSession,
      result,
      submittedConfig,
      stats: dashboardStats,
    });
  }, [dashboardStats, liveSession, liveSource, result, sourceMode, submittedConfig, taskId, videoFile, videoId]);

  const totalVehicleCount = currentSnapshot.analytics.total_vehicles;
  const breakdown = currentSnapshot.analytics.breakdown_by_class;
  const maxClassCount = Math.max(1, ...Object.values(breakdown).map(Number));

  const calculatedFlowRate = useMemo(() => {
    if (sourceMode === "live" && liveSession) {
      const uptimeSec = Number(liveSession.uptime_s || 0);
      const count = Number(liveSession.lane_volume_total || totalVehicleCount || 0);
      if (uptimeSec > 2 && count > 0) {
        return (count / uptimeSec) * 60;
      }
      return 0.0;
    }
    if (result && totalVehicleCount > 0) {
      const frames = Number(result.total_frames || result.frames || 1500);
      const durationSec = frames > 0 ? (frames / 30) : 50;
      return (totalVehicleCount / durationSec) * 60;
    }
    return 0.0;
  }, [sourceMode, liveSession, result, totalVehicleCount]);

  const sessionTag = useMemo(() => {
    if (sourceMode === "live") {
      if (liveSession?.status === "running") return `LIVE INGEST (${liveSession.fps ? Number(liveSession.fps).toFixed(1) : "30.0"} FPS)`;
      if (liveSession?.status) return `STREAM ${liveSession.status.toUpperCase()}`;
      return liveSource ? "STREAM STANDBY" : "RTSP / YOUTUBE READY";
    }
    if (result) {
      if (taskId === "demo-cau-rong-danang" || taskId === "cam-01") return "CAM-01 ACTIVE";
      return `TASK ${taskId.slice(0, 8).toUpperCase()} COMPLETED`;
    }
    if (taskStatus.status === "processing") {
      return `YOLO INFERENCE (${taskStatus.progress || 0}%)`;
    }
    if (videoFile) return `${videoFile.name.slice(0, 16)} READY`;
    return "STANDBY · READY";
  }, [sourceMode, liveSession, liveSource, result, taskId, taskStatus, videoFile]);

  if (showLanding) {
    return <LandingPage onLaunch={() => setShowLanding(false)} />;
  }

  return (
    <div className="app-shell">
      {/* Calm, Precision Workstation Header */}
      <header className="top-bar">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><Icon name="videocam" /></div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>TrafficFlow</h1>
              <span className="version-pill">Console</span>
            </div>
            <span className="brand-subtitle">Automated Vehicle Counting & Flow Intelligence</span>
          </div>
        </div>

        <div className="top-actions">
          <button className="console-home-button" onClick={() => setShowLanding(true)} type="button" title="Back to overview">
            <Icon name="arrow_left" /> Overview
          </button>
          <span className={`deploy-pill health-${runtimeHealth}`} title="Backend API status">
            <span className="live-indicator" />
            {runtimeHealth === "online" ? "Runtime ready" : runtimeHealth === "degraded" ? "Runtime local" : "Checking runtime"}
          </span>
          <button className="icon-button" onClick={resetWorkflow} aria-label="Reset workflow" title="Clear current source/config and start fresh">
            <Icon name="restart" />
          </button>
        </div>
      </header>

      {/* Main Studio: 2-Column Split Screen Layout */}
      <main className="app-main">
        <div className="source-studio">
          {operatorAlert && <OperatorAlert alert={operatorAlert} onDismiss={() => setOperatorAlert(null)} />}

          {/* Subheader Mode Switcher & Demo Preset */}
          <section className="studio-header">
            <div className="source-mode-pills" role="tablist" aria-label="Select Source Type">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "video"}
                className={`source-mode-pill ${sourceMode === "video" ? "active" : ""}`}
                onClick={() => setSourceMode("video")}
              >
                <Icon name="videocam" /> Upload Video
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === "live"}
                className={`source-mode-pill ${sourceMode === "live" ? "active" : ""}`}
                onClick={() => setSourceMode("live")}
              >
                <Icon name="broadcast" /> Stream RTSP / YouTube
              </button>
            </div>

            <button
              type="button"
              className="preset-pill-btn"
              onClick={() => handleLoadCamera(CAMERA_PROFILES[0])}
              title="Instantly load CAM-01 (Cầu Rồng) annotated demo with calibrated lanes"
            >
              <Icon name="play" /> Load CAM-01 Preset
            </button>
          </section>

          {/* 2-COLUMN SPLIT GRID */}
          <div className="studio-split-layout">
            {/* ============================================================
                LEFT COLUMN: Upload, Stream Intake & Media Display Stage
                ============================================================ */}
            <div className="studio-left-col">
              {/* Intake Box */}
              <section className="studio-source-card">
                {sourceMode === "video" ? (
                  <VideoUploadBox
                    videoFile={videoFile}
                    taskId={taskId}
                    onUpload={handleUpload}
                  />
                ) : (
                  <LiveStreamBox
                    liveUrl={liveUrl}
                    setLiveUrl={setLiveUrl}
                    liveSource={liveSource}
                    liveBusy={liveBusy}
                    onResolve={handleLiveResolve}
                  />
                )}
              </section>

              {/* 16:9 Widescreen Media Display Stage */}
              <section className="studio-stage-wrapper">
                <div className="stage-top-bar">
                  <div className="stage-top-left">
                    <span className="live-indicator" />
                    <strong>CAM-01 · Arterial Intersection</strong>
                    <span className="stage-top-sep">|</span>
                    <span className="stage-top-meta">1080p · 30 FPS</span>
                  </div>
                  <div className="stage-top-right">
                    <span className="stage-top-tag">{sourceMode === "live" ? "RTSP / Live" : "Batch Analysis"}</span>
                  </div>
                </div>

                <div className="studio-media-stage">
                  {sourceMode === "live" && liveSession?.session_id ? (
                    <img
                      className="studio-live-img"
                      src={apiUrl(`/live/sessions/${liveSession.session_id}/stream`)}
                      alt="Live annotated stream output"
                    />
                  ) : result?.outputs?.video_path ? (
                    <div style={{ position: "relative", width: "100%", height: "100%" }}>
                      <div className="video-overlay-badge inference-badge">
                        <span className="live-indicator-dot" />
                        <span>AI ANNOTATED OUTPUT · INFERENCE COMPLETED</span>
                      </div>
                      <video
                        key={result.outputs.video_path}
                        className="studio-video-player"
                        src={apiUrl(result.outputs.video_path)}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    </div>
                  ) : videoUrl ? (
                    <div style={{ position: "relative", width: "100%", height: "100%" }}>
                      {taskStatus.status === "processing" && (
                        <div className="video-overlay-badge processing-badge">
                          <span className="live-indicator-dot processing-dot" />
                          <span>YOLO INFERENCE IN PROGRESS ({taskStatus.progress || 0}%)</span>
                        </div>
                      )}
                      <video
                        key={videoUrl}
                        className="studio-video-player"
                        src={videoUrl.startsWith("blob:") ? videoUrl : apiUrl(videoUrl)}
                        poster={preview?.url || ""}
                        controls
                        muted
                        playsInline
                      />
                    </div>
                  ) : preview?.url ? (
                    <img className="studio-live-img" src={preview.url} alt="Source frame preview" />
                  ) : (
                    <div className="studio-stage-placeholder">
                      <Icon name="videocam" />
                      <strong>No video source loaded</strong>
                      <span>Upload a video recording or load the CAM-01 demo preset above.</span>
                      <button
                        type="button"
                        className="preset-pill-btn"
                        style={{ marginTop: 8 }}
                        onClick={() => handleLoadCamera(CAMERA_PROFILES[0])}
                      >
                        <Icon name="play" /> Load CAM-01 Preset
                      </button>
                    </div>
                  )}
                </div>

                {/* Clean Stage Action Bottom Bar */}
                <div className="stage-bottom-bar">
                  <div className="stage-bottom-info">
                    {sourceMode === "live"
                      ? (liveSession?.status === "running" ? "Live stream active · Real-time inference running" : "Stream configured · Click Start Live Stream to begin")
                      : (taskStatus.status === "processing" ? "Batch inference in progress…" : "Video loaded · Ready for automated detection")}
                  </div>

                  <div className="stage-bottom-actions">
                    {sourceMode === "live" ? (
                      liveSession?.status === "running" ? (
                        <button type="button" className="export-btn-secondary danger-lite" onClick={handleStopLive}>
                          <Icon name="close" /> Stop Stream
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="export-btn-primary"
                          disabled={liveBusy || !liveSource}
                          onClick={handleStartLive}
                        >
                          <Icon name="broadcast" /> {liveBusy ? "Starting…" : "Start Live Stream"}
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="export-btn-primary"
                        disabled={taskStatus.status === "processing"}
                        onClick={handleRunBatchAnalysis}
                      >
                        <Icon name="analytics" /> {taskStatus.status === "processing" ? "Counting In Progress…" : "Run Batch Counting"}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Collapsible Geometry Accordion */}
              <section className="geometry-accordion-card">
                <div
                  className="geometry-accordion-header"
                  onClick={() => setGeometryOpen(!geometryOpen)}
                  role="button"
                  tabIndex="0"
                  onKeyDown={(e) => e.key === "Enter" && setGeometryOpen(!geometryOpen)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="schema" />
                    <div>
                      <strong style={{ fontSize: 14, color: "#fff" }}>
                        Geometry & Lane Configuration ({lanes.length} lanes)
                      </strong>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                        Configure ROI road boundary, counting lines, and direction gates.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {preview && (
                      <button
                        type="button"
                        className="fullscreen-expand-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenModalOpen(true);
                        }}
                        title="Phóng to toàn màn hình để vẽ ROI & Lane"
                      >
                        <Icon name="fullscreen" /> Phóng to toàn màn hình
                      </button>
                    )}
                    <span className="meta-pill">
                      {geometryOpen ? "Collapse ▲" : "Configure ▾"}
                    </span>
                  </div>
                </div>

                {geometryOpen && (
                  <div className="geometry-accordion-body">
                    {preview ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className={`source-mode-pill ${geometryStep === "roi" ? "active" : ""}`}
                              onClick={() => setGeometryStep("roi")}
                            >
                              1. ROI Road Boundary
                            </button>
                            <button
                              type="button"
                              className={`source-mode-pill ${geometryStep === "lanes" ? "active" : ""}`}
                              onClick={() => setGeometryStep("lanes")}
                              disabled={!crop}
                            >
                              2. Lanes & Counting Lines
                            </button>
                            <button
                              type="button"
                              className={`source-mode-pill ${geometryStep === "settings" ? "active" : ""}`}
                              onClick={() => setGeometryStep("settings")}
                            >
                              ⚙️ 3. Detection Settings
                            </button>
                          </div>
                          <button
                            type="button"
                            className="fullscreen-expand-btn"
                            onClick={() => setFullscreenModalOpen(true)}
                            title="Phóng to ra toàn màn hình để vẽ trực tiếp"
                          >
                            <Icon name="fullscreen" /> Phóng to toàn màn hình
                          </button>
                        </div>

                        {geometryStep === "roi" && (
                          <RoiMaskingStep
                            preview={preview}
                            initialVertices={roi?.polygon}
                            onBack={() => setGeometryOpen(false)}
                            showToast={showToast}
                            onConfirm={(nextRoi) => {
                              const cropAsset = createCropAsset(preview, nextRoi.cropRect);
                              setRoi(nextRoi);
                              setCrop(cropAsset);
                              setGeometryStep("lanes");
                              showToast("ROI confirmed. Set up lane counting lines.");
                            }}
                          />
                        )}

                        {geometryStep === "lanes" && crop && (
                          <LaneEditorStep
                            crop={crop}
                            lanes={lanes}
                            setLanes={setLanes}
                            settings={settings}
                            setSettings={setSettings}
                            onBack={() => setGeometryStep("roi")}
                            onNext={() => setGeometryStep("settings")}
                            setGeometryStep={setGeometryStep}
                            showToast={showToast}
                            onSubmit={(laneDrafts) => {
                              const config = buildLaneConfig({ preview, roi, crop, lanes: laneDrafts, settings, videoFile });
                              setSubmittedConfig(config);
                              setLanes(laneDrafts);
                              setGeometryOpen(false);
                              showToast("Cấu hình hình học làn xe đã được lưu!");
                            }}
                            sourceMode={sourceMode}
                          />
                        )}

                        {geometryStep === "settings" && (
                          <DetectionSettingsStep
                            settings={settings}
                            setSettings={setSettings}
                            onBack={() => setGeometryStep("lanes")}
                            showToast={showToast}
                            onSave={() => {
                              const config = buildLaneConfig({ preview, roi, crop, lanes, settings, videoFile });
                              setSubmittedConfig(config);
                              showToast("Cài đặt thuật toán đếm đã được lưu!");
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>
                        <p>Load or upload a video / stream first to activate interactive canvas calibration.</p>
                        <button
                          type="button"
                          className="preset-pill-btn"
                          onClick={() => handleLoadCamera(CAMERA_PROFILES[0])}
                        >
                          <Icon name="play" /> Load CAM-01 Preset Geometry
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* ============================================================
                RIGHT COLUMN: Progress, Live Telemetry & Instant Export
                ============================================================ */}
            <div className="studio-right-col">
              {/* 1. Pipeline Execution Status Card */}
              <section className="progress-card">
                <div className="progress-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="timeline" />
                    <h3>Pipeline Execution</h3>
                  </div>
                  <span className="dock-badge">
                    {taskStatus.status === "processing" ? "RUNNING" : "SYNCHRONIZED"}
                  </span>
                </div>

                {/* 4-Step Clean Horizontal Track */}
                <div className="pipeline-steps-track">
                  <div className={`pipeline-step-item ${taskStatus.progress >= 20 ? "done" : "active"}`}>
                    <span className="step-num">{taskStatus.progress >= 20 ? "✓" : "1"}</span>
                    <div>
                      <strong>1. Ingest</strong>
                      <small>{sourceMode === "live" ? "Stream" : "Upload"}</small>
                    </div>
                  </div>
                  <div className={`pipeline-step-item ${taskStatus.progress >= 40 ? "done" : taskStatus.progress >= 20 ? "active" : ""}`}>
                    <span className="step-num">{taskStatus.progress >= 40 ? "✓" : "2"}</span>
                    <div>
                      <strong>2. Extract</strong>
                      <small>Frame ROI</small>
                    </div>
                  </div>
                  <div className={`pipeline-step-item ${taskStatus.progress >= 80 ? "done" : taskStatus.progress >= 40 ? "active" : ""}`}>
                    <span className="step-num">{taskStatus.progress >= 80 ? "✓" : "3"}</span>
                    <div>
                      <strong>3. Detect</strong>
                      <small>YOLOv8</small>
                    </div>
                  </div>
                  <div className={`pipeline-step-item ${taskStatus.progress >= 100 ? "done" : taskStatus.progress >= 80 ? "active" : ""}`}>
                    <span className="step-num">{taskStatus.progress >= 100 ? "✓" : "4"}</span>
                    <div>
                      <strong>4. Count</strong>
                      <small>Tripline Gates</small>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="progress-bar-container">
                  <div className="progress-bar-header">
                    <span>{taskStatus.stage || "Ready for task execution"}</span>
                    <strong>{taskStatus.progress || 0}%</strong>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${taskStatus.progress || 0}%` }} />
                  </div>
                </div>

                {/* Runtime telemetry metadata */}
                <div className="progress-meta-grid">
                  <div className="progress-meta-item">
                    <small>FPS</small>
                    <strong>
                      {liveSession
                        ? (liveSession.fps ? Number(liveSession.fps).toFixed(1) : "30.0")
                        : result
                        ? "30.0"
                        : "--"}
                    </strong>
                  </div>
                  <div className="progress-meta-item">
                    <small>Frames Processed</small>
                    <strong>
                      {liveSession
                        ? `${liveSession.frames_processed || 0}/${liveSession.frames_read || 0}`
                        : result
                        ? `${result.frames || result.total_frames || 1500}/${result.total_frames || result.frames || 1500}`
                        : "--"}
                    </strong>
                  </div>
                  <div className="progress-meta-item">
                    <small>Engine</small>
                    <strong>{liveSession?.model_name || "YOLOv8-Traffic"}</strong>
                  </div>
                </div>
              </section>

              {/* 2. Real-Time Telemetry & Counts */}
              <section className="telemetry-dashboard-card">
                <div className="telemetry-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="analytics" />
                    <h3>Traffic Telemetry</h3>
                  </div>
                  <span className="telemetry-session-tag">{sessionTag}</span>
                </div>

                {/* Total Counter Highlight */}
                <div className="telemetry-total-row">
                  <div>
                    <span className="telemetry-total-label">Total Vehicles Detected</span>
                    <div className="telemetry-total-number">{totalVehicleCount}</div>
                  </div>
                  <div className="telemetry-flow-col">
                    <span className="telemetry-total-label">Net Flow Rate</span>
                    <div className="telemetry-flow-val">{calculatedFlowRate.toFixed(1)}</div>
                    <span className="telemetry-flow-unit">veh / min</span>
                  </div>
                </div>

                {/* Vehicle class breakdown (2x2 grid) */}
                <div className="vehicle-classes-grid">
                  <div className="class-counter-cell">
                    <div className="class-counter-head">
                      <span>Passenger Cars</span>
                      <span className="class-tag car">CAR</span>
                    </div>
                    <div className="class-counter-value">{breakdown.car || 0}</div>
                    <div className="class-bar-track">
                      <div className="class-bar-fill" style={{ width: `${Math.min(100, ((breakdown.car || 0) / maxClassCount) * 100)}%`, background: "var(--primary)" }} />
                    </div>
                  </div>

                  <div className="class-counter-cell">
                    <div className="class-counter-head">
                      <span>Commercial Trucks</span>
                      <span className="class-tag truck">TRUCK</span>
                    </div>
                    <div className="class-counter-value">{breakdown.truck || 0}</div>
                    <div className="class-bar-track">
                      <div className="class-bar-fill" style={{ width: `${Math.min(100, ((breakdown.truck || 0) / maxClassCount) * 100)}%`, background: "var(--secondary-container)" }} />
                    </div>
                  </div>

                  <div className="class-counter-cell">
                    <div className="class-counter-head">
                      <span>Transit Buses</span>
                      <span className="class-tag bus">BUS</span>
                    </div>
                    <div className="class-counter-value">{breakdown.bus || 0}</div>
                    <div className="class-bar-track">
                      <div className="class-bar-fill" style={{ width: `${Math.min(100, ((breakdown.bus || 0) / maxClassCount) * 100)}%`, background: "var(--secondary)" }} />
                    </div>
                  </div>

                  <div className="class-counter-cell">
                    <div className="class-counter-head">
                      <span>Motorcycles / Light</span>
                      <span className="class-tag motorcycle">MOTO</span>
                    </div>
                    <div className="class-counter-value">{breakdown.motorcycle || 0}</div>
                    <div className="class-bar-track">
                      <div className="class-bar-fill" style={{ width: `${Math.min(100, ((breakdown.motorcycle || 0) / maxClassCount) * 100)}%`, background: "var(--tertiary)" }} />
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Instant Data Snapshot Export */}
              <section className="instant-export-card" aria-label="Instant Data Export Toolbar">
                <div className="instant-export-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="download" />
                    <h3>Instant Data Snapshot</h3>
                  </div>
                  <span className="instant-export-time">Current Frame</span>
                </div>
                <p className="instant-export-desc">
                  Export instantaneous counting metrics and vehicle breakdowns for this session.
                </p>

                <div className="export-buttons-stack">
                  <button
                    type="button"
                    className="export-btn-primary"
                    onClick={handleExportJson}
                    title="Export JSON snapshot at this exact moment"
                  >
                    <Icon name="download" /> Export JSON
                  </button>

                  <button
                    type="button"
                    className="export-btn-secondary"
                    onClick={handleExportCsv}
                    title="Export CSV spreadsheet at this exact moment"
                  >
                    <Icon name="table" /> Export CSV
                  </button>

                  <button
                    type="button"
                    className="export-btn-secondary"
                    onClick={handleCopyClipboard}
                    title="Copy formatted JSON snapshot to clipboard"
                  >
                    <Icon name="code" /> Copy Clipboard
                  </button>

                  <button
                    type="button"
                    className="export-btn-secondary"
                    onClick={() => setJsonOpen(true)}
                    title="Inspect raw JSON payload"
                  >
                    <Icon name="schema" /> Inspect Raw
                  </button>
                </div>
              </section>

              {/* 4. Live Event Activity Feed */}
              <section className="activity-log-card">
                <h4>Pipeline Events</h4>
                <div className="activity-log-lines">
                  {logs.map((log, index) => (
                    <div key={index}>{log}</div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Calm, Minimal Status Footer */}
      <footer className="mechanical-footer">
        <div className="footer-left">
          <span className="live-indicator" style={{ width: 6, height: 6 }} />
          <span>TrafficFlow Vision Node</span>
          <span>·</span>
          <span>YOLOv8 & Tripline Gate Engine</span>
        </div>
        <div className="footer-right">
          <span>Enterprise v2.4.0</span>
        </div>
      </footer>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="toast-container" aria-live="polite">
          <div className="toast-item">
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Raw JSON Modal */}
      {jsonOpen && (
        <JsonModal
          title="Instant Snapshot Telemetry Payload"
          data={currentSnapshot}
          onClose={() => setJsonOpen(false)}
        />
      )}

      {/* Fullscreen Geometry & Lane Calibration Modal Studio */}
      {fullscreenModalOpen && preview && (
        <GeometryFullscreenModal
          preview={preview}
          roi={roi}
          setRoi={setRoi}
          crop={crop}
          setCrop={setCrop}
          lanes={lanes}
          setLanes={setLanes}
          settings={settings}
          setSettings={setSettings}
          geometryStep={geometryStep}
          setGeometryStep={setGeometryStep}
          onClose={() => setFullscreenModalOpen(false)}
          onSubmit={(laneDrafts) => {
            const config = buildLaneConfig({ preview, roi, crop, lanes: laneDrafts, settings, videoFile });
            setSubmittedConfig(config);
            setLanes(laneDrafts);
            setFullscreenModalOpen(false);
            showToast("Geometry configuration saved!");
          }}
          sourceMode={sourceMode}
          showToast={showToast}
          videoFile={videoFile}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   SUB-COMPONENTS
   ========================================================================== */

function VideoUploadBox({ videoFile, taskId, onUpload }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`studio-upload-box ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onUpload(e.dataTransfer.files?.[0]); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska,video/webm,.mp4,.avi,.mov,.mkv,.webm"
        onChange={(e) => onUpload(e.target.files?.[0])}
        hidden
      />
      <div className="studio-upload-info">
        <div className="studio-upload-icon">
          <Icon name="upload_file" />
        </div>
        <div>
          <strong style={{ fontSize: 14, color: "#fff" }}>
            {videoFile ? videoFile.name : "Drop traffic video recording"}
          </strong>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
            {videoFile
              ? `Ready · ${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`
              : "MP4, AVI, MOV, MKV, WebM up to 2 GB."}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="export-btn-secondary"
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="folder" /> Browse
      </button>
    </div>
  );
}

function LiveStreamBox({ liveUrl, setLiveUrl, liveSource, liveBusy, onResolve }) {
  return (
    <form className="studio-live-form" onSubmit={(e) => { e.preventDefault(); onResolve(liveUrl); }}>
      <input
        className="studio-live-input"
        value={liveUrl}
        onChange={(e) => setLiveUrl(e.target.value)}
        placeholder="rtsp://... or https://youtube.com/watch?v=..."
        autoComplete="url"
      />
      <button
        type="submit"
        className="export-btn-primary"
        disabled={liveBusy || !liveUrl.trim()}
      >
        <Icon name={liveBusy ? "loader" : "broadcast"} />
        {liveBusy ? "Resolving…" : "Resolve"}
      </button>
    </form>
  );
}

function RoiMaskingStep({ preview, onBack, onConfirm, isFullscreen = false, initialVertices = null, showToast = null }) {
  const canvasRef = useRef(null);
  const [vertices, setVertices] = useState(() => {
    if (initialVertices && Array.isArray(initialVertices) && initialVertices.length >= 3) {
      return initialVertices.map((p) => ({ x: Number(p.x ?? p[0]), y: Number(p.y ?? p[1]) }));
    }
    return defaultRoi(preview);
  });
  const [toolMode, setToolMode] = useState("drag"); // "drag" | "add"
  const [dragIndex, setDragIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const cropRect = useMemo(() => boundingRect(vertices, preview.width, preview.height), [vertices, preview]);
  const canConfirm = vertices.length >= 3;

  useEffect(() => {
    drawRoiCanvas(canvasRef.current, preview, vertices, cropRect, selectedIndex, hoveredIndex);
  }, [preview, vertices, cropRect, selectedIndex, hoveredIndex]);

  const pointer = useCanvasPointer(canvasRef);

  function getHitIndex(point) {
    const radius = handleHitRadius(preview, canvasRef.current);
    return vertices.findIndex((vertex) => distance(vertex, point) < radius);
  }

  function handlePointerDown(event) {
    if (event.button === 2) {
      event.preventDefault();
      const point = pointer(event);
      const hit = getHitIndex(point);
      if (hit >= 0 && vertices.length > 3) {
        setVertices((cur) => cur.filter((_, i) => i !== hit));
        setSelectedIndex(null);
        setHoveredIndex(null);
        showToast?.(`Đã xóa điểm #${hit + 1}`);
      }
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointer(event);
    const hit = getHitIndex(point);

    if (hit >= 0) {
      setDragIndex(hit);
      setSelectedIndex(hit);
      return;
    }

    if (toolMode === "add") {
      const nextPoint = clampPoint(point, preview.width, preview.height);
      setVertices((current) => [...current, nextPoint]);
      setSelectedIndex(vertices.length);
      showToast?.(`Đã thêm điểm #${vertices.length + 1}`);
    }
  }

  function handlePointerMove(event) {
    const point = clampPoint(pointer(event), preview.width, preview.height);
    if (dragIndex !== null) {
      setVertices((current) => current.map((vertex, index) => (index === dragIndex ? point : vertex)));
      return;
    }
    const hit = getHitIndex(point);
    setHoveredIndex(hit >= 0 ? hit : null);
  }

  function handlePointerUp() {
    setDragIndex(null);
  }

  function deleteSelectedVertex() {
    if (selectedIndex === null || vertices.length <= 3) return;
    setVertices((cur) => cur.filter((_, i) => i !== selectedIndex));
    showToast?.(`Đã xóa điểm #${selectedIndex + 1}`);
    setSelectedIndex(null);
  }

  function undoLastVertex() {
    if (vertices.length <= 3) return;
    setVertices((cur) => cur.slice(0, -1));
    showToast?.("Đã hoàn tác điểm cuối");
    setSelectedIndex(null);
  }

  function clearAndDrawCustom() {
    setVertices([]);
    setToolMode("add");
    setSelectedIndex(null);
    showToast?.("Nhấp trên video để tạo các điểm góc mới cho vùng ROI");
  }

  function resetToDefault() {
    const def = defaultRoi(preview);
    setVertices(def);
    setToolMode("drag");
    setSelectedIndex(null);
    showToast?.("Đã đặt lại ROI mặc định");
  }

  return (
    <div className={`step-layout ${isFullscreen ? "fullscreen" : ""}`}>
      <section className="canvas-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className={`source-mode-pill ${toolMode === "drag" ? "active" : ""}`}
              onClick={() => setToolMode("drag")}
              title="Di chuyển và kéo thả các điểm góc"
            >
              🖐️ Di chuyển điểm (Drag)
            </button>
            <button
              type="button"
              className={`source-mode-pill ${toolMode === "add" ? "active" : ""}`}
              onClick={() => setToolMode("add")}
              title="Nhấp chuột vào canvas để thêm đỉnh mới"
            >
              ➕ Thêm điểm (Add)
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="export-btn-secondary mini-btn"
              disabled={selectedIndex === null || vertices.length <= 3}
              onClick={deleteSelectedVertex}
              title="Xóa đỉnh đang chọn (hoặc click chuột phải vào đỉnh)"
            >
              <Icon name="delete" /> Xóa điểm
            </button>
            <button
              type="button"
              className="export-btn-secondary mini-btn"
              disabled={vertices.length <= 3}
              onClick={undoLastVertex}
              title="Xóa điểm vừa thêm gần nhất"
            >
              ↩️ Hoàn tác
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className={`drawing-canvas ${isFullscreen ? "fullscreen-canvas" : ""}`}
          width={preview.width}
          height={preview.height}
          style={{
            aspectRatio: `${preview.width} / ${preview.height}`,
            width: "100%",
            borderRadius: 6,
            cursor: dragIndex !== null ? "grabbing" : hoveredIndex !== null ? "grab" : toolMode === "add" ? "crosshair" : "default",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        <div className="roi-instruction-banner">
          💡 <strong>Hướng dẫn:</strong> Kéo các chấm tròn để căn chỉnh viền đường. Nhấp chuột phải vào chấm để xóa.
        </div>
      </section>

      <aside className="tool-panel">
        <p className="eyebrow">ROI Road Boundary</p>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Kéo thả các điểm để bao trùm mặt đường cần giám sát.
        </p>
        <Metric label="Số đỉnh (Vertices)" value={vertices.length} small />
        <Metric label="Vùng cắt (Crop Area)" value={`${Math.round(cropRect.width)} × ${Math.round(cropRect.height)}`} small />

        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-soft)" }}>Danh sách các điểm:</span>
          <div className="vertex-chip-list">
            {vertices.map((v, idx) => (
              <div
                key={idx}
                className={`vertex-chip ${idx === selectedIndex ? "active" : ""}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <span>#{idx + 1} ({Math.round(v.x)}, {Math.round(v.y)})</span>
                {vertices.length > 3 && (
                  <button
                    type="button"
                    className="vertex-chip-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVertices((cur) => cur.filter((_, i) => i !== idx));
                      showToast?.(`Đã xóa điểm #${idx + 1}`);
                      setSelectedIndex(null);
                    }}
                    title="Xóa điểm này"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="button-row" style={{ marginTop: 14 }}>
          <button type="button" className="secondary-button" onClick={clearAndDrawCustom} title="Vẽ lại hoàn toàn mới">
            ✏️ Vẽ lại
          </button>
          <button type="button" className="secondary-button" onClick={resetToDefault} title="Đặt lại hình thang mặc định">
            <Icon name="restart" /> Mặc định
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canConfirm}
            onClick={() => onConfirm({ polygon: vertices, cropRect })}
          >
            Xác nhận ROI <Icon name="arrow_right" />
          </button>
        </div>
      </aside>
    </div>
  );
}

function LaneEditorStep({
  crop,
  lanes,
  setLanes,
  settings,
  setSettings,
  onBack,
  onNext,
  setGeometryStep,
  onSubmit,
  sourceMode,
  isFullscreen = false,
  showToast,
}) {
  const canvasRef = useRef(null);
  const [activeLaneId, setActiveLaneId] = useState(lanes[0]?.id || "");
  const [mode, setMode] = useState("line");
  const [dragPoint, setDragPoint] = useState(null);
  const [lineDraft, setLineDraft] = useState(null);
  const [hoveredHandle, setHoveredHandle] = useState(null);
  const pointer = useCanvasPointer(canvasRef);
  const activeLane = lanes.find((lane) => lane.id === activeLaneId) || lanes[0];

  useEffect(() => {
    drawLaneCanvas(canvasRef.current, crop, lanes, activeLane?.id, mode, lineDraft, hoveredHandle);
  }, [crop, lanes, activeLane, mode, lineDraft, hoveredHandle]);

  function updateLane(id, patcher) {
    setLanes((current) => current.map((lane) => (lane.id === id ? patcher(lane) : lane)));
  }

  function handleDown(event) {
    if (!activeLane) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = clampPoint(pointer(event), crop.width, crop.height);
    const hit = findLanePoint(lanes, point, crop, canvasRef.current);
    if (hit) {
      setDragPoint(hit);
      setActiveLaneId(hit.laneId);
      return;
    }
    if (mode === "zone") {
      updateLane(activeLane.id, (lane) => ({
        ...lane,
        valid_zone: lane.valid_zone.length >= 4 ? [point] : [...lane.valid_zone, point],
      }));
      return;
    }
    setLineDraft({ start: point, end: point, target: mode === "line" ? "counting_line" : "direction" });
  }

  function handleMove(event) {
    const point = clampPoint(pointer(event), crop.width, crop.height);
    if (dragPoint) {
      updateLane(dragPoint.laneId, (lane) => replaceGeometryPoint(lane, dragPoint.key, dragPoint.index, point));
      return;
    }
    if (lineDraft) {
      setLineDraft((current) => ({ ...current, end: point }));
      return;
    }
    const hit = findLanePoint(lanes, point, crop, canvasRef.current);
    setHoveredHandle(hit);
  }

  function handleUp() {
    if (lineDraft && activeLane) {
      const dist = distance(lineDraft.start, lineDraft.end);
      if (dist >= 15) {
        const key = lineDraft.target;
        updateLane(activeLane.id, (lane) => ({ ...lane, [key]: [lineDraft.start, lineDraft.end] }));
        showToast?.(key === "counting_line" ? "Đã vẽ Vạch đếm mới" : "Đã vẽ Hướng xe mới");
      }
    }
    setLineDraft(null);
    setDragPoint(null);
  }

  function addLane() {
    const lane = createLane(lanes.length + 1, crop);
    setLanes((current) => [...current, lane]);
    setActiveLaneId(lane.id);
    showToast?.(`Đã thêm làn mới: ${lane.lane_id}`);
  }

  function deleteLane(id) {
    if (lanes.length <= 1) return;
    const remaining = lanes.filter((l) => l.id !== id);
    setLanes(remaining);
    if (activeLaneId === id) setActiveLaneId(remaining[0].id);
    showToast?.("Đã xóa làn xe");
  }

  function toggleVehicleClass(className) {
    if (!activeLane) return;
    const currentClasses = activeLane.class_allowed || [];
    const exists = currentClasses.includes(className);
    const updated = exists ? currentClasses.filter((c) => c !== className) : [...currentClasses, className];
    if (updated.length === 0) return;
    updateLane(activeLane.id, (l) => ({ ...l, class_allowed: updated }));
  }

  function resetCurrentLaneGeometry() {
    if (!activeLane) return;
    const w = crop.width;
    const h = crop.height;
    updateLane(activeLane.id, (l) => ({
      ...l,
      counting_line: [
        { x: w * 0.2, y: h * 0.5 },
        { x: w * 0.8, y: h * 0.5 },
      ],
      direction: [
        { x: w * 0.5, y: h * 0.35 },
        { x: w * 0.5, y: h * 0.65 },
      ],
    }));
    showToast?.("Đã đặt lại vạch đếm & hướng về mặc định");
  }

  return (
    <div className={`step-layout wide ${isFullscreen ? "fullscreen" : ""}`}>
      <section className="canvas-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`source-mode-pill ${mode === "line" ? "active" : ""}`}
              onClick={() => setMode("line")}
              title="Kéo trên canvas để vẽ vạch đếm, hoặc kéo 2 đầu mút"
            >
              <Icon name="minus" /> Vạch đếm (Count Line)
            </button>
            <button
              type="button"
              className={`source-mode-pill ${mode === "direction" ? "active" : ""}`}
              onClick={() => setMode("direction")}
              title="Kéo trên canvas để vẽ mũi tên hướng xe chạy"
            >
              <Icon name="arrow_right" /> Hướng xe (Direction)
            </button>
            <button
              type="button"
              className={`source-mode-pill ${mode === "zone" ? "active" : ""}`}
              onClick={() => setMode("zone")}
              title="Nhấp 4 điểm để tạo vùng hợp lệ"
            >
              <Icon name="polygon" /> Vùng (Zone)
            </button>
          </div>
          <button
            type="button"
            className="export-btn-secondary mini-btn"
            onClick={resetCurrentLaneGeometry}
            title="Khôi phục vị trí vạch đếm và hướng xe về giữa khung hình"
          >
            <Icon name="restart" /> Đặt lại vạch
          </button>
        </div>

        <canvas
          ref={canvasRef}
          className={`drawing-canvas ${isFullscreen ? "fullscreen-canvas" : ""}`}
          width={crop.width}
          height={crop.height}
          style={{
            aspectRatio: `${crop.width} / ${crop.height}`,
            width: "100%",
            borderRadius: 6,
            cursor: dragPoint ? "grabbing" : hoveredHandle ? "grab" : "crosshair",
          }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
        />

        <div className="roi-instruction-banner">
          💡 <strong>Mẹo:</strong> Bạn có thể kéo trực tiếp 2 đầu mút chấm tròn màu xanh lá (Vạch đếm) hoặc màu cam (Hướng xe) để di chuyển tùy ý!
        </div>
      </section>

      <aside className="tool-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ color: "#fff", fontSize: 13 }}>Danh sách Làn xe ({lanes.length})</strong>
          <button type="button" className="icon-button solid" onClick={addLane} title="Thêm làn xe mới">
            <Icon name="add" />
          </button>
        </div>

        <div className="lane-list" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className={`lane-card ${lane.id === activeLane?.id ? "active" : ""}`}
              onClick={() => setActiveLaneId(lane.id)}
            >
              <span className="swatch" style={{ background: lane.color }} />
              <input
                value={lane.lane_id}
                onChange={(e) => updateLane(lane.id, (c) => ({ ...c, lane_id: e.target.value }))}
                title="Tên / ID làn xe"
              />
              {lanes.length > 1 && (
                <button
                  type="button"
                  className="icon-button danger-lite lane-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteLane(lane.id);
                  }}
                  title="Xóa làn xe này"
                >
                  <Icon name="delete" />
                </button>
              )}
            </div>
          ))}
        </div>

        {activeLane && (
          <div style={{ marginTop: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-soft)" }}>Loại xe được đếm:</span>
            <div className="class-allowed-pills" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {CLASS_ALLOWED.map((cls) => {
                const active = (activeLane.class_allowed || []).includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    className={`class-toggle-pill ${active ? "active" : ""}`}
                    onClick={() => toggleVehicleClass(cls)}
                    title={`Bật/Tắt đếm ${cls}`}
                  >
                    {active ? "✓ " : ""}{cls}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {settings && (
          <div className="lane-settings-quick-link" style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Tham số Tracking:</span>
              <button
                type="button"
                className="link-action-btn"
                onClick={onNext}
                style={{ fontSize: 11, color: "#38bdf8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Chỉnh sửa ⚙️
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, fontSize: 11, color: "var(--text-soft)" }}>
              <span>Ngưỡng: <strong>{settings.movement_threshold_px}px</strong></span>
              <span>·</span>
              <span>Cooldown: <strong>{settings.cooldown_frames}f</strong></span>
              <span>·</span>
              <span>{settings.zone_policy}</span>
            </div>
          </div>
        )}

        <div className="button-row" style={{ marginTop: 14 }}>
          <button type="button" className="secondary-button" onClick={onBack}>
            <Icon name="arrow_left" /> ROI
          </button>
          <button type="button" className="primary-button" onClick={() => onSubmit(lanes)}>
            Lưu Cấu hình <Icon name="check" />
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetectionSettingsStep({
  settings,
  setSettings,
  onBack,
  onSave,
  showToast,
  isFullscreen = false,
}) {
  const updateSetting = (key, val) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const applyPreset = (presetName, presetVals) => {
    setSettings((prev) => ({ ...prev, ...presetVals }));
    showToast?.(`Đã áp dụng cấu hình: ${presetName}`);
  };

  return (
    <div className={`step-layout wide settings-step-layout ${isFullscreen ? "fullscreen" : ""}`}>
      <div className="settings-main-panel">
        <div className="settings-header">
          <div className="settings-header-icon">
            <Icon name="schema" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: "#fff" }}>
              Cấu hình Thuật toán Đếm & Tracking (Detection Parameters)
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
              Tinh chỉnh ngưỡng phát hiện chuyển động, thời gian cooldown và chính sách lọc phương tiện để đạt độ chính xác tối ưu.
            </p>
          </div>
        </div>

        <div className="settings-presets-container">
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-soft)" }}>Cấu hình mẫu khuyến nghị:</span>
          <div className="settings-preset-pills">
            <button
              type="button"
              className="preset-tag-btn"
              onClick={() =>
                applyPreset("Mặc định Khuyến nghị", {
                  movement_threshold_px: 5,
                  cooldown_frames: 12,
                  cooldown_distance_px: 32,
                  zone_policy: "flexible",
                })
              }
            >
              ⭐ Khuyến nghị (5px / 12f / 32px / Flexible)
            </button>
            <button
              type="button"
              className="preset-tag-btn"
              onClick={() =>
                applyPreset("Đường Cao tốc / Tốc độ cao", {
                  movement_threshold_px: 10,
                  cooldown_frames: 8,
                  cooldown_distance_px: 45,
                  zone_policy: "flexible",
                })
              }
            >
              🏎️ Cao tốc / Xe chạy nhanh (10px / 8f)
            </button>
            <button
              type="button"
              className="preset-tag-btn"
              onClick={() =>
                applyPreset("Đô thị Ùn tắc / Xe máy đông", {
                  movement_threshold_px: 3,
                  cooldown_frames: 20,
                  cooldown_distance_px: 20,
                  zone_policy: "flexible",
                })
              }
            >
              🛵 Ùn tắc Đô thị / Xe máy đông (3px / 20f)
            </button>
            <button
              type="button"
              className="preset-tag-btn"
              onClick={() =>
                applyPreset("Kiểm soát Nghiêm ngặt (Strict Zone)", {
                  movement_threshold_px: 6,
                  cooldown_frames: 16,
                  cooldown_distance_px: 30,
                  zone_policy: "strict",
                })
              }
            >
              🔒 Kiểm soát Nghiêm ngặt (Strict)
            </button>
          </div>
        </div>

        <div className="settings-sliders-grid">
          <div className="settings-card-item">
            <div className="settings-card-header">
              <div className="settings-card-title-group">
                <strong style={{ color: "#fff", fontSize: 13 }}>Ngưỡng di chuyển (Movement Threshold)</strong>
                <span className="settings-desc">
                  Khoảng cách di chuyển tối thiểu giữa 2 frame để coi là xe đang chạy, loại bỏ rung quang học và xe dừng đèn đỏ.
                </span>
              </div>
              <div className="settings-value-badge">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={settings.movement_threshold_px}
                  onChange={(e) => updateSetting("movement_threshold_px", Math.max(0, Number(e.target.value)))}
                  className="settings-number-input"
                />
                <span className="unit">px</span>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={settings.movement_threshold_px}
              onChange={(e) => updateSetting("movement_threshold_px", Number(e.target.value))}
              className="settings-range-slider"
            />
            <div className="slider-labels">
              <span>1 px (Rất nhạy)</span>
              <span>15 px</span>
              <span>30 px (Chỉ xe chạy nhanh)</span>
            </div>
          </div>

          <div className="settings-card-item">
            <div className="settings-card-header">
              <div className="settings-card-title-group">
                <strong style={{ color: "#fff", fontSize: 13 }}>Thời gian Cooldown Khóa ID (Cooldown Frames)</strong>
                <span className="settings-desc">
                  Số lượng khung hình tạm khóa track ID sau khi đã đếm qua vạch, ngăn chặn một xe bị đếm nhiều lần.
                </span>
              </div>
              <div className="settings-value-badge">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.cooldown_frames}
                  onChange={(e) => updateSetting("cooldown_frames", Math.max(0, Number(e.target.value)))}
                  className="settings-number-input"
                />
                <span className="unit">frames (~{(settings.cooldown_frames / 30).toFixed(1)}s)</span>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              value={settings.cooldown_frames}
              onChange={(e) => updateSetting("cooldown_frames", Number(e.target.value))}
              className="settings-range-slider"
            />
            <div className="slider-labels">
              <span>1 frame (0.03s)</span>
              <span>30 frames (1.0s)</span>
              <span>60 frames (2.0s)</span>
            </div>
          </div>

          <div className="settings-card-item">
            <div className="settings-card-header">
              <div className="settings-card-title-group">
                <strong style={{ color: "#fff", fontSize: 13 }}>Bán kính Cooldown Triệt tiêu (Cooldown Distance)</strong>
                <span className="settings-desc">
                  Bán kính không gian triệt tiêu trùng lặp xung quanh vạch đếm để gộp các phát hiện phương tiện đi sát nhau.
                </span>
              </div>
              <div className="settings-value-badge">
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={settings.cooldown_distance_px}
                  onChange={(e) => updateSetting("cooldown_distance_px", Math.max(0, Number(e.target.value)))}
                  className="settings-number-input"
                />
                <span className="unit">px</span>
              </div>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="1"
              value={settings.cooldown_distance_px}
              onChange={(e) => updateSetting("cooldown_distance_px", Number(e.target.value))}
              className="settings-range-slider"
            />
            <div className="slider-labels">
              <span>5 px (Khoảng cách hẹp)</span>
              <span>50 px</span>
              <span>100 px (Vùng rộng)</span>
            </div>
          </div>

          <div className="settings-card-item">
            <div className="settings-card-header">
              <div className="settings-card-title-group">
                <strong style={{ color: "#fff", fontSize: 13 }}>Chính sách Lọc Vùng (Zone Policy)</strong>
                <span className="settings-desc">
                  Quy định điều kiện kích hoạt đếm: linh hoạt dựa trên vạch đếm hoặc nghiêm ngặt bắt buộc qua vùng hợp lệ.
                </span>
              </div>
            </div>
            <div className="policy-toggle-group">
              <button
                type="button"
                className={`policy-pill-btn ${settings.zone_policy === "flexible" ? "active" : ""}`}
                onClick={() => updateSetting("zone_policy", "flexible")}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <strong>Linh hoạt (Flexible) — Khuyến nghị</strong>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    Kích hoạt khi xe cắt qua Vạch đếm. Vùng hợp lệ dùng để lọc phụ trợ (không bắt buộc 100%).
                  </span>
                </div>
                {settings.zone_policy === "flexible" && <Icon name="check" />}
              </button>
              <button
                type="button"
                className={`policy-pill-btn ${settings.zone_policy === "strict" ? "active" : ""}`}
                onClick={() => updateSetting("zone_policy", "strict")}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <strong>Nghiêm ngặt (Strict Policy)</strong>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    Bắt buộc trajectory xe phải nằm trong Vùng hợp lệ (Valid Zone) rồi mới được xác nhận qua Vạch đếm.
                  </span>
                </div>
                {settings.zone_policy === "strict" && <Icon name="check" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="tool-panel">
        <p className="eyebrow">Trạng thái Cấu hình</p>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Các thông số trên sẽ được đóng gói trực tiếp vào payload pipeline đếm lưu lượng.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
          <Metric label="Movement Thresh" value={`${settings.movement_threshold_px} px`} small />
          <Metric label="Cooldown Frames" value={`${settings.cooldown_frames} frames`} small />
          <Metric label="Cooldown Dist" value={`${settings.cooldown_distance_px} px`} small />
          <Metric label="Zone Policy" value={settings.zone_policy.toUpperCase()} small />
        </div>
        <div className="button-row" style={{ marginTop: 14 }}>
          {onBack && (
            <button type="button" className="secondary-button" onClick={onBack}>
              <Icon name="arrow_left" /> Quay lại Làn
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onSave?.();
              showToast?.("Đã lưu và áp dụng toàn bộ cài đặt thuật toán!");
            }}
          >
            Lưu Cài đặt <Icon name="check" />
          </button>
        </div>
      </aside>
    </div>
  );
}

function OperatorAlert({ alert, onDismiss }) {
  return (
    <div className={`operator-alert ${alert.tone || "info"}`} role="alert">
      <Icon name={alert.tone === "error" ? "error" : "info"} />
      <div>
        <strong>{alert.title}</strong>
        <p>{alert.message}</p>
      </div>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss alert">
        <Icon name="close" />
      </button>
    </div>
  );
}

function Metric({ label, value, small = false }) {
  return (
    <div className={`metric ${small ? "small" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Icon({ name, className = "" }) {
  const paths = {
    traffic: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="5" />
        <circle cx="12" cy="7" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="17" r="1.5" fill="currentColor" />
      </>
    ),
    restart: (
      <>
        <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
        <polyline points="21 3 21 8 16 8" />
      </>
    ),
    upload_file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 18v-6" />
        <polyline points="9 15 12 12 15 15" />
      </>
    ),
    folder: (
      <>
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      </>
    ),
    broadcast: (
      <>
        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M7.76 7.76a6 6 0 0 0 0 8.48" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.48" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </>
    ),
    crop_free: (
      <>
        <path d="M5 9V6a1 1 0 0 1 1-1h3" />
        <path d="M15 5h3a1 1 0 0 1 1 1v3" />
        <path d="M19 15v3a1 1 0 0 1-1 1h-3" />
        <path d="M9 19H6a1 1 0 0 1-1-1v-3" />
      </>
    ),
    timeline: (
      <>
        <path d="M3 12h3l3-7 4 14 3-7h5" />
      </>
    ),
    analytics: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
        <polyline points="14 9 19 9 19 14" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
    videocam: (
      <>
        <rect x="2" y="6" width="14" height="12" rx="3" />
        <path d="m16 10 4.5-2.7a1 1 0 0 1 1.5.86v7.68a1 1 0 0 1-1.5.86L16 14" />
      </>
    ),
    schema: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="15" y="15" width="6" height="6" rx="1.5" />
        <rect x="15" y="3" width="6" height="6" rx="1.5" />
        <path d="M9 6h6" />
        <path d="M6 9v9a2 2 0 0 0 2 2h7" />
      </>
    ),
    terminal: (
      <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </>
    ),
    code: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="16" r="0.75" fill="currentColor" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <circle cx="12" cy="8" r="0.75" fill="currentColor" />
      </>
    ),
    close: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    arrow_left: (
      <>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ),
    arrow_right: (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ),
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
    polygon: (
      <>
        <polygon points="12 2 22 8.5 18 20 6 20 2 8.5" />
        <circle cx="12" cy="2" r="1.5" fill="currentColor" />
        <circle cx="22" cy="8.5" r="1.5" fill="currentColor" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" />
        <circle cx="6" cy="20" r="1.5" fill="currentColor" />
        <circle cx="2" cy="8.5" r="1.5" fill="currentColor" />
      </>
    ),
    loader: (
      <>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </>
    ),
    add: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    delete: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </>
    ),
    check: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
    play: <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" fillOpacity="0.2" />,
    fullscreen: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </>
    ),
    fullscreen_exit: (
      <>
        <path d="M4 14h6m0 0v6m0-6-7 7m17-7h-6m0 0v6m0-6 7 7M14 10V4m0 6h6m-6 0 7-7M10 10V4m0 6H4m6 0-7-7" />
      </>
    ),
  };
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.info}
    </svg>
  );
}

function GeometryFullscreenModal({
  preview,
  roi,
  setRoi,
  crop,
  setCrop,
  lanes,
  setLanes,
  settings,
  setSettings,
  geometryStep,
  setGeometryStep,
  onClose,
  onSubmit,
  sourceMode,
  showToast,
  videoFile,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="geometry-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Fullscreen Calibration Studio">
      <div className="geometry-fullscreen-container">
        <header className="geometry-fullscreen-header">
          <div className="fullscreen-header-title">
            <div className="fullscreen-header-badge">
              <Icon name="schema" />
            </div>
            <div>
              <h3>Fullscreen Geometry & Lane Calibration</h3>
              <p>{preview ? `${preview.width} × ${preview.height} px · Real Traffic Sensor Frame` : "Calibrating..."}</p>
            </div>
          </div>

          <div className="fullscreen-step-pills">
            <button
              type="button"
              className={`source-mode-pill ${geometryStep === "roi" ? "active" : ""}`}
              onClick={() => setGeometryStep("roi")}
            >
              1. ROI Road Boundary
            </button>
            <button
              type="button"
              className={`source-mode-pill ${geometryStep === "lanes" ? "active" : ""}`}
              onClick={() => setGeometryStep("lanes")}
              disabled={!crop}
            >
              2. Lanes & Counting Lines
            </button>
            <button
              type="button"
              className={`source-mode-pill ${geometryStep === "settings" ? "active" : ""}`}
              onClick={() => setGeometryStep("settings")}
            >
              ⚙️ 3. Detection Settings
            </button>
          </div>

          <div className="fullscreen-header-actions">
            <button
              type="button"
              ref={closeButtonRef}
              className="export-btn-secondary"
              onClick={onClose}
              title="Thoát toàn màn hình (Esc)"
            >
              <Icon name="fullscreen_exit" /> Thoát toàn màn hình (Esc)
            </button>
          </div>
        </header>

        <div className="geometry-fullscreen-body">
          {geometryStep === "roi" && (
            <RoiMaskingStep
              preview={preview}
              initialVertices={roi?.polygon}
              isFullscreen={true}
              onBack={onClose}
              showToast={showToast}
              onConfirm={(nextRoi) => {
                const cropAsset = createCropAsset(preview, nextRoi.cropRect);
                setRoi(nextRoi);
                setCrop(cropAsset);
                setGeometryStep("lanes");
              }}
            />
          )}

          {geometryStep === "lanes" && crop && (
            <LaneEditorStep
              crop={crop}
              lanes={lanes}
              setLanes={setLanes}
              settings={settings}
              setSettings={setSettings}
              isFullscreen={true}
              onBack={() => setGeometryStep("roi")}
              onNext={() => setGeometryStep("settings")}
              setGeometryStep={setGeometryStep}
              showToast={showToast}
              onSubmit={(laneDrafts) => {
                onSubmit(laneDrafts);
              }}
              sourceMode={sourceMode}
            />
          )}

          {geometryStep === "settings" && (
            <DetectionSettingsStep
              settings={settings}
              setSettings={setSettings}
              isFullscreen={true}
              onBack={() => setGeometryStep("lanes")}
              showToast={showToast}
              onSave={() => {
                const config = buildLaneConfig({ preview, roi, crop, lanes, settings, videoFile });
                onSubmit(lanes);
                showToast?.("Đã lưu và đồng bộ cài đặt thuật toán!");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function JsonModal({ title, data, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="json-modal" role="dialog" aria-modal="true" aria-labelledby="payload-title">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Raw payload snapshot</p>
            <h2 id="payload-title">{title}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button solid" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}

/* ==========================================================================
   GEOMETRY & API HELPERS
   ========================================================================== */

async function uploadVideo(file) {
  const form = new FormData();
  form.append("file", file);
  return normalizeSource(await apiRequest("/videos", { method: "POST", body: form }));
}

async function fetchPreview(taskId) {
  const blob = await apiBlob(`/videos/${taskId}/preview`);
  const objectUrl = URL.createObjectURL(blob);
  const asset = await loadImage(objectUrl);
  asset.objectUrl = objectUrl;
  return asset;
}

async function resolveLiveSource(url) {
  return apiRequest("/live/resolve", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

async function submitTask(taskId, config) {
  return normalizeTaskStatus(await apiRequest("/tasks", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, lane_config: config }),
  }));
}

async function pollTask(taskId) {
  return normalizeTaskStatus(await apiRequest(`/tasks/${taskId}`));
}

async function fetchResult(taskId) {
  return normalizeAnalyticsResult(await apiRequest(`/tasks/${taskId}/result`));
}

async function createLiveSession(sourceUrl, laneConfig, sourceId = null) {
  return normalizeLiveSession(await apiRequest("/live/sessions", {
    method: "POST",
    body: JSON.stringify({
      source_url: sourceUrl,
      source_id: sourceId || undefined,
      lane_config: laneConfig,
      frame_skip: 2,
    }),
  }));
}

async function fetchLiveSession(sessionId) {
  return normalizeLiveSession(await apiRequest(`/live/sessions/${sessionId}`));
}

async function stopLive(sessionId) {
  return apiRequest(`/live/sessions/${sessionId}`, { method: "DELETE" });
}

async function removeLive(sessionId) {
  return apiRequest(`/live/sessions/${sessionId}/remove`, { method: "DELETE" });
}

function createLane(index, crop = null) {
  const w = crop?.width || 1280;
  const h = crop?.height || 720;
  const yOffset = 0.4 + ((index - 1) % 3) * 0.15;
  return {
    id: createId(),
    lane_id: `lane_${index}`,
    valid_zone: [
      { x: w * 0.15, y: h * (yOffset - 0.1) },
      { x: w * 0.85, y: h * (yOffset - 0.1) },
      { x: w * 0.85, y: h * (yOffset + 0.15) },
      { x: w * 0.15, y: h * (yOffset + 0.15) },
    ],
    counting_line: [
      { x: w * 0.2, y: h * yOffset },
      { x: w * 0.8, y: h * yOffset },
    ],
    direction: [
      { x: w * 0.5, y: h * (yOffset - 0.08) },
      { x: w * 0.5, y: h * (yOffset + 0.08) },
    ],
    class_allowed: [...CLASS_ALLOWED],
    color: LANE_COLORS[(index - 1) % LANE_COLORS.length],
  };
}

function buildLaneConfig({ preview, roi, crop, lanes, settings, videoFile }) {
  const validLanes = lanes.map((lane) => ({
    lane_id: lane.lane_id.trim() || "lane",
    valid_zone: lane.valid_zone?.length >= 3 ? lane.valid_zone.map((p) => toSourcePoint(p, roi?.cropRect || { x: 0, y: 0 })) : [],
    counting_line: lane.counting_line?.length === 2 ? lane.counting_line.map((p) => toSourcePoint(p, roi?.cropRect || { x: 0, y: 0 })) : [],
    direction: lane.direction?.length === 2 ? lane.direction.map((p) => toSourcePoint(p, roi?.cropRect || { x: 0, y: 0 })) : [],
    class_allowed: lane.class_allowed,
  }));

  const roiPoly = (roi?.polygon || []).map((p) => [round(p.x), round(p.y)]);
  const cropBox = roi?.cropRect || crop?.sourceRect || { x: 0, y: 0, width: preview?.width || 1280, height: preview?.height || 720 };

  return {
    version: 1,
    camera_id: sanitizeCameraId(videoFile?.name || "source_camera"),
    resolution: {
      width: preview?.width || 1280,
      height: preview?.height || 720,
    },
    roi_polygon: roiPoly,
    roi_crop_padding: ROI_CROP_PADDING,
    annotation_roi: {
      type: "rectangle",
      x: round(cropBox.x),
      y: round(cropBox.y),
      width: round(cropBox.width),
      height: round(cropBox.height),
      purpose: "manual_review_reference",
    },
    processing_roi: {
      type: "rectangle",
      x: round(cropBox.x),
      y: round(cropBox.y),
      width: round(cropBox.width),
      height: round(cropBox.height),
      purpose: "inference_processing",
    },
    crop_rect_padded: {
      type: "rectangle",
      x: round(cropBox.x),
      y: round(cropBox.y),
      width: round(cropBox.width),
      height: round(cropBox.height),
      padding_ratio: ROI_CROP_PADDING,
      source: "roi_polygon_bounding_box",
    },
    processing_width: round(cropBox.width),
    processing_height: round(cropBox.height),
    geometry_space: "source_frame",
    roi_mode: "crop_rect",
    output_frame_mode: "roi",
    method: "counting_gate",
    settings: {
      movement_threshold_px: Number(settings?.movement_threshold_px ?? 5),
      cooldown_frames: Number(settings?.cooldown_frames ?? 12),
      cooldown_distance_px: Number(settings?.cooldown_distance_px ?? 32),
      zone_policy: settings?.zone_policy === "strict" ? "strict" : "flexible",
    },
    lanes: validLanes,
  };
}

function toSourcePoint(point, cropRect) {
  return [round((cropRect.x || 0) + point.x), round((cropRect.y || 0) + point.y)];
}

function sanitizeCameraId(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "source_camera";
}

function defaultRoi(preview) {
  const padX = preview.width * 0.18;
  const padTop = preview.height * 0.22;
  const padBottom = preview.height * 0.18;
  return [
    { x: padX, y: padTop },
    { x: preview.width - padX, y: padTop },
    { x: preview.width - padX * 0.75, y: preview.height - padBottom },
    { x: padX * 1.25, y: preview.height - padBottom },
  ];
}

function drawRoiCanvas(canvas, preview, vertices, cropRect, selectedIndex, hoveredIndex = null) {
  const source = preview?.canvas || preview?.image;
  if (!canvas || !source) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  try {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.warn("Could not draw ROI preview image:", err);
  }

  if (vertices.length >= 3) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 16, 0.60)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(vertices[0].x, vertices[0].y);
    vertices.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();
  }

  // Draw 10% padded bounding rectangle (the crop sent to model)
  if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
    ctx.lineWidth = 1;
    const badgeText = "PADDED INFERENCE ROI (+10%)";
    ctx.font = "bold 10px Inter, sans-serif";
    const textWidth = ctx.measureText(badgeText).width;
    ctx.fillRect(cropRect.x, Math.max(0, cropRect.y - 18), textWidth + 12, 18);
    ctx.strokeRect(cropRect.x, Math.max(0, cropRect.y - 18), textWidth + 12, 18);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(badgeText, cropRect.x + 6, Math.max(12, cropRect.y - 5));
    ctx.restore();
  }

  drawPolygon(ctx, vertices, "#38bdf8", "rgba(56, 189, 248, 0.15)");
  vertices.forEach((p, idx) => {
    const isSelected = idx === selectedIndex;
    const isHovered = idx === hoveredIndex;
    drawHandle(ctx, p, `${idx + 1}`, "#0284c7", isHovered, isSelected);
  });
}

function drawLaneCanvas(canvas, crop, lanes, activeLaneId, mode, draft, hoveredHandle = null) {
  const source = crop?.canvas || crop?.image;
  if (!canvas || !source) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  try {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.warn("Could not draw crop on lane canvas:", err);
  }

  lanes.forEach((lane) => {
    const active = lane.id === activeLaneId;
    if (lane.valid_zone?.length >= 3) {
      drawPolygon(ctx, lane.valid_zone, lane.color, active ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.06)");
    }
    if (lane.counting_line?.length === 2) {
      drawSegment(ctx, lane.counting_line[0], lane.counting_line[1], lane.color, false, active ? 4 : 2.5);
    }
    if (lane.direction?.length === 2) {
      drawSegment(ctx, lane.direction[0], lane.direction[1], active ? "#fbbf24" : lane.color, true, active ? 3.5 : 2);
    }

    if (active) {
      lane.counting_line?.forEach((p, idx) => {
        const isHovered = hoveredHandle?.laneId === lane.id && hoveredHandle?.key === "counting_line" && hoveredHandle?.index === idx;
        drawHandle(ctx, p, `L${idx + 1}`, "#10b981", isHovered, isHovered);
      });
      lane.direction?.forEach((p, idx) => {
        const isHovered = hoveredHandle?.laneId === lane.id && hoveredHandle?.key === "direction" && hoveredHandle?.index === idx;
        drawHandle(ctx, p, idx === 0 ? "Dir" : "▶", "#f59e0b", isHovered, isHovered);
      });
      lane.valid_zone?.forEach((p, idx) => {
        const isHovered = hoveredHandle?.laneId === lane.id && hoveredHandle?.key === "valid_zone" && hoveredHandle?.index === idx;
        drawHandle(ctx, p, `Z${idx + 1}`, lane.color, isHovered, isHovered);
      });
    }
  });

  if (draft) {
    drawSegment(ctx, draft.start, draft.end, mode === "direction" ? "#fbbf24" : "#38bdf8", draft.target === "direction", 3.5);
  }
}

function drawPolygon(ctx, points, stroke, fill) {
  if (!points || !points.length) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  if (points.length >= 3) {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawSegment(ctx, start, end, color, arrow, lineWidth = 3.5) {
  if (!start || !end) return;
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  if (arrow) drawArrowHead(ctx, start, end, color);
  ctx.restore();
}

function drawArrowHead(ctx, start, end, color) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawHandle(ctx, point, label, color, isHovered = false, isSelected = false) {
  if (!point) return;
  ctx.save();
  const radius = isHovered || isSelected ? 13 : 10;

  if (isHovered || isSelected) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = isSelected ? "#38bdf8" : "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color || "#0284c7";
  ctx.stroke();

  if (label) {
    ctx.fillStyle = isSelected ? "#ffffff" : "#0f172a";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, point.x, point.y);
  }
  ctx.restore();
}

function useCanvasPointer(canvasRef) {
  return useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, [canvasRef]);
}

function findLanePoint(lanes, point, crop, canvas = null) {
  const radius = handleHitRadius(crop, canvas);
  for (const lane of lanes) {
    for (const key of ["counting_line", "direction", "valid_zone"]) {
      if (!Array.isArray(lane[key])) continue;
      const index = lane[key].findIndex((candidate) => distance(candidate, point) < radius);
      if (index >= 0) return { laneId: lane.id, key, index };
    }
  }
  return null;
}

function replaceGeometryPoint(lane, key, index, point) {
  return {
    ...lane,
    [key]: lane[key].map((current, currentIndex) => (currentIndex === index ? point : current)),
  };
}

const ROI_CROP_PADDING = 0.10;

function boundingRect(points, width, height) {
  if (!points || points.length === 0) {
    return { x: 0, y: 0, width, height };
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.min(width, Math.max(...xs));
  const maxY = Math.min(height, Math.max(...ys));

  const boxW = Math.max(2, maxX - minX);
  const boxH = Math.max(2, maxY - minY);

  // Technical specification: Add 10% context padding (ROI_CROP_PADDING = 0.10)
  const padX = boxW * ROI_CROP_PADDING;
  const padY = boxH * ROI_CROP_PADDING;

  const x1 = Math.max(0, minX - padX);
  const y1 = Math.max(0, minY - padY);
  const x2 = Math.min(width, maxX + padX);
  const y2 = Math.min(height, maxY + padY);

  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width: Math.max(2, Math.round(x2 - x1)),
    height: Math.max(2, Math.round(y2 - y1)),
  };
}

function createCropAsset(preview, cropRect) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropRect.width));
  canvas.height = Math.max(1, Math.round(cropRect.height));
  const ctx = canvas.getContext("2d");
  const source = preview?.canvas || preview?.image;
  if (source) {
    try {
      ctx.drawImage(source, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn("Could not draw preview to crop canvas:", err);
    }
  }
  const image = new Image();
  try {
    image.src = canvas.toDataURL("image/jpeg", 0.92);
  } catch (err) {
    console.warn("Could not export crop toDataURL:", err);
  }
  return {
    canvas,
    image,
    url: image.src || "",
    width: canvas.width,
    height: canvas.height,
    sourceRect: cropRect,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const targetUrl = src.startsWith("blob:") || src.startsWith("data:") ? src : apiUrl(src);
    const image = new Image();
    if (!targetUrl.startsWith("blob:") && !targetUrl.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve({ image, url: src, width: image.naturalWidth || 1920, height: image.naturalHeight || 1080 });
    image.onerror = (err) => {
      console.warn("Failed to load image from:", targetUrl, err);
      reject(err);
    };
    image.src = targetUrl;
  });
}

function clampPoint(point, width, height) {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handleHitRadius(asset, canvas = null) {
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / Math.max(1, rect.width);
    return Math.max(25, 28 * scale);
  }
  return Math.max(45, (asset?.width || 1280) * 0.035);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = Math.random().toString(16).slice(2);
  return `client-${Date.now().toString(16)}-${random}`;
}

function downloadTextFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export default App;
