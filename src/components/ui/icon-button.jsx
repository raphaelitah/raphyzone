import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Secondary is the muted, icon-only edit affordance (row-level micro-actions:
// rename a field, edit a list item). Primary is the one brand-colored,
// labeled edit action a screen should have at most once (edit this whole
// section). See CLAUDE.md-adjacent discussion in Profile.jsx for the split.
const iconButtonVariants = cva(
  "inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        secondary: "text-muted-foreground/50 hover:text-muted-foreground",
        primary: "text-brand text-xs font-medium",
      },
      bare: {
        false: "p-1.5 rounded-lg",
        true: "",
      },
    },
    compoundVariants: [
      { variant: "secondary", bare: false, className: "hover:bg-muted" },
    ],
    defaultVariants: {
      variant: "secondary",
      bare: false,
    },
  }
)

/**
 * Shared edit/action icon. Renders as a `<button>` by default (hover-driven
 * color change); pass `as="span"` when it sits inside an already-clickable
 * parent that has the `group` class, so the color change follows
 * `group-hover` instead.
 */
const IconButton = React.forwardRef(function IconButton(
  { icon: Icon, label, variant, bare, as: Comp = "button", className, iconClassName, ...props },
  ref
) {
  const isInteractive = Comp === "button" || Comp === "a"
  return (
    <Comp
      ref={ref}
      className={cn(
        iconButtonVariants({ variant, bare }),
        !isInteractive && variant !== "primary" && "group-hover:text-muted-foreground",
        className
      )}
      {...props}
    >
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
      {label}
    </Comp>
  )
})

export { IconButton, iconButtonVariants }
