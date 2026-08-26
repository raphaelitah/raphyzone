import React from "react";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#5048e5] mb-4">
            <svg viewBox="0 0 100 100" className="w-7 h-7" aria-hidden="true">
              <g fill="currentColor" className="text-white">
                <rect x="14" y="42" width="8" height="16" rx="3" />
                <rect x="25" y="34" width="10" height="32" rx="4" />
                <rect x="65" y="34" width="10" height="32" rx="4" />
                <rect x="78" y="42" width="8" height="16" rx="3" />
                <rect x="35" y="46" width="30" height="8" rx="2" />
              </g>
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
