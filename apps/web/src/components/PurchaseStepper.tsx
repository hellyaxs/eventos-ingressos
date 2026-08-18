import type { JSX } from 'react';

export type PurchaseStep = 1 | 2 | 3 | 4;

const STEPS: Array<{ step: PurchaseStep; label: string }> = [
  { step: 1, label: 'Evento' },
  { step: 2, label: 'Assentos' },
  { step: 3, label: 'Pagamento' },
  { step: 4, label: 'Pronto' },
];

function hrefFor(step: PurchaseStep, eventId?: string): string {
  switch (step) {
    case 1:
      return '/events';
    case 2:
      return eventId ? `/reserve?eventId=${encodeURIComponent(eventId)}` : '/reserve';
    case 3:
      return '/checkout';
    case 4:
      return '/tickets';
  }
}

export function PurchaseStepper(props: {
  current: PurchaseStep;
  eventId?: string;
}): JSX.Element {
  const { current, eventId } = props;

  return (
    <nav className="purchase-stepper" aria-label="Progresso da compra">
      {STEPS.flatMap(({ step, label }, index) => {
        const isCurrent = step === current;
        const isCompleted = step < current;
        const className = isCurrent ? 'purchase-step is-current' : 'purchase-step';
        const item = isCompleted ? (
          <a key={step} href={hrefFor(step, eventId)} className={className}>
            {label}
          </a>
        ) : (
          <span
            key={step}
            className={className}
            aria-current={isCurrent ? 'step' : undefined}
          >
            {label}
          </span>
        );

        if (index === 0) return [item];

        return [
          <span key={`sep-${step}`} className="purchase-step-sep" aria-hidden="true">
            ▸
          </span>,
          item,
        ];
      })}
    </nav>
  );
}
