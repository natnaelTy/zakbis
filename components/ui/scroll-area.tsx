// ScrollArea is implemented as a simple scrollable div using Tailwind CSS
// This avoids the complexity of Base UI's ScrollArea which requires additional setup

import React from "react";

interface ScrollAreaProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div 
        ref={ref}
        className={`overflow-y-auto ${className}`} 
        {...props} 
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
