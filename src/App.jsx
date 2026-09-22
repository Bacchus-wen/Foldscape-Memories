import { Euler, Quaternion, MathUtils } from "three";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { POSES } from "./iphone-duo/poses";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { FoldablePhone, PhoneDevice } from "./iphone-duo";
import { MEMORY_PHOTOS } from "./iphone-duo/memory-photos";
import deliveryAssets from './delivery-assets';
import MemoryExperience from "./components/MemoryExperience";
import { usePhotoJourney } from "./iphone-duo/use-photo-journey";
import { createMemoryPlayback } from "./iphone-duo/diorama/memory-playback";
import { useMemoryAudio } from "./iphone-duo/diorama/use-memory-audio";
import { SEA_SCREEN, useLighthousePhoto } from "./iphone-duo/diorama/use-lighthouse-photo";
import { MEMORY_CLOSED_POSE, MEMORY_SCENE_POSE, MEMORY_ORBIT_DELAY, MEMORY_PRESENTATION_DURATION, MEMORY_RETURN_DURATION, getPhotoRetraction } from "./iphone-duo/diorama/memory-presentation";
const DEFAULT_MODEL_ZOOM = 0.991875;
const SCENE_POSE = MEMORY_SCENE_POSE;
const DISPLAY_POSES = [SCENE_POSE, { ...POSES.find(pose => pose.id === "landscape"), zoom: DEFAULT_MODEL_ZOOM * 1.6 }, POSES.find(pose => pose.id === "closed")];

const POSE_LABELS = {
  zh: { scene: "场景", landscape: "横屏", closed: "闭合" },
  en: { scene: "Scene", landscape: "Landscape", closed: "Closed" },
};

