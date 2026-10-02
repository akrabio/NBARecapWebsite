"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

// Bottom sheet on phones, centered dialog from lg up. Radix handles focus
// trapping, Escape and scroll locking.
export default function Sheet({ open, onOpenChange, title, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-[var(--scrim)] animate-fade-in" />
        <DialogPrimitive.Content
          dir="rtl"
          aria-describedby={undefined}
          className="fixed z-[81] inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-[20px] bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl animate-sheet-up outline-none
            lg:inset-x-auto lg:bottom-auto lg:top-[10vh] lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:rounded-[18px] lg:animate-fade-in"
        >
          <div className="mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
          <DialogPrimitive.Title className="px-[18px] pt-1.5 pb-1 text-[15px] font-extrabold">
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
