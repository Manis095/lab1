import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export interface PoseAngles {
  yaw: number;
  pitch: number;
}

export interface GazeCoefficients {
  gazeLeft: number;
  gazeRight: number;
  gazeUp: number;
  gazeDown: number;
}

export interface FrameMetrics {
  yaw: number;
  pitch: number;
  gazeOffCenter: number;
}

export interface HysteresisConfig {
  onThreshold: number;
  offThreshold: number;
  minDurationMs: number;
}

export interface HysteresisState {
  active: boolean;
  startTime: number;
}

export function extractPoseAngles(esito: FaceLandmarkerResult): PoseAngles | null {
  const matrixData = esito.facialTransformationMatrixes?.[0]?.data;
  if (!matrixData) return null;

  const toDegrees = (rad: number) => (rad * 180) / Math.PI;

  const yaw = toDegrees(Math.atan2(matrixData[8], Math.hypot(matrixData[0], matrixData[4])));
  const pitch = toDegrees(Math.atan2(-matrixData[9], matrixData[10]));

  return { yaw, pitch };
}

export function extractGaze(esito: FaceLandmarkerResult): GazeCoefficients | null {
  const categories = esito.faceBlendshapes?.[0]?.categories;
  if (!categories) return null;

  const map = new Map<string, number>();
  for (const cat of categories) {
    map.set(cat.categoryName, cat.score);
  }

  const getScore = (name: string) => map.get(name) ?? 0;
  const getAvg = (name1: string, name2: string) => (getScore(name1) + getScore(name2)) / 2;

  const browRaise = Math.max(
    getScore('browInnerUp'),
    getScore('browOuterUpLeft'),
    getScore('browOuterUpRight'),
    getScore('eyeWideLeft'),
    getScore('eyeWideRight')
  );

  const rawGazeDown = getAvg('eyeLookDownLeft', 'eyeLookDownRight');
  const compensatedGazeDown = Math.max(0, rawGazeDown - browRaise * 0.45);

  return {
    gazeLeft: (getScore('eyeLookOutLeft') + getScore('eyeLookInRight')) / 2,
    gazeRight: (getScore('eyeLookInLeft') + getScore('eyeLookOutRight')) / 2,
    gazeUp: getAvg('eyeLookUpLeft', 'eyeLookUpRight'),
    gazeDown: compensatedGazeDown,
  };
}

export class NeutralCalibration {
  private samples: FrameMetrics[] = [];
  public neutral: FrameMetrics | null = null;

  public addSample(metric: FrameMetrics, targetSamples = 60): boolean {
    this.samples.push(metric);
    if (this.samples.length >= targetSamples) {
      this.neutral = {
        yaw: this.calculateMedian(this.samples.map(s => s.yaw)),
        pitch: this.calculateMedian(this.samples.map(s => s.pitch)),
        gazeOffCenter: this.calculateMedian(this.samples.map(s => s.gazeOffCenter)),
      };
      return true;
    }
    return false;
  }

  public reset(): void {
    this.samples = [];
    this.neutral = null;
  }

  public getProgress(targetSamples = 60): number {
    return Math.min(1, this.samples.length / targetSamples);
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

export class TemporalFilter {
  private emaValue: number | null = null;
  private state: HysteresisState = { active: false, startTime: 0 };

  constructor(
    private alpha: number,
    private config: HysteresisConfig
  ) {}

  public update(rawValue: number, nowMs: number): { filtered: number; active: boolean } {
    if (this.emaValue === null) {
      this.emaValue = rawValue;
    } else {
      this.emaValue += this.alpha * (rawValue - this.emaValue);
    }

    const currentVal = this.emaValue;

    if (!this.state.active && currentVal >= this.config.onThreshold) {
      const startTime = this.state.startTime || nowMs;
      if (nowMs - startTime >= this.config.minDurationMs) {
        this.state = { active: true, startTime: 0 };
      } else {
        this.state.startTime = startTime;
      }
    } else if (this.state.active && currentVal < this.config.offThreshold) {
      this.state = { active: false, startTime: 0 };
    } else if (!this.state.active && currentVal < this.config.onThreshold) {
      this.state.startTime = 0;
    }

    return { filtered: currentVal, active: this.state.active };
  }
}