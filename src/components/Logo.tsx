// Two rings that overlap, with the overlap filled: visual and verbal identity melded into one.
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs><clipPath id="bm-l"><circle cx="12.4" cy="16" r="7.6" /></clipPath></defs>
      <circle cx="12.4" cy="16" r="7.6" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="19.6" cy="16" r="7.6" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="19.6" cy="16" r="7.6" fill="currentColor" clipPath="url(#bm-l)" />
    </svg>
  );
}

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <Mark size={26} />
      <span className="text-[20px] font-medium" style={{ letterSpacing: "-0.5px" }}>brandmeld</span>
    </span>
  );
}
