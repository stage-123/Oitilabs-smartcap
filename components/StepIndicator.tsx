import React from 'react';
import { CaptureStep } from '../types';
import { CheckIcon } from './Icon';

interface StepIndicatorProps {
  steps: CaptureStep[];
  currentStepIndex: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStepIndex }) => {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center justify-center">
        {steps.map((step, stepIdx) => (
          <li key={step.label} className="relative flex-1">
            <div className="flex items-center text-sm font-medium">
              {stepIdx < currentStepIndex ? (
                // Completed Step
                <div className="flex items-center w-full">
                  <span className="relative z-10 flex-shrink-0 h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <CheckIcon className="w-5 h-5 text-white" />
                  </span>
                  <span className="ml-2 text-gray-700 font-medium hidden sm:inline">{step.label}</span>
                </div>
              ) : stepIdx === currentStepIndex ? (
                // Current Step
                 <div className="flex items-center w-full">
                  <span className="relative z-10 flex-shrink-0 h-8 w-8 rounded-full border-2 border-blue-600 bg-white flex items-center justify-center">
                    <span className="text-blue-600">{stepIdx + 1}</span>
                  </span>
                  <span className="ml-2 text-blue-600 font-bold hidden sm:inline">{step.label}</span>
                </div>
              ) : (
                // Upcoming Step
                 <div className="flex items-center w-full">
                  <span className="relative z-10 flex-shrink-0 h-8 w-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
                    <span className="text-gray-400">{stepIdx + 1}</span>
                  </span>
                  <span className="ml-2 text-gray-400 hidden sm:inline">{step.label}</span>
                </div>
              )}

              {/* Connector */}
              {stepIdx < steps.length - 1 ? (
                <div className="absolute top-4 left-0 w-full h-0.5 -ml-[calc(50%-1rem)]" aria-hidden="true">
                  <div className={`h-full w-full ${stepIdx < currentStepIndex ? 'bg-blue-600' : 'bg-gray-300'}`} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default StepIndicator;