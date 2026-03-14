'use client';

const STEPS = [
  { label: 'Company', path: '/setup/company' },
  { label: 'PBX', path: '/setup/pbx' },
  { label: 'Runners', path: '/setup/runners' },
  { label: 'Invite', path: '/setup/invite' },
];

interface WizardProgressProps {
  currentStep: number; // 0-based index
}

export default function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <nav className="mb-8" aria-label="Setup progress">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const isComplete = idx < currentStep;
          const isCurrent = idx === currentStep;

          return (
            <li key={step.path} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      isComplete ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                    isComplete
                      ? 'bg-blue-600 text-white'
                      : isCurrent
                        ? 'border-2 border-blue-600 text-blue-600 bg-white'
                        : 'border-2 border-gray-200 text-gray-400 bg-white'
                  }`}
                >
                  {isComplete ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      isComplete ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-xs ${
                  isCurrent
                    ? 'text-blue-600 font-medium'
                    : isComplete
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
