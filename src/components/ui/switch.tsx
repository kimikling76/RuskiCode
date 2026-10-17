'use client';
import * as RadixSwitch from '@radix-ui/react-switch';

export function Switch({checked, onCheckedChange, id, disabled}: {checked: boolean; onCheckedChange: (value: boolean) => void; id?: string; disabled?: boolean}) {
  return (
    <RadixSwitch.Root id={id} className="rc-switch" checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}>
      <RadixSwitch.Thumb className="rc-switch-thumb" />
    </RadixSwitch.Root>
  );
}
