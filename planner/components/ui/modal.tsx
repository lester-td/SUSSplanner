import type { ReactNode } from "react";

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
})
{
  if (!open)
  {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <button type="button" className="absolute inset-0" aria-label="Close modal" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-2xl">
        <h2 className="text-[20px] font-semibold leading-7 text-[var(--on-surface)]">{title}</h2>
        {description ? (
          <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">{description}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
