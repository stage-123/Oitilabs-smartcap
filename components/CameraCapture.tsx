
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { 
  CENTER_THRESHOLD, 
  FRAME_AREA_THRESHOLD, 
  STABILITY_THRESHOLD, 
  TARGET_CLASSES,
  DETECTION_CONFIDENCE_THRESHOLD
} from '../constants';
import Button from './Button';
import { CameraIcon, SparklesIcon } from './Icon';
import { CapturedImage, DetectedObject } from '../types';

interface CameraCaptureProps {
  onCapture: (image: CapturedImage) => void;
  guidanceText: string;
  model: ObjectDetection | null;
  isLoading: boolean;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, guidanceText, model, isLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stabilityCounterRef = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const lastValidBboxRef = useRef<[number, number, number, number] | null>(null);

  const [feedback, setFeedback] = useState('Iniciando câmera...');
  const [isManualCaptureReady, setIsManualCaptureReady] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current && lastValidBboxRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const imageDataUrl = canvas.toDataURL('image/jpeg');
        onCapture({ imageDataUrl, bbox: lastValidBboxRef.current });
      }
    }
  }, [onCapture]);

  const detectFrame = useCallback(async () => {
    if (!model || !videoRef.current || videoRef.current.readyState !== 4) {
      animationFrameId.current = requestAnimationFrame(detectFrame);
      return;
    }
    
    const video = videoRef.current;
    const predictions = await model.detect(video);
    
    const validPrediction = predictions.find(p => TARGET_CLASSES.includes(p.class) && p.score > DETECTION_CONFIDENCE_THRESHOLD);

    let newFeedback = "Procurando documento...";
    let conditionsMet = false;

    if (validPrediction) {
      const { bbox } = validPrediction as DetectedObject;
      const [x, y, width, height] = bbox;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      const bboxCenterX = x + width / 2;
      const bboxCenterY = y + height / 2;
      const videoCenterX = videoWidth / 2;
      const videoCenterY = videoHeight / 2;

      const isCentered = 
        Math.abs(bboxCenterX - videoCenterX) < videoWidth * CENTER_THRESHOLD &&
        Math.abs(bboxCenterY - videoCenterY) < videoHeight * CENTER_THRESHOLD;

      const bboxArea = width * height;
      const videoArea = videoWidth * videoHeight;
      const isLargeEnough = (bboxArea / videoArea) > FRAME_AREA_THRESHOLD;

      if (!isLargeEnough) {
        newFeedback = "Aproxime-se do documento.";
      } else if (!isCentered) {
        newFeedback = "Centralize o documento na moldura.";
      } else {
        newFeedback = "Mantenha firme...";
        conditionsMet = true;
        lastValidBboxRef.current = bbox;
      }
    } else {
        newFeedback = "Certifique-se de que o documento esteja bem iluminado e totalmente visível.";
    }

    setFeedback(newFeedback);
    setIsManualCaptureReady(conditionsMet);

    if (conditionsMet) {
      stabilityCounterRef.current++;
      if (stabilityCounterRef.current >= STABILITY_THRESHOLD) {
        setFeedback("Capturando...");
        captureFrame();
        return; // Stop detection loop
      }
    } else {
      stabilityCounterRef.current = 0;
    }

    animationFrameId.current = requestAnimationFrame(detectFrame);
  }, [model, captureFrame]);

  const handleVideoMetadataLoaded = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      setIsPortrait(video.videoHeight > video.videoWidth);
    }
  }, []);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 4096 },
            height: { ideal: 2160 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera: ", err);
        setFeedback("Não foi possível acessar a câmera. Por favor, verifique as permissões.");
      }
    }

    setupCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if(animationFrameId.current){
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoading && model) {
      setFeedback("Iniciando detecção...");
      animationFrameId.current = requestAnimationFrame(detectFrame);
    }
    return () => {
      if(animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, model, detectFrame]);


  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900">
      <video ref={videoRef} onLoadedMetadata={handleVideoMetadataLoaded} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
        <div className={`border-4 border-dashed border-white/70 rounded-2xl shadow-2xl ${
            isPortrait 
              ? 'h-full max-h-[80vh] aspect-[54/85.6]' 
              : 'w-full max-w-lg aspect-[85.6/54]'
          }`} 
        />
      </div>

      {/* Guidance and Feedback */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl font-semibold mb-2 text-white">{guidanceText}</h2>
            <div className="bg-white/20 backdrop-blur-sm text-white rounded-full px-4 py-2 inline-flex items-center">
                {isLoading ? (
                    <p>Carregando Modelo...</p>
                ) : (
                    <>
                     <SparklesIcon className="w-5 h-5 mr-2 animate-pulse"/>
                     <p>{feedback}</p>
                    </>
                )}
            </div>
             <div className="mt-6">
                <Button onClick={captureFrame} variant="secondary" disabled={!isManualCaptureReady}>
                    <CameraIcon className="w-6 h-6 mr-2" />
                    Captura Manual
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
