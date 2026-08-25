import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef(({ className, value, defaultValue, ...props }, ref) => {
  const raw = value ?? defaultValue ?? [];
  const thumbs = Array.isArray(raw) ? raw : [raw];
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      value={value}
      defaultValue={defaultValue}
      {...props}>
      <SliderPrimitive.Track
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {thumbs.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            "block h-4 w-4 rounded-full border shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            i === 0
              ? "border-brand bg-brand"
              : "border-foreground bg-foreground"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }