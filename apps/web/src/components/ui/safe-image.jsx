export function SafeImage({ src, alt, width, height, className, priority, ...rest }) {
  void priority;
  return <img src={src} alt={alt ?? ""} width={width} height={height} className={className} loading={priority ? "eager" : "lazy"} {...rest} />;
}

export default SafeImage;
