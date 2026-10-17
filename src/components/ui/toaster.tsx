'use client';
import {Toaster as Sonner} from 'sonner';

/** One quiet toast at a time, bottom centre, above the composer on mobile. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      visibleToasts={1}
      offset={88}
      mobileOffset={{bottom: 96}}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'rc-toast rc-layer',
          title: 'rc-toast-title',
          description: 'rc-toast-description',
          actionButton: 'rc-toast-action',
          cancelButton: 'rc-toast-action',
        },
      }}
    />
  );
}