export function App() {
  const initialPose = MEMORY_CLOSED_POSE;
  const qaView = new URLSearchParams(window.location.search).get("qa") === "1";
  const [fold, setFold] = useState(initialPose.fold);
  const foldRef = useRef(fold);
  const demoDirectionRef = useRef(1);
  const [pose, setPose] = useState(initialPose.id);
  const isMemory = true;
  const lighthousePhoto = useLighthousePhoto();
  const [coverPhoto, setCoverPhoto] = useState({ ready: false, prepared: false, index: 0, target: 0, busy: false, error: "" });
  const [sceneReady, setSceneReady] = useState(true);
  const selectedMemory = MEMORY_PHOTOS[coverPhoto.index];
  const [pendingPhotoOpen, setPendingPhotoOpen] = useState(false);
  const pendingPhotoIndex = useRef(0);
  const language = "en";
  const [autoDemo, setAutoDemo] = useState(false);
  const [presentationState, setPresentationState] = useState("idle");
  const presentationElapsed = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const memoryPlayer = useRef(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const livingScene = true;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [interactionEpoch, setInteractionEpoch] = useState(0);
  const presentationDirection = useRef(1);
  const presentationSceneView = useRef(MEMORY_SCENE_POSE);
  const presentationStartView = useRef(MEMORY_CLOSED_POSE);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceFinish, setDeviceFinish] = useState("star-white");
  const [modelRotation, setModelRotation] = useState(initialPose.rotation);
  const [modelZoom, setModelZoom] = useState(initialPose.zoom ?? DEFAULT_MODEL_ZOOM);
  const [screenOrientation, setScreenOrientation] = useState(initialPose.orientation);
  const presentationReady = deviceReady && Boolean(lighthousePhoto.cover) && (!isMemory || (coverPhoto.ready && coverPhoto.prepared && sceneReady && !coverPhoto.busy));
  const inspectingScene = isMemory && presentationState === "complete";
  const rewinding = isMemory && presentationDirection.current === -1;
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const reducedMotion = useReducedMotion();
  const photoJourney = usePhotoJourney(Boolean(reducedMotion), coverPhoto.availableCount ?? 0);
  const homeInspection = useMotionValue(0);
  const inspectionTween = useRef(null);
  const [inspectingDevice, setInspectingDevice] = useState(false);
  const inspectionReturning = useRef(false);
  useEffect(() => () => inspectionTween.current?.stop(), []);
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
    orbitResumeAt.current = previousTime + MEMORY_ORBIT_DELAY;
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
    if (!inspectingScene && !autoDemo && foldRef.current < .002) {
      photoJourney.stop();
      if (photoJourney.position >= 1 && coverPhoto.busy) photoJourney.select(coverPhoto.index);
      inspectionReturning.current = false;
      setInspectingDevice(true);
      inspectionTween.current?.stop();
      inspectionTween.current = animate(homeInspection, 1, { duration: reducedMotion ? 0 : .75, ease: [.22, 1, .36, 1] });
    }
    if (inspectingScene) orbitDragging.current = true;
    else stopAutoDemo();
  };
  const returnToPhotographs = () => {
    if (inspectionReturning.current) return;
    inspectionReturning.current = true;
    choosePose(MEMORY_CLOSED_POSE);
    if (photoJourney.position < 1) photoJourney.select(0);
    inspectionTween.current?.stop();
    inspectionTween.current = animate(homeInspection, 0, { duration: reducedMotion ? 0 : 1.1, ease: [.22, 1, .36, 1], onComplete: () => { setInspectingDevice(false); inspectionReturning.current = false; } });
  };
  const clearInspection = () => {
    inspectionTween.current?.stop();
    homeInspection.set(0);
    setInspectingDevice(false);
    inspectionReturning.current = false;
  };
  const endRotation = () => {
    orbitDragging.current = false;
    orbitResumeAt.current = performance.now() + MEMORY_ORBIT_DELAY;
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
    clearInspection();
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


  const resetView = () => {
    clearInspection();
    if (isMemory) photoJourney.reset();
    choosePose(isMemory ? MEMORY_CLOSED_POSE : DISPLAY_POSES[1]);
  };

  useEffect(() => {
    document.title = `Foldscape Memories — ${selectedMemory.title}`;
  }, [isMemory, selectedMemory.title]);

  const phase = inspectingScene ? "exploring" : autoDemo && elapsed < 0 ? "returning" : presentationState === "paused" ? "paused" : autoDemo ? "playing" : "cover";
  const photoCoverView = !inspectingDevice && isMemory && phase === "cover" && fold < .002 && Math.abs(modelRotation.x) < .1 && Math.abs(modelRotation.y) < .1 && Math.abs(modelRotation.z - 90) < .1;
  const photoRetraction = phase === "cover" ? (photoCoverView || inspectingDevice ? 0 : 1) : elapsed < 0 ? 1 : getPhotoRetraction(elapsed);
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
            modelSrc={deliveryAssets.device}
            screenSrc={SEA_SCREEN}
            coverSrc={lighthousePhoto.cover || undefined}
            coverPhotoPosition={isMemory ? photoJourney.motionPosition : undefined}
            coverPhotoActive={isMemory && photoRetraction < 1 && !overlayOpen}
            coverPhotoRetraction={photoRetraction}
            homeScale={isMemory ? homeScale : 1}
            homeInspection={homeInspection}
            homeWheel={phase === "cover" && (photoCoverView || inspectingDevice)}
            browsePhotos={photoCoverView}
            onCoverOpen={photoCoverView && photoJourney.position >= 1 && !pendingPhotoOpen ? openWithPhotograph : undefined}
            onCoverPhotoState={setCoverPhoto}
            foldEffects={!isMemory}
            foldProjection={!isMemory && pose === "foldable"}
            innerFocusFlip={pose === "tabletop"}
            screenOrientation={screenOrientation}
            screenLayoutVariant={pose === "tabletop" ? "seated" : "default"}
            depthEnabled={false}
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
            zoomScale={1}
            onZoomChange={(zoom) => {
              cancelPoseTransition();
              if (inspectingScene) orbitResumeAt.current = performance.now() + MEMORY_ORBIT_DELAY;
              else stopAutoDemo();
              commitModelZoom(zoom);
            }}
            exposure={isMemory ? 1 : 1.2}
            blur={0}
            parallax={0}
            language={language}
          />
        </FoldablePhone>;

  return (
    <main className={`app-shell view-memory ${qaView ? "qa-view" : ""}`}>
      <MemoryExperience
        ready={presentationReady} error={coverPhoto.error || (lighthousePhoto.error ? "Could not load the photograph. Please reload." : "")}
        photoJourney={photoJourney} inspectingDevice={inspectingDevice} onReturnToPhotographs={returnToPhotographs} photoCoverView={photoCoverView} coverPhoto={coverPhoto} pendingPhotoOpen={pendingPhotoOpen}
        phase={phase} playing={autoDemo} rewinding={rewinding}
        progress={Math.max(0, elapsed / MEMORY_PRESENTATION_DURATION)} fold={fold}
        onPlay={openWithPhotograph} onSeek={seekMemory} onReset={resetView}
        viewLabel={viewLabel} presets={memoryPoses.map(item => ({ id: item.id, label: POSE_LABELS.en[item.id] }))}
        onPreset={value => { clearInspection(); choosePose(memoryPoses.find(item => item.id === value)); }}
        finish={deviceFinish} onFinish={setDeviceFinish}
        autoOrbit={autoOrbit && !reducedMotion} onAutoOrbit={setAutoOrbit}
        sound={sound} onOverlayChange={setOverlayOpen}
      >{phone}</MemoryExperience>
    </main>
  );
}
