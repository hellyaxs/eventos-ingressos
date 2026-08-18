import { useEffect, useRef } from 'react';

type InfiniteSentinelProps = {
  onVisible: () => void;
  disabled?: boolean;
  root?: Element | null;
  rootMargin?: string;
};

export function InfiniteSentinel({
  onVisible,
  disabled = false,
  root = null,
  rootMargin = '240px 0px',
}: InfiniteSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { root, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, disabled, root, rootMargin]);

  return <div ref={ref} className="infinite-sentinel" aria-hidden="true" />;
}
