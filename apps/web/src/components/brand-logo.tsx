import Image from 'next/image';

export function BrandLogo({ size = 30 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="brand-logo" style={{ width: size, height: size }}>
      <Image alt="" height={size * 2} src="/logo.png" width={size * 2} />
    </span>
  );
}
