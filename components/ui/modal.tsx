import type { ReactNode } from "react";

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  maxWidthClassName = "max-w-2xl",
  bodyClassName = "",
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
  bodyClassName?: string;
})
{
  if (!open)
  {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-3 py-3">
      <button type="button" className="absolute inset-0" aria-label="Close modal" onClick={onClose} />
      <div className={`relative z-10 mx-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-2xl ${maxWidthClassName}`}>
        <div className="shrink-0 px-5 pb-0 pt-5">
          <h2 className="text-[20px] font-semibold leading-7 text-[var(--on-surface)]">{title}</h2>
          {description ? (
            <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">{description}</p>
          ) : null}
        </div>
        {children ? <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-3 ${bodyClassName}`}>{children}</div> : null}
        {footer ? <div className="shrink-0 px-5 pb-5 pt-0"><div className="flex flex-wrap justify-end gap-2">{footer}</div></div> : null}
      </div>
    </div>
  );
}
