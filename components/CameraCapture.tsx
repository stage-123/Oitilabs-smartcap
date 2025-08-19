
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { 
  CENTER_THRESHOLD, 
  FRAME_AREA_THRESHOLD, 
  STABILITY_THRESHOLD, 
  TARGET_CLASSES,
  DETECTION_CONFIDENCE_THRESHOLD,
  SHARPNESS_THRESHOLD
} from '../constants';
import { SparklesIcon, LoadingSpinnerIcon } from './Icon';
import { CapturedImage, DetectedObject } from '../types';

interface CameraCaptureProps {
  onCapture: (image: CapturedImage) => void;
  model: ObjectDetection | null;
  isLoading: boolean;
}

const calculateSharpness = (imageData: ImageData): number => {
    const { width, height, data } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    let laplacianSum = 0;
    let pixelCount = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const center = gray[y * width + x];
            const top = gray[(y - 1) * width + x];
            const bottom = gray[(y + 1) * width + x];
            const left = gray[y * width + (x - 1)];
            const right = gray[y * width + (x + 1)];
            
            const laplacianValue = 4 * center - (top + bottom + left + right);
            laplacianSum += laplacianValue * laplacianValue;
            pixelCount++;
        }
    }
    
    if (pixelCount === 0) return 0;
    return laplacianSum / pixelCount;
};

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, model, isLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stabilityCounterRef = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const collectedFramesRef = useRef<{ imageDataUrl: string; bbox: [number, number, number, number]; sharpness: number; }[]>([]);

  const [feedback, setFeedback] = useState('Iniciando câmera...');
  const [isPortrait, setIsPortrait] = useState(false);
  const [frameColor, setFrameColor] = useState('border-white/70');
  const [isCapturing, setIsCapturing] = useState(false);

  // Dynamically calculate the visual frame dimension based on the area threshold.
  // The dimension (width or height) is the square root of the area.
  const frameSidePercentage = Math.round(Math.sqrt(FRAME_AREA_THRESHOLD) * 100);

  const detectFrame = useCallback(async () => {
    if (!model || !videoRef.current || videoRef.current.readyState !== 4) {
      if (animationFrameId.current !== null) {
        animationFrameId.current = requestAnimationFrame(detectFrame);
      }
      return;
    }
    
    const video = videoRef.current;

    const predictions = await model.detect(video);
    const validPrediction = predictions.find(p => TARGET_CLASSES.includes(p.class) && p.score > DETECTION_CONFIDENCE_THRESHOLD);

    let feedbackMessage = "Procurando documento...";
    let frameIsValid = false;
    let color = 'border-white/70';
    
    if (validPrediction) {
      color = 'border-orange-400'; // Document detected, but not yet validated
      const { bbox } = validPrediction as DetectedObject;
      const [x, y, width, height] = bbox;
      
      const sharpnessCanvas = document.createElement('canvas');
      sharpnessCanvas.width = width;
      sharpnessCanvas.height = height;
      const sharpnessCtx = sharpnessCanvas.getContext('2d');
      
      if (sharpnessCtx) {
        sharpnessCtx.drawImage(video, x, y, width, height, 0, 0, width, height);
        const imageData = sharpnessCtx.getImageData(0, 0, width, height);
        const sharpness = calculateSharpness(imageData);

        if (sharpness < SHARPNESS_THRESHOLD) {
            feedbackMessage = "Imagem embaçada. Firme a câmera.";
        } else {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          const bboxCenterX = x + width / 2;
          const bboxCenterY = y + height / 2;
          const videoCenterX = videoWidth / 2;
          const videoCenterY = videoHeight / 2;
          const isCentered = Math.abs(bboxCenterX - videoCenterX) < videoWidth * CENTER_THRESHOLD && Math.abs(bboxCenterY - videoCenterY) < videoHeight * CENTER_THRESHOLD;
          const bboxArea = width * height;
          const videoArea = videoWidth * videoHeight;
          const isLargeEnough = (bboxArea / videoArea) > FRAME_AREA_THRESHOLD;

          if (!isLargeEnough) {
            feedbackMessage = "Aproxime-se do documento.";
          } else if (!isCentered) {
            feedbackMessage = "Centralize o documento na moldura.";
          } else {
            feedbackMessage = "Mantenha firme...";
            frameIsValid = true;
            color = 'border-green-400 animate-pulse'; // All checks passed

            if (isCapturing) {
                const canvas = canvasRef.current!;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext('2d')!;
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const imageDataUrl = canvas.toDataURL('image/jpeg');
                
                collectedFramesRef.current.push({
                    imageDataUrl,
                    bbox: bbox,
                    sharpness: sharpness,
                });
            }
          }
        }
      } else {
        feedbackMessage = "Não foi possível analisar a nitidez.";
      }
    } else {
        feedbackMessage = "Certifique-se de que o documento esteja bem iluminado e totalmente visível.";
    }

    if (!isCapturing) {
        setFeedback(feedbackMessage);
        setFrameColor(color);

        if (frameIsValid) {
            stabilityCounterRef.current++;
            if (stabilityCounterRef.current >= STABILITY_THRESHOLD) {
                setIsCapturing(true);
                collectedFramesRef.current = [];

                setTimeout(() => {
                    if (animationFrameId.current) {
                        cancelAnimationFrame(animationFrameId.current);
                        animationFrameId.current = null;
                    }

                    const frames = collectedFramesRef.current;
                    if (frames.length > 0) {
                        const bestFrame = frames.reduce((best, current) => 
                            current.sharpness > best.sharpness ? current : best
                        );
                        onCapture({ imageDataUrl: bestFrame.imageDataUrl, bbox: bestFrame.bbox });
                    } else {
                        setFeedback("Captura falhou. Por favor, tente novamente.");
                        setIsCapturing(false);
                        stabilityCounterRef.current = 0;
                        animationFrameId.current = requestAnimationFrame(detectFrame);
                    }
                }, 2000);
            }
        } else {
            stabilityCounterRef.current = 0;
        }
    }

    if (animationFrameId.current !== null) {
        animationFrameId.current = requestAnimationFrame(detectFrame);
    }
  }, [model, onCapture, isCapturing]);

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
        animationFrameId.current = null;
      }
    };
  }, [isLoading, model, detectFrame]);


  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900 overflow-hidden">
      <video ref={videoRef} onLoadedMetadata={handleVideoMetadataLoaded} autoPlay playsInline muted className="w-full h-full object-contain" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="relative shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] rounded-2xl"
          style={
            isPortrait
              ? { height: `${frameSidePercentage}%`, aspectRatio: '54 / 85.6' }
              : { width: `${frameSidePercentage}%`, aspectRatio: '85.6 / 54' }
          }
        >
          <div className={`absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 ${frameColor} rounded-tl-2xl transition-colors duration-300`}></div>
          <div className={`absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 ${frameColor} rounded-tr-2xl transition-colors duration-300`}></div>
          <div className={`absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 ${frameColor} rounded-bl-2xl transition-colors duration-300`}></div>
          <div className={`absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 ${frameColor} rounded-br-2xl transition-colors duration-300`}></div>
        </div>
      </div>

      {isCapturing && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
            <LoadingSpinnerIcon className="w-16 h-16 text-white" />
            <p className="text-white text-lg font-semibold mt-4">Capturando, aguarde...</p>
        </div>
      )}

      {!isCapturing && (
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent text-center">
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
        </div>
      )}
    </div>
  );
};

export default CameraCapture;