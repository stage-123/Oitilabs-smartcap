
import React, { useState, useCallback, useEffect } from 'react';
import { CaptureStep, AppState, DetectedObject, CapturedImage, AnalysisResult, FraudResult } from './types';
import { CAPTURE_STEPS, CENTER_THRESHOLD, DETECTION_CONFIDENCE_THRESHOLD, FRAME_AREA_THRESHOLD, TARGET_CLASSES } from './constants';
import CameraCapture from './components/CameraCapture';
import StepIndicator from './components/StepIndicator';
import { ArrowLeftIcon, CameraIcon, CheckCircleIcon, RefreshIcon, ArrowRightIcon, LoadingSpinnerIcon, XCircleIcon, UploadCloudIcon } from './components/Icon';
import Button from './components/Button';
import useObjectDetection from './hooks/useObjectDetection';
import FileUpload from './components/FileUpload';

const OitiLogo: React.FC = () => (
  <svg className="mx-auto h-12 w-auto" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="white"/>
      <path d="M14 20C14 23.3137 16.6863 26 20 26C23.3137 26 26 23.3137 26 20" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="15" cy="16" r="1.5" fill="#38BDF8"/>
      <circle cx="25" cy="16" r="1.5" fill="#38BDF8"/>
  </svg>
);

const FormattedOcrResult: React.FC<{ result: any }> = ({ result }) => {
  if (!result?.success || !result?.data?.extracted_data) {
    // Fallback para JSON bruto se a estrutura for inesperada
    return (
      <div className="w-full max-h-64 overflow-y-auto bg-gray-100 p-4 rounded-lg text-left text-sm border">
        <h3 className="font-semibold text-gray-700 mb-2">Dados Extraídos</h3>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </div>
    );
  }

  const data = result.data.extracted_data;

  const fields = [
    { label: 'Nome', value: data.name },
    { label: 'Nº CNH', value: data.cnhNumber },
    { label: 'RG', value: data.rgNumber },
    { label: 'CPF', value: data.cpfNumber },
    { label: 'Data de Nasc.', value: data.birthDate },
    { label: 'Nome da Mãe', value: data.motherName },
  ].filter(field => field.value); // Filtra campos sem valor

  return (
    <div className="w-full max-w-md bg-gray-50 p-4 rounded-lg text-left text-sm border">
       <h3 className="font-semibold text-gray-700 mb-3 text-base">Dados Extraídos</h3>
      <ul className="space-y-3">
        {fields.map(field => (
          <li key={field.label} className="flex justify-between border-b pb-2 last:border-b-0">
            <span className="font-semibold text-gray-600">{field.label}:</span>
            <span className="text-gray-800 text-right break-all ml-2">{field.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const FraudAnalysisResult: React.FC<{ fraudResults: { front: FraudResult | null; back: FraudResult | null; } }> = ({ fraudResults }) => {
    const renderResult = (label: string, result: FraudResult | null) => {
        if (!result) {
            return (
                <div className="flex items-start">
                    <XCircleIcon className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold mr-1">{label}:</span>
                        <span>Análise indisponível.</span>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex items-start">
                {result.success ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                ) : (
                    <XCircleIcon className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                )}
                 <div>
                    <span className="font-semibold mr-1">{label}:</span>
                    <span className={result.success ? 'text-gray-800' : 'text-red-600'}>{result.message}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full max-w-md mt-6 text-left">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Verificação de Autenticidade</h2>
            <div className="bg-gray-50 p-4 rounded-lg border space-y-3 text-sm">
                {renderResult('Frente', fraudResults.front)}
                {renderResult('Verso', fraudResults.back)}
            </div>
        </div>
    );
};

// Helper functions that don't depend on component state/props can be defined outside
const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) { throw new Error('Invalid data URL'); }
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

const cropImage = (imageDataUrl: string, bbox: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageDataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const [x, y, width, height] = bbox;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject('Could not get canvas context');
            }
            ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = reject;
    });
};

const App: React.FC = () => {
  // --- STATE HOOKS ---
  const [appState, setAppState] = useState<AppState>(AppState.Intro);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<(CapturedImage | null)[]>(
    Array(CAPTURE_STEPS.length).fill(null)
  );
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [flow, setFlow] = useState<'camera' | 'upload' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // --- CUSTOM HOOKS & LOGIC HOOKS ---
  const { model, isLoading: isModelLoading } = useObjectDetection();
  
  const handleCapture = useCallback((image: CapturedImage) => {
    setCapturedImages((prev) => {
      const newImages = [...prev];
      newImages[currentStepIndex] = image;
      return newImages;
    });
    setAppState(AppState.Reviewing);
  }, [currentStepIndex]);

  useEffect(() => {
    const processImages = async () => {
        const [frontImage, backImage] = capturedImages;
        if (!frontImage || !backImage) {
            setError("Imagens do documento ausentes. Por favor, comece de novo.");
            setAppState(AppState.Finished);
            return;
        }

        try {
            const croppedFrontDataUrl = await cropImage(frontImage.imageDataUrl, frontImage.bbox);
            const croppedBackDataUrl = await cropImage(backImage.imageDataUrl, backImage.bbox);

            const frontBlob = dataUrlToBlob(croppedFrontDataUrl);
            const backBlob = dataUrlToBlob(croppedBackDataUrl);
            
            // --- OCR Promise ---
            const ocrFormData = new FormData();
            ocrFormData.append('mode', 'split');
            ocrFormData.append('front', frontBlob, 'cnh-frente.jpg');
            ocrFormData.append('back', backBlob, 'cnh-verso.jpg');

            const ocrPromise = fetch('https://la-ela-document-api-production.up.railway.app/proxy/ocr/process-file', {
                method: 'POST',
                body: ocrFormData,
            }).then(res => {
                if (!res.ok) throw new Error(`Erro na API de OCR: ${res.status}`);
                return res.json();
            });

            // --- Fraud Analysis Function and Promises ---
            const analyzeFraud = async (imageBlob: Blob): Promise<FraudResult> => {
                const fraudFormData = new FormData();
                fraudFormData.append('file', imageBlob, 'document-image.jpg');
                fraudFormData.append('analysis_type', 'all');
                fraudFormData.append('quality', '90');
                fraudFormData.append('threshold', '0.1');

                const response = await fetch('https://la-ela-document-api-production.up.railway.app/analyze/formdata', {
                    method: 'POST',
                    body: fraudFormData,
                });

                if (!response.ok) {
                    throw new Error(`Erro na API de Análise: ${response.status}`);
                }
                return response.json();
            };
            
            const fraudFrontPromise = analyzeFraud(frontBlob);
            const fraudBackPromise = analyzeFraud(backBlob);
            
            // --- Execute in Parallel ---
            const results = await Promise.allSettled([ocrPromise, fraudFrontPromise, fraudBackPromise]);

            const ocrData = results[0].status === 'fulfilled' ? results[0].value : null;
            const fraudFrontData = results[1].status === 'fulfilled' ? results[1].value : null;
            const fraudBackData = results[2].status === 'fulfilled' ? results[2].value : null;

            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
                const errorMessages = failed.map(f => (f as PromiseRejectedResult).reason.message).join('; ');
                throw new Error(errorMessages);
            }

            setAnalysisResult({
              ocr: ocrData,
              fraud: { front: fraudFrontData, back: fraudBackData },
            });

        } catch (e) {
            console.error("Falha ao processar imagens:", e);
            setError(e instanceof Error ? e.message : "Ocorreu um erro desconhecido durante o processamento.");
        } finally {
            setAppState(AppState.Finished);
        }
    };

    if (appState === AppState.Processing) {
        processImages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  useEffect(() => {
    const generateCroppedPreview = async () => {
        const currentImage = capturedImages[currentStepIndex];
        if (appState === AppState.Reviewing && currentImage) {
            try {
                const cropped = await cropImage(currentImage.imageDataUrl, currentImage.bbox);
                setCroppedPreview(cropped);
            } catch (error) {
                console.error("Failed to crop image:", error);
                setCroppedPreview(currentImage.imageDataUrl); // Fallback
            }
        } else {
            setCroppedPreview(null);
        }
    };
    generateCroppedPreview();
  }, [appState, capturedImages, currentStepIndex]);
  
  // --- CONDITIONAL LOADING RENDER ---
  if (isModelLoading) {
    return (
      <div className="min-h-screen w-screen bg-slate-100 flex flex-col items-center justify-center font-sans">
        <div className="text-center p-8">
          <div className="animate-pulse">
              <OitiLogo />
          </div>
          <h1 className="text-xl font-semibold mt-6 text-gray-700">
            Carregando e validando a segurança, aguarde...
          </h1>
          <LoadingSpinnerIcon className="w-8 h-8 text-sky-400 mt-4 mx-auto" />
        </div>
      </div>
    );
  }

  // --- HANDLERS AND HELPERS (defined after loading check) ---
  const handleStart = () => {
    setFlow('camera');
    setAppState(AppState.Capturing);
  };
  
  const handleUploadStart = () => {
    setFlow('upload');
    setAppState(AppState.Uploading);
  };

  const handleRetake = () => {
    setCapturedImages((prev) => {
      const newImages = [...prev];
      newImages[currentStepIndex] = null;
      return newImages;
    });
    setCroppedPreview(null);
    setUploadError(null);

    if (flow === 'upload') {
      setAppState(AppState.Uploading);
    } else {
      setAppState(AppState.Capturing);
    }
  };
  
  const handleNextStep = () => {
    if (currentStepIndex < 1) { // Capture steps are 0 (front) and 1 (back)
      setCurrentStepIndex(currentStepIndex + 1);
      if (flow === 'upload') {
        setAppState(AppState.Uploading);
      } else {
        setAppState(AppState.Capturing);
      }
    } else {
      // After capturing the back, move to processing
      setCurrentStepIndex(currentStepIndex + 1); // Move indicator to step 2 ('Resultado')
      setAppState(AppState.Processing);
    }
  };

  const handleReset = () => {
    setAppState(AppState.Intro);
    setCurrentStepIndex(0);
    setCapturedImages(Array(CAPTURE_STEPS.length).fill(null));
    setCroppedPreview(null);
    setAnalysisResult(null);
    setError(null);
    setFlow(null);
    setIsUploading(false);
    setUploadError(null);
  };

  const handleBack = () => {
    // If we are reviewing an image (front or back), going back means retaking it.
    if (appState === AppState.Reviewing) {
        handleRetake();
        return;
    }

    // If we are capturing/uploading the back image (step 1), go back to reviewing the front image (step 0).
    if ((appState === AppState.Capturing || appState === AppState.Uploading) && currentStepIndex === 1) {
        setCurrentStepIndex(0);
        setAppState(AppState.Reviewing);
        return;
    }

    // If we are on the first step (capturing/uploading front), go back to the intro screen.
    if ((appState === AppState.Capturing || appState === AppState.Uploading) && currentStepIndex === 0) {
        handleReset();
        return;
    }
  };

  const validateImage = async (imageDataUrl: string): Promise<{ valid: boolean; message: string; bbox: [number, number, number, number] | null }> => {
    if (!model) {
      return { valid: false, message: "O modelo de detecção não está pronto.", bbox: null };
    }

    return new Promise((resolve) => {
        const image = new Image();
        image.src = imageDataUrl;
        image.onload = async () => {
            const predictions = await model.detect(image);
            const validPrediction = predictions.find(p => TARGET_CLASSES.includes(p.class) && p.score > DETECTION_CONFIDENCE_THRESHOLD);
            
            if (!validPrediction) {
                resolve({ valid: false, message: "Nenhum documento foi detectado. Tente uma imagem mais clara ou com melhor enquadramento.", bbox: null });
                return;
            }

            const { bbox } = validPrediction as DetectedObject;
            const [x, y, width, height] = bbox;
            
            const bboxCenterX = x + width / 2;
            const bboxCenterY = y + height / 2;
            const imageCenterX = image.width / 2;
            const imageCenterY = image.height / 2;

            const isCentered = 
              Math.abs(bboxCenterX - imageCenterX) < image.width * CENTER_THRESHOLD &&
              Math.abs(bboxCenterY - imageCenterY) < image.height * CENTER_THRESHOLD;

            const bboxArea = width * height;
            const imageArea = image.width * image.height;
            const isLargeEnough = (bboxArea / imageArea) > FRAME_AREA_THRESHOLD;
            
            if (!isLargeEnough) {
                resolve({ valid: false, message: "O documento parece estar muito distante na imagem. Tente uma foto mais aproximada.", bbox });
            } else if (!isCentered) {
                resolve({ valid: false, message: "O documento não está centralizado. Tente uma foto com o documento no centro.", bbox });
            } else {
                resolve({ valid: true, message: "Documento válido.", bbox });
            }
        };
        image.onerror = () => {
            resolve({ valid: false, message: "Não foi possível carregar a imagem para validação.", bbox: null });
        };
    });
  };

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
        const imageDataUrl = reader.result as string;
        const validation = await validateImage(imageDataUrl);

        if (validation.valid && validation.bbox) {
            handleCapture({ imageDataUrl, bbox: validation.bbox });
        } else {
            setUploadError(validation.message);
        }
        setIsUploading(false);
    };
    reader.onerror = () => {
        setUploadError("Ocorreu um erro ao ler o arquivo.");
        setIsUploading(false);
    };
  };

  const currentStep: CaptureStep = CAPTURE_STEPS[currentStepIndex];

  const renderContent = () => {
    switch (appState) {
      case AppState.Intro:
        return (
          <div className="text-center p-8 flex flex-col items-center justify-center h-full">
            <h1 className="text-2xl font-bold mb-2 text-gray-800">Captura de Documento</h1>
            <p className="text-lg text-gray-600 mb-8 max-w-md">
              Use sua câmera para tirar uma foto ou envie arquivos de imagem do seu dispositivo.
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Button onClick={handleStart}>
                <CameraIcon className="w-6 h-6 mr-2" />
                Usar Câmera
              </Button>
              <Button onClick={handleUploadStart} variant="secondary">
                <UploadCloudIcon className="w-6 h-6 mr-2" />
                 Enviar Arquivos
              </Button>
            </div>
          </div>
        );
      case AppState.Capturing:
        return (
          <CameraCapture
            onCapture={handleCapture}
            guidanceText={currentStep.guidance}
            model={model}
            isLoading={isModelLoading}
          />
        );
      case AppState.Uploading:
        return (
          <FileUpload 
            onFileSelect={handleFileSelect}
            guidanceText={currentStepIndex === 0 ? 'Envie a FRENTE do documento' : 'Envie o VERSO do documento'}
            isProcessing={isUploading}
            errorMessage={uploadError}
          />
        );
      case AppState.Reviewing:
        if (!croppedPreview) return (
            <div className="text-center p-8 flex flex-col items-center justify-center h-full">
                <LoadingSpinnerIcon className="w-16 h-16 text-blue-600 mb-4" />
                <p className="text-lg text-gray-600">Processando imagem...</p>
            </div>
        );
        return (
          <div className="p-4 sm:p-6 flex flex-col items-center justify-center h-full bg-gray-50">
            <h2 className="text-2xl font-semibold mb-4 text-center text-gray-800">{`Revisar ${currentStep.label}`}</h2>
            <img src={croppedPreview} alt="Documento capturado" className="rounded-lg shadow-lg max-w-full max-h-[50vh] object-contain" />
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mt-8 w-full">
              <Button onClick={handleRetake} variant="secondary" className="w-full">
                 <RefreshIcon className="w-5 h-5 mr-2" />
                Tirar Novamente
              </Button>
              <Button onClick={handleNextStep} className="w-full">
                Confirmar e Continuar
                <ArrowRightIcon className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        );
      case AppState.Processing:
        return (
          <div className="text-center p-8 flex flex-col items-center justify-center h-full">
            <LoadingSpinnerIcon className="w-16 h-16 text-blue-600 mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-gray-800">Processando Documento</h1>
            <p className="text-lg text-gray-600">
              Aguarde um momento, estamos analisando as imagens.
            </p>
          </div>
        );
      case AppState.Finished:
        return (
          <div className="text-center p-8 flex flex-col items-center justify-center h-full">
            {error ? (
              <>
                <XCircleIcon className="w-24 h-24 text-red-500 mb-4" />
                <h1 className="text-3xl font-bold mb-4 text-gray-800">Erro no Processamento</h1>
                <p className="text-gray-600 mb-8 bg-red-100 p-4 rounded-md text-sm">{error}</p>
              </>
            ) : analysisResult ? (
              <>
                <CheckCircleIcon className="w-24 h-24 text-green-500 mb-4" />
                <h1 className="text-3xl font-bold mb-4 text-gray-800">Análise Concluída!</h1>
                <div className="space-y-6">
                  <FormattedOcrResult result={analysisResult.ocr} />
                  <FraudAnalysisResult fraudResults={analysisResult.fraud} />
                </div>
              </>
            ) : (
                <LoadingSpinnerIcon className="w-16 h-16 text-blue-600 mb-4" />
            )}
            <div className="mt-8">
              <Button onClick={handleReset}>
                Começar de Novo
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex flex-col font-sans">
        <header className="bg-sky-400 p-6 sm:p-12 text-white text-center">
            <OitiLogo />
            <h1 className="text-3xl sm:text-4xl font-bold mt-4 max-w-2xl mx-auto">A solução ideal para identificar e cadastrar seus clientes.</h1>
        </header>
      
        <main className="relative -mt-8 sm:-mt-12 z-10 p-4 flex-1">
            <div className="relative w-full max-w-lg lg:max-w-5xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{minHeight: '60vh'}}>
                
                {[AppState.Capturing, AppState.Uploading, AppState.Reviewing].includes(appState) && (
                  <button
                    onClick={handleBack}
                    className="absolute top-4 right-4 z-20 p-2 text-gray-500 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    aria-label="Voltar um passo"
                  >
                    <ArrowLeftIcon className="w-6 h-6" />
                  </button>
                )}
                
                {(appState !== AppState.Intro) && (
                  <div className="p-4 border-b border-gray-200">
                      <StepIndicator steps={CAPTURE_STEPS} currentStepIndex={currentStepIndex} />
                  </div>
                )}
                <div className="flex-1 flex flex-col justify-center">
                    {renderContent()}
                </div>
            </div>
        </main>
    </div>
  );
};

export default App;