import { useEffect, useRef, useState, RefObject } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { 
  extractPoseAngles, 
  extractGaze, 
  NeutralCalibration, 
  TemporalFilter, 
  type FrameMetrics 
} from '../utils/pose';

export interface ActiveCoefficient {
  name: string;
  score: number;
}

export interface SnapshotData {
  timestamp: string;
  delegate: 'GPU' | 'CPU';
  inferenceTimeMs: number;
  avgInferenceTimeMs: number;
  calibrated: boolean;
  isDistracted: boolean;
  yawDev: number;
  pitchDev: number;
  gazeDev: number;
  allBlendshapes: Record<string, number>;
}

export interface DistractionState {
  calibrated: boolean;
  calibrationProgress: number;
  isDistracted: boolean;
  yawDev: number;
  pitchDev: number;
  gazeDev: number;
  inferenceTimeMs: number;
  avgInferenceTimeMs: number;
  activeCoefficients: ActiveCoefficient[];
  allBlendshapes: Record<string, number>;
}

export function useRiconoscitore(
  videoRef: RefObject<HTMLVideoElement | null>, 
  attivo: boolean,
  delegate: 'GPU' | 'CPU' = 'GPU'
): DistractionState {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastTimeRef = useRef<number>(-1);
  const animFrameRef = useRef<number>(0);

  const inferenceStatsRef = useRef<{ count: number; total: number }>({ count: 0, total: 0 });

  const calibrationRef = useRef<NeutralCalibration>(new NeutralCalibration());
  
  const filterRef = useRef<TemporalFilter>(
    new TemporalFilter(0.1, { onThreshold: 1.0, offThreshold: 0.6, minDurationMs: 1200 })
  );

  const [state, setState] = useState<DistractionState>({
    calibrated: false,
    calibrationProgress: 0,
    isDistracted: false,
    yawDev: 0,
    pitchDev: 0,
    gazeDev: 0,
    inferenceTimeMs: 0,
    avgInferenceTimeMs: 0,
    activeCoefficients: [],
    allBlendshapes: {},
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!attivo) return;

    let annullato = false;
    inferenceStatsRef.current = { count: 0, total: 0 };

    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { 
            modelAssetPath: '/modelli/face_landmarker.task', 
            delegate: delegate 
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });

        if (annullato) {
          landmarker.close();
        } else {
          landmarkerRef.current = landmarker;
        }
      } catch (err) {
        console.error(`Errore inizializzazione FaceLandmarker (${delegate}):`, err);
      }
    };

    initLandmarker();

    return () => {
      annullato = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [attivo, delegate]);

  useEffect(() => {
    if (!attivo) return;

    const processFrame = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && video.readyState >= 2 && landmarker) {
        if (video.currentTime !== lastTimeRef.current) {
          lastTimeRef.current = video.currentTime;
          const nowMs = performance.now();

          const t0 = performance.now();
          const result = landmarker.detectForVideo(video, nowMs);
          const inferenceTimeMs = performance.now() - t0;

          inferenceStatsRef.current.total += inferenceTimeMs;
          inferenceStatsRef.current.count += 1;
          const avgInferenceTimeMs = inferenceStatsRef.current.total / inferenceStatsRef.current.count;

          const categories = result.faceBlendshapes?.[0]?.categories || [];
          
          const allBlendshapes: Record<string, number> = {};
          for (const cat of categories) {
            allBlendshapes[cat.categoryName] = cat.score;
          }

          const activeCoefficients = categories
            .filter(c => c.score >= 0.2)
            .map(c => ({ name: c.categoryName, score: c.score }))
            .sort((a, b) => b.score - a.score);

          const angles = extractPoseAngles(result);
          const gaze = extractGaze(result);

          if (angles && gaze) {
            const gazeOffCenter = Math.max(
              gaze.gazeLeft,
              gaze.gazeRight,
              gaze.gazeUp,
              gaze.gazeDown
            );

            const rawMetrics: FrameMetrics = {
              yaw: angles.yaw,
              pitch: angles.pitch,
              gazeOffCenter,
            };

            const cal = calibrationRef.current;

            if (!cal.neutral) {
              const isComplete = cal.addSample(rawMetrics, 60);
              const progress = cal.getProgress(60);

              if (progress !== stateRef.current.calibrationProgress) {
                setState(prev => ({
                  ...prev,
                  calibrationProgress: progress,
                  calibrated: isComplete,
                  inferenceTimeMs,
                  avgInferenceTimeMs,
                  activeCoefficients,
                  allBlendshapes,
                }));
              }
            } else {
              const yawDev = Math.abs(rawMetrics.yaw - cal.neutral.yaw);
              const pitchDev = Math.abs(rawMetrics.pitch - cal.neutral.pitch);
              const gazeDev = Math.abs(rawMetrics.gazeOffCenter - cal.neutral.gazeOffCenter);

              const combinedDistractionScore = (yawDev / 30.0) + (pitchDev / 20.0) + (gazeDev / 0.35);

              const { active: isDistracted } = filterRef.current.update(combinedDistractionScore, nowMs);

              setState(prev => ({
                ...prev,
                isDistracted,
                yawDev,
                pitchDev,
                gazeDev,
                inferenceTimeMs,
                avgInferenceTimeMs,
                activeCoefficients,
                allBlendshapes,
              }));
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [attivo, videoRef]);

  return state;
}