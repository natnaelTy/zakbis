declare module "@kibo-ui/dropzone" {
  import * as React from "react";

  export interface DropzoneProps {
    accept?: Record<string, string[]>;
    maxFiles?: number;
    onDrop?: (acceptedFiles: File[]) => void;
    children?: (
      args: {
        getRootProps: (props?: any) => any;
        getInputProps: (props?: any) => any;
      }
    ) => React.ReactNode;
    className?: string;
  }

  const Dropzone: React.FC<DropzoneProps>;
  export default Dropzone;
}