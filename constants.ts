import { CaptureStep } from './types';

export const CAPTURE_STEPS: CaptureStep[] = [
  {
    label: 'Frente do Documento',
    guidance: 'Posicione a FRENTE do seu documento dentro da moldura.',
  },
  {
    label: 'Verso do Documento',
    guidance: 'Agora, posicione o VERSO do seu documento dentro da moldura.',
  },
  {
    label: 'Resultado',
    guidance: '',
  },
];

// Detection parameters
export const DETECTION_CONFIDENCE_THRESHOLD = 0.1; 
export const TARGET_CLASSES = ['book', 'cell phone']; // Using 'book' and 'cell phone' as a proxy for a document/card
export const FRAME_AREA_THRESHOLD = 0.55; // Bbox should occupy at least 40% of frame area
export const CENTER_THRESHOLD = 0.15; // Bbox center should be within 15% of frame center
export const STABILITY_THRESHOLD = 4; // Number of consecutive valid frames to trigger capture
export const SHARPNESS_THRESHOLD = 10; // Minimum sharpness variance to be considered not blurry