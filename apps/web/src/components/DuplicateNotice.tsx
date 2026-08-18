import type { JSX } from 'react';

export type DuplicateNoticeVariant =
  | 'prepay'
  | 'approved'
  | 'rejected'
  | 'conflict'
  | 'expired';

const VARIANT_CLASS: Record<DuplicateNoticeVariant, string> = {
  prepay: 'is-info',
  approved: 'is-success',
  rejected: 'is-error',
  conflict: 'is-warning',
  expired: 'is-error',
};

function formatSeats(seats?: string[]): string {
  return (seats ?? []).filter(Boolean).join(', ');
}

function noticeCopy(variant: DuplicateNoticeVariant, seats?: string[]): string {
  const list = formatSeats(seats);
  switch (variant) {
    case 'prepay':
      return 'Cada assento só pode ser comprado uma vez. Os selecionados ficam seus após a confirmação.';
    case 'approved':
      return list
        ? `Compra confirmada. Os assentos ${list} são seus — não é possível comprar estes ingressos de novo.`
        : 'Compra confirmada. Não é possível comprar estes ingressos de novo.';
    case 'rejected':
      return 'Pagamento não concluído. Estes assentos foram liberados. Você pode tentar de novo. Assentos que você já possui continuam bloqueados.';
    case 'conflict':
      return list
        ? `Você já comprou o ingresso do assento ${list}.`
        : 'Você já comprou este ingresso.';
    case 'expired':
      return 'A reserva expirou. Os assentos voltaram ao mapa.';
  }
}

export function DuplicateNotice(props: {
  variant: DuplicateNoticeVariant;
  seats?: string[];
}): JSX.Element {
  const { variant, seats } = props;

  return (
    <p className={`duplicate-notice ${VARIANT_CLASS[variant]}`} role="status">
      {noticeCopy(variant, seats)}
    </p>
  );
}
