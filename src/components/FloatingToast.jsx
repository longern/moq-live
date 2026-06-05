export function FloatingToast({ children, className = "" }) {
  return (
    <div className={`floating-toast${className ? ` ${className}` : ""}`} role="status">
      {children}
    </div>
  );
}
