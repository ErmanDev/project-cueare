export function Logo({
  size = 160,
  className = 'logo-mark',
  priority = false,
}: {
  size?: number
  className?: string
  priority?: boolean
}) {
  return (
    <img
      className={className}
      src="/logo.png"
      alt="ACSSCO Bukidnon Campus logo"
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      fetchPriority={priority ? 'high' : 'auto'}
    />
  )
}
