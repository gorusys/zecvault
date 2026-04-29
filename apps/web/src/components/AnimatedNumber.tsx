import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function AnimatedNumber({ value, decimals = 4, duration = 600, className, prefix = "", suffix = "" }: Props) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const toRef = useRef(value);

  useEffect(() => {
    fromRef.current = display;
    toRef.current = value;
    startRef.current = null;
    let raf = 0;
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(fromRef.current + (toRef.current - fromRef.current) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className={className}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}
