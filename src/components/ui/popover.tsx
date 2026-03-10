"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

// cn import available if needed
// import { cn } from "./utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      style={{
        zIndex: 10000,
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '0.375rem',
        padding: '1rem',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      }}
      className={className}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
