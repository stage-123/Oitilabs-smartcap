
export enum AppState {
  Intro = 'INTRO',
  Capturing = 'CAPTURING',
  Uploading = 'UPLOADING',
  Reviewing = 'REVIEWING',
  Processing = 'PROCESSING',
  Finished = 'FINISHED',
}

export interface CaptureStep {
  label: string;
  guidance: string;
}

// Corresponds to the output from coco-ssd model
export interface DetectedObject {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

export interface CapturedImage {
  imageDataUrl: string;
  bbox: [number, number, number, number];
}

export interface FraudResult {
  success: boolean;
  message: string;
}

export interface AnalysisResult {
  ocr: any;
  fraud: {
    front: FraudResult | null;
    back: FraudResult | null;
  };
}
