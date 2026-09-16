import { Euler, Quaternion, MathUtils } from "three";
import { useReducedMotion } from "motion/react";
import { inspectVideo } from "./media";
import { POSES } from "./iphone-duo/poses";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Angle,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  CaretUp,
  CheckCircle,
  Play,
  Pause,
  Rewind,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { FoldablePhone, PhoneDevice } from "./iphone-duo";
import OptionWheel from "./components/OptionWheel";
import { MEMORY_PHOTOS } from "./iphone-duo/memory-photos";
import MemoryExperience from "./components/MemoryExperience";
import { usePhotoJourney } from "./iphone-duo/use-photo-journey";
import { createMemoryPlayback } from "./iphone-duo/diorama/memory-playback";
import { useMemoryAudio } from "./iphone-duo/diorama/use-memory-audio";
import { openingAngleToProgress, progressToOpeningAngle } from "./iphone-duo/fold-choreography";
import { SEA_SCREEN, useLighthousePhoto } from "./iphone-duo/diorama/use-lighthouse-photo";
import { MEMORY_CLOSED_POSE, MEMORY_SCENE_POSE, MEMORY_PRESENTATION_DURATION, MEMORY_RETURN_DURATION, getPhotoRetraction } from "./iphone-duo/diorama/memory-presentation";
import {
  createFastDepthMap,
  depthBytesToDataUrl,
  normalizeImageForGpu,
} from "./depth.js";

const STAR_WHITE_WALLPAPER = {
    id: "star-white-default",
    label: "Star White Desert",
    screen: "/wallpapers/star-white-default.jpg",
    cover: "/wallpapers/star-white-default.jpg",
    depth: "/wallpapers/star-white-depth.png",
    screenOverlay: "/screen-content/inner-layout.json",
    coverOverlay: "/screen-content/cover-layout.json",
};
const NIGHT_SKY_WALLPAPER = {
    id: "night-sky-default",
    label: "Night Sky Desert",
    screen: "/wallpapers/night-sky-default.jpg",
    cover: "/wallpapers/night-sky-default.jpg",
    depth: "/wallpapers/night-sky-depth.png",
    screenOverlay: "/screen-content/inner-layout.json",
    coverOverlay: "/screen-content/cover-layout.json",
};
const GUQIN_VIDEO_WALLPAPER = {
  id: "guqin-video",
  label: "古琴动态壁纸",
  screen: "/wallpapers/video-1789033274452-poster.jpg",
  cover: "/wallpapers/video-1789033274452-poster.jpg",
  depth: "/wallpapers/guqin-video-depth.png",
  video: "/wallpapers/video-1789033274452.mp4",
};
const FINISH_WALLPAPERS = {
  "star-white": STAR_WHITE_WALLPAPER,
  "night-sky": NIGHT_SKY_WALLPAPER,
};
const REFERENCE_WALLPAPERS = [
  STAR_WHITE_WALLPAPER,
  NIGHT_SKY_WALLPAPER,
  { id: "monochrome-angels", label: "黑白雕塑天使", screen: "/wallpapers/monochrome-angels.png", cover: "/wallpapers/monochrome-angels.png", depth: "/wallpapers/monochrome-angels-depth.png" },
  { id: "grain-coast", label: "颗粒版画海岸", screen: "/wallpapers/grain-coast.png", cover: "/wallpapers/grain-coast.png", depth: "/wallpapers/grain-coast-depth.png" },
  GUQIN_VIDEO_WALLPAPER,
];

const DEFAULT_WALLPAPER = STAR_WHITE_WALLPAPER;
const DEFAULT_SCREEN_CONTENT = {
  screenOverlay: "/screen-content/inner-layout.json",
  coverOverlay: "/screen-content/cover-layout.json",
};
const DEFAULT_IMAGE = DEFAULT_WALLPAPER.screen;

const DEFAULT_MODEL_ZOOM = 0.991875;
const DEFAULT_FOLD_BLUR = 99;
const SCENE_POSE = MEMORY_SCENE_POSE;
const DISPLAY_POSES = [SCENE_POSE, POSES.find(pose => pose.id === "landscape"), POSES.find(pose => pose.id === "closed")];

const POSE_LABELS = {
  zh: { scene: "场景", landscape: "横屏", closed: "闭合" },
  en: { scene: "Scene", landscape: "Landscape", closed: "Closed" },
};

const UI_COPY = {
  zh: {
    wallpaperStudio: "壁纸工作室", naturalScene: "自然回忆",
    foldCard: "可折叠设计。美妙的观看体验，精妙的创新设计，放进口袋刚刚好。", foldCardHint: "拖动下方滑块打开或折起",
    viewMode: "查看模式", language: "切换为英文", pose: "设备姿态", studioPanel: "壁纸与景深控制面板", foldDegree: "iPhone Duo 折叠程度", autoDemo: "自动演示",
    wallpaperGroup: "壁纸预设", upload: "上传图片或视频", replace: "更换图片或视频",
    currentWallpaper: "当前壁纸", videoPreview: "视频壁纸预览",
    showIcons: "显示图标", playVideo: "播放视频壁纸", depthTitle: "生成景深图",
    generate: "开始生成景深图", depthEffect: "景深效果", parallaxDemo: "视差演示",
    depthStrength: "景深强度",
    stage: "iPhone Duo 三维预览", fixedAngles: "固定开合角度", finishes: "iPhone Duo 配色",
    playFold: "播放折叠演示", pauseFold: "暂停折叠演示", foldAngle: "iPhone Duo 开合角度", dragFold: "拖动折叠",
    playPresentation: "播放展示", pausePresentation: "暂停展示", resumePresentation: "继续展示", rewindPresentation: "倒带", pauseRewind: "暂停倒带", resumeRewind: "继续倒带", preparingPresentation: "正在准备",
    reset: "重置展示", interactionHint: "拖动旋转  ·  滚轮缩放", sceneInteractionHint: "左右拖动环绕  ·  滚轮缩放",
  },
  en: {
    wallpaperStudio: "Wallpaper Studio", naturalScene: "Nature Memories",
    foldCard: "A foldable design with a beautiful viewing experience and pocketable innovation.", foldCardHint: "Drag the slider below to open or fold",
    viewMode: "View mode", language: "切换为中文", pose: "Device pose", studioPanel: "Wallpaper and depth controls", foldDegree: "iPhone Duo fold amount", autoDemo: "Auto demo",
    wallpaperGroup: "Wallpaper presets", upload: "Upload image or video", replace: "Replace image or video",
    currentWallpaper: "Current wallpaper", videoPreview: "Video wallpaper preview",
    showIcons: "Show screen icons", playVideo: "Play video wallpaper", depthTitle: "Generate Depth Map",
    generate: "Generate Depth Map", depthEffect: "Depth effect", parallaxDemo: "Parallax demo",
    depthStrength: "Depth strength",
    stage: "iPhone Duo 3D preview", fixedAngles: "Fixed fold angles", finishes: "iPhone Duo finishes",
    playFold: "Play fold demo", pauseFold: "Pause fold demo", foldAngle: "iPhone Duo opening angle", dragFold: "Drag to fold",
    playPresentation: "Play showcase", pausePresentation: "Pause showcase", resumePresentation: "Resume showcase", rewindPresentation: "Rewind", pauseRewind: "Pause rewind", resumeRewind: "Resume rewind", preparingPresentation: "Preparing",
    reset: "Reset view", interactionHint: "Drag to rotate  ·  Scroll to zoom", sceneInteractionHint: "Drag sideways to orbit  ·  Scroll to zoom",
  },
};

