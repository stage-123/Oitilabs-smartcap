
import { useState, useEffect } from 'react';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';

// Extend the global Window interface to include cocoSsd
declare global {
  interface Window {
    cocoSsd?: {
      load: () => Promise<ObjectDetection>;
    };
  }
}

const useObjectDetection = () => {
  const [model, setModel] = useState<ObjectDetection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadModel = async () => {
      try {
        if (window.cocoSsd) {
          const loadedModel = await window.cocoSsd.load();
          setModel(loadedModel);
        } else {
          console.error("COCO-SSD model script not loaded");
        }
      } catch (error) {
        console.error("Failed to load COCO-SSD model", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadModel();
  }, []);

  return { model, isLoading };
};

export default useObjectDetection;