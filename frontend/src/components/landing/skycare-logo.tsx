import Image from "next/image";

export function SkyCareMark({
  size = 36,
  className = "",
  rounded = "rounded-xl",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-[#0b0b0f] shadow-md ring-1 ring-white/15 ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/skyhouse-tech-logo.png"
        alt="SkyCare"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority={false}
      />
    </span>
  );
}

export function SkyCareLogo({
  size = 36,
  light = false,
  className = "",
}: {
  size?: number;
  light?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <SkyCareMark size={size} />
      <span
        className={`font-heading text-xl font-bold tracking-tight ${
          light ? "text-white" : "text-slate-900"
        }`}
      >
        Sky<span className="text-sky-600">Care</span>
      </span>
    </span>
  );
}