const FOLD_ANGLE_COPY = {
  zh: {
    0: { label: "闭合", description: "闭合 0°" },
    90: { label: "半开", description: "半开 90°" },
    180: { label: "展开", description: "展开 180°" },
  },
  en: {
    0: { label: "Closed", description: "Closed 0°" },
    90: { label: "Half", description: "Half open 90°" },
    180: { label: "Open", description: "Open 180°" },
  },
};

const WALLPAPER_LABELS = {
  zh: { "star-white-default": "Star White 沙漠", "night-sky-default": "Night Sky 沙漠", "monochrome-angels": "黑白雕塑天使", "grain-coast": "颗粒版画海岸", "guqin-video": "古琴动态壁纸" },
  en: { "star-white-default": "Star White Desert", "night-sky-default": "Night Sky Desert", "monochrome-angels": "Monochrome Angels", "grain-coast": "Grain Print Coast", "guqin-video": "Guqin Video" },
};

const DEPTH_STATUS_EN = {
  "主题壁纸已就绪，可开始生成景深": "Theme wallpaper ready · Generate depth when needed",
  "正在解析图片层次": "Analyzing image layers",
  "本地深度已就绪 · AI 精修中": "Local depth ready · AI refinement in progress",
  "本地深度图已生成": "Local depth map generated",
  "深度图生成失败": "Depth-map generation failed",
  "AI 正在理解画面空间": "AI is interpreting scene depth",
  "正在载入 AI 深度模型": "Loading AI depth model",
  "正在分析画面空间": "Analyzing scene depth",
  "正在进行 ZoeDepth 式层次精修": "Applying ZoeDepth-style layer refinement",
  "ZoeDepth 方法精修已完成": "ZoeDepth-style refinement complete",
  "本地深度图已就绪 · AI 暂不可用": "Local depth ready · AI refinement unavailable",
  "本地深度图已就绪": "Local depth map ready",
  "图片已就绪，可开始生成景深": "Image ready · Generate depth when needed",
  "请选择图片或视频文件": "Choose an image or video file",
  "视频请控制在 100MB 以内": "Keep videos under 100 MB",
  "图片请控制在 20MB 以内": "Keep images under 20 MB",
  "正在读取素材": "Reading media",
  "素材读取失败，请重试": "Could not read the media · Try again",
};

function localizeDepthStatus(label, language) {
  if (language === "zh") return label;
  if (label.startsWith("AI 深度模型载入 ")) return label.replace("AI 深度模型载入 ", "Loading AI depth model ");
  return DEPTH_STATUS_EN[label] || label;
}

const DEVICE_FINISHES = [
  { id: "night-sky", label: "Night Sky" },
  { id: "star-white", label: "Star White" },
];

const FOLD_ANGLE_PRESETS = [
  { angle: 0, Icon: ArrowsInLineHorizontal },
  { angle: 90, Icon: Angle },
  { angle: 180, Icon: ArrowsOutLineHorizontal },
];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

