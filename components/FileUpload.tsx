
import React, { useState, useRef } from 'react';
import { UploadCloudIcon, LoadingSpinnerIcon, RefreshIcon } from './Icon';
import Button from './Button';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  guidanceText: string;
  isProcessing: boolean;
  errorMessage: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, guidanceText, isProcessing, errorMessage }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUploadClick = () => {
    if (file) {
      onFileSelect(file);
    }
  };
  
  const handleAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-4 sm:p-8 flex flex-col items-center justify-center h-full bg-gray-50 text-center">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">{guidanceText}</h2>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {!preview ? (
        <div 
          onClick={handleAreaClick}
          className="w-full max-w-md h-64 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <UploadCloudIcon className="w-16 h-16 text-gray-400 mb-4" />
          <p className="text-gray-600">Clique para selecionar um arquivo</p>
          <p className="text-sm text-gray-500">PNG, JPG, WEBP</p>
        </div>
      ) : (
        <div className="w-full max-w-md">
            <img src={preview} alt="Pré-visualização do documento" className="rounded-lg shadow-lg max-w-full max-h-64 object-contain mx-auto" />
        </div>
      )}
      
      {errorMessage && (
         <p className="text-red-500 mt-4 text-sm bg-red-100 p-3 rounded-md">{errorMessage}</p>
      )}

      <div className="flex space-x-4 mt-8">
        {preview && (
            <Button onClick={handleReset} variant="secondary" disabled={isProcessing}>
                <RefreshIcon className="w-5 h-5 mr-2"/>
                Trocar Arquivo
            </Button>
        )}
        <Button onClick={handleUploadClick} disabled={!file || isProcessing}>
          {isProcessing ? (
            <>
              <LoadingSpinnerIcon className="w-5 h-5 mr-2" />
              Validando...
            </>
          ) : 'Validar e Continuar'}
        </Button>
      </div>

    </div>
  );
};

export default FileUpload;