function ControlRow({ label, children }) {
  return (
    <div className="control-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function AppleRange({ id, label, value, min = 0, max = 100, onChange, className = "", variant = "default", trackLabel = "", thumbSize = 48 }) {
  const progress = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));

  return (
    <div
      className={`apple-slider ${variant === "fold" ? "stage-fold-range" : ""} ${className}`.trim()}
      style={{ "--slider-progress": `${progress * 100}%` }}
    >
      <input
        id={id}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {variant === "fold" ? (
        <span className="stage-fold-drag-label" aria-hidden="true">{trackLabel}</span>
      ) : (
        <span
          className="apple-slider-thumb"
          style={{ left: `calc(${progress * 100}% + ${(0.5 - progress) * thumbSize}px)` }}
          aria-hidden="true"
        >
          <CaretLeft size={13} weight="bold" />
          <CaretRight size={13} weight="bold" />
        </span>
      )}
    </div>
  );
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function App({ initialView = "memory" }) {
  const initialPose = initialView === "memory" ? MEMORY_CLOSED_POSE : DISPLAY_POSES[1];
  const qaView = new URLSearchParams(window.location.search).get("qa") === "1";
  const fileInputRef = useRef(null);
  const drawerRef = useRef(null);
  const [drawerHeight, setDrawerHeight] = useState(0);
  const presetAssetCacheRef = useRef([]);
  const workerRef = useRef(null);
  const jobRef = useRef(0);
  const [activeImage, setActiveImage] = useState(DEFAULT_IMAGE);
  const [activeCoverImage, setActiveCoverImage] = useState(DEFAULT_WALLPAPER.cover);
  const [screenOverlaySrc, setScreenOverlaySrc] = useState(DEFAULT_SCREEN_CONTENT.screenOverlay);
  const [coverOverlaySrc, setCoverOverlaySrc] = useState(DEFAULT_SCREEN_CONTENT.coverOverlay);
  const [wallpaperPreset, setWallpaperPreset] = useState(DEFAULT_WALLPAPER.id);
  const [wallpaperFollowsFinish, setWallpaperFollowsFinish] = useState(true);
  const [videoSrc, setVideoSrc] = useState("");
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [showContent, setShowContent] = useState(true);
  const [mediaName, setMediaName] = useState("");
  const uploadJob = useRef(0);
  const customVideoRef = useRef("");
  useEffect(() => () => { if (customVideoRef.current) URL.revokeObjectURL(customVideoRef.current); }, []);
  const [depthUrl, setDepthUrl] = useState(DEFAULT_WALLPAPER.depth);
  const [depthStatus, setDepthStatus] = useState({
    kind: "ready",
    label: "主题壁纸已就绪，可开始生成景深",
    progress: 0,
  });
  const [fold, setFold] = useState(initialPose.fold);
  const foldRef = useRef(fold);
  const demoDirectionRef = useRef(1);
  const [pose, setPose] = useState(initialPose.id);
  const [activeView, setActiveView] = useState(initialView);
  const isMemory = activeView === "memory";
  const lighthousePhoto = useLighthousePhoto();
  const [coverPhoto, setCoverPhoto] = useState({ ready: false, prepared: false, index: 0, target: 0, busy: false, error: "" });
  const [sceneReady, setSceneReady] = useState(true);
  const selectedMemory = MEMORY_PHOTOS[coverPhoto.index];
  const [pendingPhotoOpen, setPendingPhotoOpen] = useState(false);
  const pendingPhotoIndex = useRef(0);
  const language = "en";
  const portraitRecordingLayout = useMediaQuery("(max-aspect-ratio: 3/4)");
  const [autoDemo, setAutoDemo] = useState(false);
  const [presentationState, setPresentationState] = useState("idle");
  const presentationElapsed = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const memoryPlayer = useRef(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [livingScene, setLivingScene] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [interactionEpoch, setInteractionEpoch] = useState(0);
  const presentationDirection = useRef(1);
  const presentationSceneView = useRef(MEMORY_SCENE_POSE);
  const presentationStartView = useRef(MEMORY_CLOSED_POSE);
  const [deviceReady, setDeviceReady] = useState(false);
  const [depthEnabled, setDepthEnabled] = useState(true);
  const [parallaxEnabled, setParallaxEnabled] = useState(true);
  const [depthStrength, setDepthStrength] = useState(30);
  const [modelProgress, setModelProgress] = useState(0);
  const [deviceFinish, setDeviceFinish] = useState("star-white");
  const [modelRotation, setModelRotation] = useState(initialPose.rotation);
  const [modelZoom, setModelZoom] = useState(initialPose.zoom ?? DEFAULT_MODEL_ZOOM);
  const [screenOrientation, setScreenOrientation] = useState(initialPose.orientation);
  const activePoseIndex = Math.max(0, DISPLAY_POSES.findIndex((item) => item.id === pose));
  const copy = UI_COPY[language];
  const presentationReady = deviceReady && Boolean(lighthousePhoto.cover) && (!isMemory || (coverPhoto.ready && coverPhoto.prepared && sceneReady && !coverPhoto.busy));
  const inspectingScene = isMemory && presentationState === "complete";
  const rewinding = isMemory && presentationDirection.current === -1;
  const playLabel = isMemory
    ? !presentationReady ? copy.preparingPresentation : autoDemo ? (rewinding ? copy.pauseRewind : copy.pausePresentation) : presentationState === "paused" ? (rewinding ? copy.resumeRewind : copy.resumePresentation) : inspectingScene ? copy.rewindPresentation : copy.playPresentation
    : autoDemo ? copy.pauseFold : copy.playFold;
  const poseLabels = DISPLAY_POSES.map((item) => POSE_LABELS[language][item.id]);
  const showDepthStatus = depthStatus.kind !== "ready" || depthStatus.progress > 0;

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    if (activeView !== "wallpaper" || !drawerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setDrawerHeight(entry.target.getBoundingClientRect().height));
    observer.observe(drawerRef.current);
    return () => observer.disconnect();
  }, [activeView]);

  useEffect(() => {
    presetAssetCacheRef.current = [...new Set(REFERENCE_WALLPAPERS.flatMap((wallpaper) => [
      wallpaper.screen,
      wallpaper.cover,
      wallpaper.depth,
    ]).filter(Boolean))]
      .map((src) => {
        const asset = new Image();
        asset.decoding = "async";
        asset.src = src;
        return asset;
      });

    return () => {
      presetAssetCacheRef.current = [];
    };
  }, []);

  const reducedMotion = useReducedMotion();
  const photoJourney = usePhotoJourney(Boolean(reducedMotion));
  const poseFrame = useRef(0);
  const autoDemoFrame = useRef(0);
  const orbitFrame = useRef(0);
  const orbitDragging = useRef(false);
  const orbitResumeAt = useRef(0);
  const poseTransitionVersion = useRef(0);
  const modelRotationRef = useRef(modelRotation);
  const modelZoomRef = useRef(modelZoom);
  const screenOrientationRef = useRef(screenOrientation);
  const commitFold = useCallback((nextFold) => {
    const clamped = Math.max(0, Math.min(1, nextFold));
    foldRef.current = clamped;
    setFold(clamped);
  }, []);
  const commitModelRotation = useCallback((nextRotation) => {
    modelRotationRef.current = nextRotation;
    setModelRotation(nextRotation);
  }, []);
  const commitModelZoom = useCallback((nextZoom) => {
    modelZoomRef.current = nextZoom;
    setModelZoom(nextZoom);
  }, []);
  const commitScreenOrientation = useCallback((nextOrientation) => {
    screenOrientationRef.current = nextOrientation;
    setScreenOrientation(nextOrientation);
  }, []);
  const cancelPoseTransition = useCallback(() => {
    poseTransitionVersion.current += 1;
    cancelAnimationFrame(poseFrame.current);
    poseFrame.current = 0;
  }, []);
  const stopAutoDemo = useCallback(() => {
    setPendingPhotoOpen(false);
    memoryPlayer.current?.pause();
    cancelAnimationFrame(autoDemoFrame.current);
    autoDemoFrame.current = 0;
    cancelAnimationFrame(orbitFrame.current);
    orbitFrame.current = 0;
    orbitDragging.current = false;
    setAutoDemo(false);
    presentationElapsed.current = 0;
    setElapsed(0);
    presentationDirection.current = 1;
    setPresentationState("idle");
  }, []);
  useEffect(() => () => {
    cancelPoseTransition();
    cancelAnimationFrame(autoDemoFrame.current);
    cancelAnimationFrame(orbitFrame.current);
  }, [cancelPoseTransition]);
  const transitionTo = (nextFold, nextRotation = modelRotationRef.current, nextOrientation = screenOrientationRef.current, nextZoom = DEFAULT_MODEL_ZOOM) => {
    cancelPoseTransition();
    stopAutoDemo();
    setInteractionEpoch(value => value + 1);
    if (reducedMotion) {
      commitFold(nextFold);
      commitModelRotation(nextRotation);
      commitModelZoom(nextZoom);
      commitScreenOrientation(nextOrientation);
      return;
    }
    const transitionVersion = poseTransitionVersion.current;
    const startFold = foldRef.current;
    const startZoom = modelZoomRef.current;
    const startOrientation = screenOrientationRef.current;
    const toQuaternion = (r) => new Quaternion().setFromEuler(new Euler(...[r.x, r.y, r.z].map(MathUtils.degToRad)));
    const start = toQuaternion(modelRotationRef.current);
    const end = toQuaternion(nextRotation);
    const began = performance.now();
    const tick = (time) => {
      if (transitionVersion !== poseTransitionVersion.current) return;
      const t = Math.min(1, (time - began) / 1100);
      const eased = t * t * (3 - 2 * t);
      const rotation = new Euler().setFromQuaternion(start.clone().slerp(end, eased));
      commitModelRotation({ x: MathUtils.radToDeg(rotation.x), y: MathUtils.radToDeg(rotation.y), z: MathUtils.radToDeg(rotation.z) });
      commitFold(startFold + (nextFold - startFold) * eased);
      commitModelZoom(startZoom + (nextZoom - startZoom) * eased);
      commitScreenOrientation(startOrientation + (nextOrientation - startOrientation) * eased);
      if (t < 1) poseFrame.current = requestAnimationFrame(tick);
      else {
        poseFrame.current = 0;
        commitFold(nextFold);
        commitModelRotation(nextRotation);
        commitModelZoom(nextZoom);
        commitScreenOrientation(nextOrientation);
      }
    };
    poseFrame.current = requestAnimationFrame(tick);
  };

  const openingAngle = progressToOpeningAngle(fold);
  const foldFillPercent = Math.min(100, Math.max(0, (openingAngle / 180) * 100));

  const runDepthPipeline = useCallback(
    async (image, useAi = true) => {
      const jobId = ++jobRef.current;
      setDepthStatus({ kind: "processing", label: "正在解析图片层次", progress: 18 });

      try {
        const fastDepth = await createFastDepthMap(image);
        if (jobRef.current !== jobId) return;
        setDepthUrl(fastDepth);
        setDepthStatus({
          kind: useAi ? "processing" : "ready",
          label: useAi ? "本地深度已就绪 · AI 精修中" : "本地深度图已生成",
          progress: useAi ? 46 : 100,
        });
        if (useAi && workerRef.current) {
          workerRef.current.postMessage({ id: jobId, image });
        }
      } catch (error) {
        if (jobRef.current === jobId) {
          setDepthStatus({
            kind: "error",
            label: error instanceof Error ? error.message : "深度图生成失败",
            progress: 0,
          });
        }
      }
    },
    [],
  );

  useEffect(() => {
    const worker = new Worker(new URL("./depth.worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (event) => {
      const message = event.data || {};
      const currentJob = jobRef.current;
      if (message.id && message.id !== currentJob) return;

      if (message.type === "progress") {
        const modelProgressValue = Math.max(0, Math.min(100, Math.round(message.progress || 0)));
        setDepthStatus({
          kind: "processing",
          label: `AI 深度模型载入 ${modelProgressValue}%`,
          progress: Math.min(88, 48 + modelProgressValue * 0.4),
        });
      }

      if (message.type === "model-ready") {
        setDepthStatus({ kind: "processing", label: "AI 正在理解画面空间", progress: 88 });
      }

      if (message.type === "status") {
        setDepthStatus((status) => ({ ...status, kind: "processing", label: message.label }));
      }

      if (message.type === "complete" && message.id === currentJob) {
        const aiDepth = depthBytesToDataUrl(message.bytes, message.width, message.height);
        setDepthUrl(aiDepth);
        setDepthStatus({ kind: "ready", label: "ZoeDepth 方法精修已完成", progress: 100 });
      }

      if (message.type === "error" && message.id === currentJob) {
        setDepthStatus({
          kind: "ready",
          label: "本地深度图已就绪 · AI 暂不可用",
          progress: 100,
        });
      }
    });

    worker.addEventListener("error", () => {
      setDepthStatus({ kind: "ready", label: "本地深度图已就绪", progress: 100 });
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = createMemoryPlayback({
      onFrame: frame => {
        presentationElapsed.current = frame.elapsed;
        setElapsed(frame.elapsed);
        commitFold(frame.fold);
        commitModelRotation(frame.rotation);
        commitModelZoom(frame.zoom);
        commitScreenOrientation(frame.orientation);
      },
      onComplete: direction => {
        setPose(direction === 1 ? "scene" : "closed");
        setPresentationState(direction === 1 ? "complete" : "idle");
        setAutoDemo(false);
      },
    });
    memoryPlayer.current = player;
    return () => { player.dispose(); memoryPlayer.current = null; };
  }, [commitFold, commitModelRotation, commitModelZoom, commitScreenOrientation]);

  useEffect(() => {
    if (!autoDemo) return;
    if (isMemory) {
      const direction = presentationDirection.current;
      if (reducedMotion) {
        memoryPlayer.current.seek(direction === 1 ? MEMORY_PRESENTATION_DURATION : 0, presentationSceneView.current);
        setPose(direction === 1 ? "scene" : "closed");
        setPresentationState(direction === 1 ? "complete" : "idle");
        setAutoDemo(false);
      } else memoryPlayer.current.play({ elapsed: presentationElapsed.current, direction, sceneView: presentationSceneView.current, startView: presentationStartView.current });
      return () => memoryPlayer.current?.pause();
    }
    const startedAt = performance.now();
    const phase = Math.acos(1 - 2 * Math.max(0, Math.min(1, foldRef.current)));
    const startPhase = demoDirectionRef.current < 0 ? Math.PI * 2 - phase : phase;
    const animate = (time) => {
      const nextPhase = startPhase + (time - startedAt) / 1700;
      const nextFold = (1 - Math.cos(nextPhase)) / 2;
      demoDirectionRef.current = Math.sin(nextPhase) >= 0 ? 1 : -1;
      commitFold(nextFold);
      autoDemoFrame.current = requestAnimationFrame(animate);
    };
    autoDemoFrame.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(autoDemoFrame.current);
      autoDemoFrame.current = 0;
    };
  }, [autoDemo, isMemory, reducedMotion, commitFold, commitModelRotation, commitModelZoom, commitScreenOrientation]);

  useEffect(() => {
    if (!inspectingScene || !autoOrbit || overlayOpen || reducedMotion) return;
    let previousTime = performance.now();
    orbitResumeAt.current = previousTime + 2000;
    const animate = (time) => {
      const delta = Math.min(50, time - previousTime);
      previousTime = time;
      if (!document.hidden && !orbitDragging.current && time > orbitResumeAt.current) {
        const speed = Math.min(1, (time - orbitResumeAt.current) / 800);
        // The scene grows along local +Z; turn around it without tilting the sea.
        const current = modelRotationRef.current;
        commitModelRotation({ ...current, z: current.z - delta * .004 * speed });
      }
      orbitFrame.current = requestAnimationFrame(animate);
    };
    orbitFrame.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(orbitFrame.current); orbitFrame.current = 0; };
  }, [inspectingScene, autoOrbit, overlayOpen, reducedMotion, commitModelRotation]);

  const beginRotation = () => {
    cancelPoseTransition();
    if (inspectingScene) orbitDragging.current = true;
    else stopAutoDemo();
  };
  const endRotation = () => {
    orbitDragging.current = false;
    orbitResumeAt.current = performance.now() + 3000;
  };

  const togglePlayback = () => {
    cancelPoseTransition();
    setInteractionEpoch(value => value + 1);
    orbitDragging.current = false;
    if (autoDemo) {
      memoryPlayer.current?.pause();
      cancelAnimationFrame(autoDemoFrame.current);
      autoDemoFrame.current = 0;
      setAutoDemo(false);
      if (isMemory) setPresentationState("paused");
      return;
    }
    if (isMemory) {
      if (!presentationReady) return;
      if (inspectingScene) {
        cancelAnimationFrame(orbitFrame.current);
        orbitFrame.current = 0;
        orbitDragging.current = false;
        presentationDirection.current = -1;
        presentationElapsed.current = MEMORY_PRESENTATION_DURATION;
        presentationSceneView.current = { rotation: modelRotationRef.current, zoom: modelZoomRef.current };
      } else if (presentationState !== "paused") {
        presentationDirection.current = 1;
        presentationSceneView.current = MEMORY_SCENE_POSE;
        const startView = { fold: foldRef.current, rotation: modelRotationRef.current, zoom: modelZoomRef.current, orientation: screenOrientationRef.current };
        presentationStartView.current = startView;
        const needsReturn = startView.fold !== MEMORY_CLOSED_POSE.fold || startView.zoom !== MEMORY_CLOSED_POSE.zoom || startView.orientation !== MEMORY_CLOSED_POSE.orientation || ["x", "y", "z"].some(axis => Math.abs((startView.rotation[axis] - MEMORY_CLOSED_POSE.rotation[axis]) % 360) > .00001);
        presentationElapsed.current = needsReturn ? -MEMORY_RETURN_DURATION : 0;
      }
      setPose("scene");
      setPresentationState("playing");
    }
    setAutoDemo(true);
  };

  const openWithPhotograph = () => {
    if (!autoDemo && !inspectingScene) photoJourney.stop();
    if (!autoDemo && !inspectingScene && !presentationReady) {
      pendingPhotoIndex.current = coverPhoto.index;
      setPendingPhotoOpen(true);
      photoJourney.select(coverPhoto.index);
      return;
    }
    togglePlayback();
  };
  const continuePhotoOpen = useEffectEvent(() => {
    setPendingPhotoOpen(false);
    togglePlayback();
  });
  useEffect(() => {
    if (pendingPhotoOpen && isMemory && presentationReady && coverPhoto.index === pendingPhotoIndex.current) continuePhotoOpen();
  }, [pendingPhotoOpen, isMemory, presentationReady, coverPhoto.index]);

  const seekMemory = (progress) => {
    setPendingPhotoOpen(false);
    if (progress > 0 && !selectedMemory.scene) photoJourney.reset(true);
    cancelPoseTransition();
    setInteractionEpoch(value => value + 1);
    orbitDragging.current = false;
    setAutoDemo(false);
    if (inspectingScene) presentationSceneView.current = { rotation: modelRotationRef.current, zoom: modelZoomRef.current };
    const time = progress * MEMORY_PRESENTATION_DURATION;
    memoryPlayer.current.seek(time, presentationSceneView.current);
    setPresentationState(progress >= 1 ? "complete" : progress <= 0 ? "idle" : "paused");
    if (progress <= 0) presentationDirection.current = 1;
  };

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (!document.hidden || !autoDemo) return;
      memoryPlayer.current?.pause();
      cancelAnimationFrame(autoDemoFrame.current);
      setAutoDemo(false);
      if (isMemory) setPresentationState("paused");
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [autoDemo, isMemory]);

  const choosePose = (nextPose) => {
    setPose(nextPose.id);
    transitionTo(nextPose.fold, nextPose.rotation, nextPose.orientation, nextPose.zoom);
  };

  const chooseOpeningAngle = (angle) => {
    transitionTo(openingAngleToProgress(angle), modelRotationRef.current, screenOrientationRef.current, modelZoomRef.current);
  };

  const changeDepthEnabled = (enabled) => {
    setDepthEnabled(enabled);
  };

  const chooseReferenceWallpaper = (wallpaper, { followFinish = false } = {}) => {
    uploadJob.current += 1;
    if (customVideoRef.current) URL.revokeObjectURL(customVideoRef.current);
    customVideoRef.current = "";
    setVideoSrc(wallpaper.video || "");
    setVideoPlaying(true);
    jobRef.current += 1;
    setWallpaperPreset(wallpaper.id);
    setWallpaperFollowsFinish(followFinish);
    setActiveImage(wallpaper.screen);
    setActiveCoverImage(wallpaper.cover);
    setScreenOverlaySrc(DEFAULT_SCREEN_CONTENT.screenOverlay);
    setCoverOverlaySrc(DEFAULT_SCREEN_CONTENT.coverOverlay);
    setDepthUrl(wallpaper.depth || "");
    setMediaName("");
    setDepthStatus({ kind: "ready", label: wallpaper.video ? "" : "预设景深已加载", progress: 0 });
  };

  const chooseDeviceFinish = (finish) => {
    setDeviceFinish(finish);
    if (wallpaperFollowsFinish) {
      chooseReferenceWallpaper(FINISH_WALLPAPERS[finish], { followFinish: true });
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) {
      setDepthStatus({ kind: "error", label: "请选择图片或视频文件", progress: 0 }); return;
    }
    if (file.size > (isVideo ? 100 : 20) * 1024 * 1024) {
      setDepthStatus({ kind: "error", label: isVideo ? "视频请控制在 100MB 以内" : "图片请控制在 20MB 以内", progress: 0 }); return;
    }
    const request = ++uploadJob.current;
    jobRef.current += 1;
    const url = URL.createObjectURL(file);
    let retained = false;
    setDepthStatus({ kind: "processing", label: "正在读取素材", progress: 8 });
    try {
      if (isVideo) {
        await inspectVideo(url);
        if (request !== uploadJob.current) return;
        if (customVideoRef.current) URL.revokeObjectURL(customVideoRef.current);
        customVideoRef.current = url;
        retained = true;
        setVideoSrc(url);
        setVideoPlaying(true);
        setDepthUrl("");
        setDepthStatus({ kind: "ready", label: "", progress: 0 });
      } else {
        const nextImage = await normalizeImageForGpu(url);
        if (request !== uploadJob.current) return;
        if (customVideoRef.current) URL.revokeObjectURL(customVideoRef.current);
        customVideoRef.current = "";
        setVideoSrc("");
        setActiveImage(nextImage);
        setActiveCoverImage(nextImage);
        setDepthUrl("");
        setDepthStatus({ kind: "ready", label: "图片已就绪，可开始生成景深", progress: 0 });
      }
      setWallpaperPreset("custom");
      setWallpaperFollowsFinish(false);
      setMediaName(file.name);
    } catch (error) {
      if (request === uploadJob.current) setDepthStatus({ kind: "error", label: error.message || "素材读取失败，请重试", progress: 0 });
    } finally {
      if (!retained) URL.revokeObjectURL(url);
    }
  };

  const resetView = () => {
    if (isMemory) photoJourney.reset();
    choosePose(isMemory ? MEMORY_CLOSED_POSE : DISPLAY_POSES[1]);
  };

  const changeView = (view) => {
    photoJourney.stop();
    if (view === activeView) return;
    cancelPoseTransition();
    stopAutoDemo();
    if (view === "memory") choosePose(MEMORY_CLOSED_POSE);
    else if (pose === "scene") choosePose(DISPLAY_POSES[1]);
    setDeviceReady(false);
    setActiveView(view);
  };

  useEffect(() => {
    document.title = isMemory ? `Nature Memories — ${selectedMemory.title}` : "Wallpaper Studio — Nature Memories";
  }, [isMemory, selectedMemory.title]);

  const phase = inspectingScene ? "exploring" : autoDemo && elapsed < 0 ? "returning" : presentationState === "paused" ? "paused" : autoDemo ? "playing" : "cover";
  const photoCoverView = isMemory && phase === "cover" && fold < .002 && Math.abs(modelRotation.x) < .1 && Math.abs(modelRotation.y) < .1 && Math.abs(modelRotation.z - 90) < .1;
  const photoRetraction = phase === "cover" ? (photoCoverView ? 0 : 1) : elapsed < 0 ? 1 : getPhotoRetraction(elapsed);
  const framingProgress = Math.min(1, fold / .8);
  const homeScale = photoJourney.frame.scale + (1 - photoJourney.frame.scale) * framingProgress * framingProgress * (3 - 2 * framingProgress);
  const memoryPoses = [SCENE_POSE, DISPLAY_POSES[1], MEMORY_CLOSED_POSE];
  const actualPreset = (isMemory ? memoryPoses : DISPLAY_POSES).find(item => Math.abs(fold - item.fold) < .001 && Math.abs(modelZoom - (item.zoom ?? DEFAULT_MODEL_ZOOM)) < .001 && Math.abs(screenOrientation - item.orientation) < .001 && ["x", "y", "z"].every(axis => Math.abs(((modelRotation[axis] - item.rotation[axis] + 180) % 360 + 360) % 360 - 180) < .1));
  const viewLabel = actualPreset ? POSE_LABELS.en[actualPreset.id] : "Custom view";
  const sound = useMemoryAudio({ active: isMemory, fold, rewinding: rewinding && (autoDemo || presentationState === "paused") });
  const phone = <FoldablePhone
          className="reference-phone"
          value={fold}
          onValueChange={commitFold}
        >
          <PhoneDevice
            key={isMemory ? "natural-scene" : "original"}
            diorama={isMemory}
            memorySceneId={selectedMemory.scene ? selectedMemory.id : "lighthouse"}
            onSceneReadyChange={setSceneReady}
            sceneMotion={livingScene && !overlayOpen}
            interactionEpoch={interactionEpoch}
            onReadyChange={setDeviceReady}
            modelSrc="/assets/iphone-duo/iphone-duo.gltf"
            screenSrc={isMemory ? SEA_SCREEN : activeImage}
            coverSrc={isMemory ? lighthousePhoto.cover || activeCoverImage : activeCoverImage}
            coverPhotoPosition={isMemory ? photoJourney.position : undefined}
            coverPhotoActive={isMemory && photoRetraction < 1 && !overlayOpen}
            coverPhotoRetraction={photoRetraction}
            homeScale={isMemory ? homeScale : 1}
            browsePhotos={photoCoverView}
            onCoverPhotoState={setCoverPhoto}
            videoSrc={isMemory ? undefined : videoSrc}
            videoPlaying={videoPlaying}
            foldEffects={!isMemory}
            foldProjection={!isMemory && pose === "foldable"}
            innerFocusFlip={pose === "tabletop"}
            screenOrientation={screenOrientation}
            screenLayoutVariant={pose === "tabletop" ? "seated" : "default"}
            screenOverlaySrc={!isMemory && showContent ? screenOverlaySrc : undefined}
            coverOverlaySrc={!isMemory && showContent ? coverOverlaySrc : undefined}
            depthSrc={isMemory ? undefined : depthUrl || undefined}
            depthEnabled={!isMemory && Boolean(depthUrl) && depthEnabled}
            depthStrength={depthStrength / 100}
            finish={deviceFinish}
            rotation={modelRotation.y}
            rotationX={modelRotation.x}
            rotationZ={modelRotation.z}
            dragToRotate
            sceneOrbit={isMemory && fold > .98 && Math.abs(modelRotation.x + 72) < .1 && Math.abs(modelRotation.y) < .1}
            onRotationStart={beginRotation}
            onRotationEnd={endRotation}
            onRotationChange={commitModelRotation}
            zoom={modelZoom}
            zoomScale={isMemory ? 1 : portraitRecordingLayout ? 1.3 : 1}
            onZoomChange={(zoom) => {
              cancelPoseTransition();
              if (inspectingScene) orbitResumeAt.current = performance.now() + 3000;
              else stopAutoDemo();
              commitModelZoom(zoom);
            }}
            exposure={isMemory ? 1 : 1.2}
            blur={isMemory ? 0 : DEFAULT_FOLD_BLUR}
            parallax={!isMemory && parallaxEnabled ? 1 : 0}
            language={language}
          />
        </FoldablePhone>;

  return (
    <main className={`app-shell view-${activeView} ${qaView ? "qa-view" : ""}`} style={{ "--studio-height": `${drawerHeight}px` }}>
      {isMemory ? <MemoryExperience
        ready={presentationReady} error={coverPhoto.error || (lighthousePhoto.error ? "Could not load the photograph. Please reload." : "")}
        photoJourney={photoJourney} photoCoverView={photoCoverView} coverPhoto={coverPhoto} pendingPhotoOpen={pendingPhotoOpen}
        phase={phase} playing={autoDemo} rewinding={rewinding}
        progress={Math.max(0, elapsed / MEMORY_PRESENTATION_DURATION)} fold={fold} openingAngle={openingAngle}
        onPlay={openWithPhotograph} onSeek={seekMemory} onReset={resetView} onStudio={() => changeView("wallpaper")}
        viewLabel={viewLabel} presets={memoryPoses.map(item => ({ id: item.id, label: POSE_LABELS.en[item.id] }))}
        onPreset={value => typeof value === "number" ? chooseOpeningAngle(value) : choosePose(memoryPoses.find(item => item.id === value))}
        onAngleChange={angle => { cancelPoseTransition(); stopAutoDemo(); setInteractionEpoch(value => value + 1); commitFold(openingAngleToProgress(angle)); }}
        finish={deviceFinish} onFinish={chooseDeviceFinish} zoom={modelZoom}
        onZoom={zoom => { setInteractionEpoch(value => value + 1); cancelPoseTransition(); if (!inspectingScene) stopAutoDemo(); endRotation(); commitModelZoom(zoom); }}
        autoOrbit={autoOrbit && !reducedMotion} onAutoOrbit={setAutoOrbit}
        livingScene={livingScene} onLivingScene={setLivingScene} sound={sound} onOverlayChange={setOverlayOpen}
      >{phone}</MemoryExperience> : <>
      <nav className="top-switcher motion-glass" aria-label={copy.viewMode} role="tablist">
        {[
          { id: "memory", label: copy.naturalScene },
          { id: "wallpaper", label: copy.wallpaperStudio },
        ].map((view) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            key={view.id}
            onClick={() => changeView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {activeView === "wallpaper" ? (
      <aside ref={drawerRef} className="control-drawer studio motion-glass" aria-label={copy.studioPanel}>
        <section className="rail-section upload-section">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            aria-label="Choose image or video file"
            tabIndex={-1}
            accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
            onChange={handleFile}
          />
          <div className="repo-wallpaper-controls" role="group" aria-label={copy.wallpaperGroup}>
            {REFERENCE_WALLPAPERS.map((wallpaper) => (
              <button
                type="button"
                key={wallpaper.id}
                aria-label={WALLPAPER_LABELS[language][wallpaper.id] || wallpaper.label}
                aria-pressed={wallpaperPreset === wallpaper.id}
                title={WALLPAPER_LABELS[language][wallpaper.id] || wallpaper.label}
                onClick={() => chooseReferenceWallpaper(wallpaper)}
              >
                <img src={wallpaper.cover} alt="" />
              </button>
            ))}
          </div>
          <button type="button" className="upload-button" onClick={() => fileInputRef.current?.click()}>
            <UploadSimple size={20} weight="bold" />
            <span>{copy.upload}</span>
            <CaretUp size={16} weight="bold" />
          </button>

          <div className="wallpaper-preview">
            {videoSrc ? <video src={videoSrc} muted playsInline loop autoPlay={videoPlaying} controls aria-label={copy.videoPreview} /> : <img src={activeImage} alt={copy.currentWallpaper} />}
          </div>
          <button type="button" className="upload-link" onClick={() => fileInputRef.current?.click()}>
            {copy.replace} <UploadSimple size={15} />
          </button>
        </section>

        <section className="rail-section switch-section">
          <div className="switch-row-primary">
            <ControlRow label={copy.showIcons}><Toggle label={copy.showIcons} checked={showContent} onChange={setShowContent} /></ControlRow>
            <ControlRow label={copy.depthEffect}>
              <Toggle label={copy.depthEffect} checked={depthEnabled} onChange={changeDepthEnabled} />
            </ControlRow>
            <ControlRow label={copy.parallaxDemo}>
              <Toggle label={copy.parallaxDemo} checked={parallaxEnabled} onChange={setParallaxEnabled} />
            </ControlRow>
          </div>
          {videoSrc ? <ControlRow label={copy.playVideo}><Toggle label={copy.playVideo} checked={videoPlaying} onChange={setVideoPlaying} /></ControlRow> : null}
          {mediaName ? <p className="media-name">{mediaName}</p> : null}
        </section>
        <section className="rail-section depth-generator">
          <button
            type="button"
            className="generate-button"
            onClick={() => runDepthPipeline(activeImage, true)}
            disabled={Boolean(videoSrc) || depthStatus.kind === "processing"}
          >
            {copy.generate}
          </button>
          {showDepthStatus ? (
            <>
              <div className={`depth-status ${depthStatus.kind}`}>
                {depthStatus.kind === "error" ? (
                  <WarningCircle size={17} weight="fill" />
                ) : (
                  <CheckCircle size={17} weight="fill" />
                )}
                <span>{localizeDepthStatus(depthStatus.label, language)}</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${depthStatus.progress}%` }} />
              </div>
            </>
          ) : null}
        </section>

        <section className="rail-section effect-section">
          <label className="strength-label" htmlFor="depth-strength">
            <span>{copy.depthStrength}</span>
            <output>{depthStrength}%</output>
          </label>
          <AppleRange
            id="depth-strength"
            className="depth-strength-slider"
            label={copy.depthStrength}
            value={depthStrength}
            thumbSize={12}
            onChange={setDepthStrength}
          />
        </section>
      </aside>
      ) : null}

      <section className="stage" aria-label={copy.stage} data-wallpaper-preset={wallpaperPreset}>
        {phone}
        <div className="stage-pose-controls stage-pose-wheel-shell">
          <span className="stage-pose-wheel-mark" aria-hidden="true" />
          <OptionWheel
            items={poseLabels}
            selected={activePoseIndex}
            defaultSelected={activePoseIndex}
            ariaLabel={copy.pose}
            side="left"
            fontSize={0.9}
            spacing={2.4}
            curve={0.86}
            tilt={8}
            blur={0.8}
            fade={0.2}
            smoothing={150}
            inset={30}
            loop
            draggable
            onChange={(index) => {
              const nextPose = DISPLAY_POSES[index];
              if (nextPose && nextPose.id !== pose) choosePose(nextPose);
            }}
          />
        </div>
        <div className="viewer-panel">
          <div className="viewer-primary-controls">
          <div className="viewer-config-row">
            <div className="bottom-control-group motion-glass">
              <div className="fold-angle-presets" role="group" aria-label={copy.fixedAngles}>
                {FOLD_ANGLE_PRESETS.map(({ angle, Icon }) => {
                  const { label, description } = FOLD_ANGLE_COPY[language][angle];
                  return (
                  <button
                    type="button"
                    key={angle}
                    className={`bottom-choice-button ${openingAngle === angle ? "is-active" : ""}`}
                    aria-label={description}
                    aria-pressed={openingAngle === angle}
                    title={description}
                    onClick={() => chooseOpeningAngle(angle)}
                  >
                    <Icon size={18} weight="regular" />
                    <span>{label}</span>
                  </button>
                  );
                })}
              </div>
            </div>
            <div className="bottom-control-group finish-picker motion-glass" role="radiogroup" aria-label={copy.finishes}>
              <div className="finish-swatches">
                {DEVICE_FINISHES.map((finish) => (
                  <button
                    type="button"
                    key={finish.id}
                    className={`bottom-choice-button finish-swatch ${finish.id} ${deviceFinish === finish.id ? "is-selected" : ""}`}
                    role="radio"
                    aria-checked={deviceFinish === finish.id}
                    aria-label={finish.label}
                    title={finish.label}
                    onClick={() => chooseDeviceFinish(finish.id)}
                  >
                    <span className="finish-swatch-dot" aria-hidden="true" />
                    <span className="finish-swatch-label">{finish.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="viewer-utility-row">
            {(
              <div className="stage-fold-controls">
                <button className={`stage-fold-play ${isMemory ? "stage-fold-play--presentation" : ""}`} type="button" aria-label={playLabel} title={playLabel} aria-pressed={autoDemo} disabled={isMemory && !presentationReady} onClick={togglePlayback}>
                  {autoDemo ? <Pause size={18} weight="fill" /> : inspectingScene || (rewinding && presentationState === "paused") ? <Rewind size={18} weight="fill" /> : <Play size={18} weight="fill" />}
                  {isMemory ? <span>{playLabel}</span> : null}
                </button>
                <div className="stage-fold-scrubber" style={{ "--fold-progress": `${foldFillPercent}%` }}>
                  <div className="stage-fold-ruler" aria-hidden="true">
                    {Array.from({ length: 37 }, (_, index) => (
                      <span
                        key={index}
                        className={index % 6 === 0 ? "is-major" : index % 3 === 0 ? "is-medium" : ""}
                      />
                    ))}
                    <i className="stage-fold-ruler-marker" />
                  </div>
                  <AppleRange
                    className="stage-fold-slider"
                    variant="fold"
                    trackLabel={copy.dragFold}
                    label={copy.foldAngle}
                    value={openingAngle}
                    max={180}
                    onChange={(value) => {
                      cancelPoseTransition();
                      stopAutoDemo();
                      commitFold(openingAngleToProgress(value));
                    }}
                  />
                  <output>{openingAngle}°</output>
                </div>
              </div>
            )}
            <button type="button" className="viewer-reset-button motion-glass" aria-label={copy.reset} title={copy.reset} onClick={resetView}>
              <ArrowCounterClockwise size={19} />
            </button>
          </div>

          <p className="viewer-hint">{inspectingScene ? copy.sceneInteractionHint : copy.interactionHint}</p>
          </div>

        </div>
      </section>
      </>}
    </main>
  );
}
