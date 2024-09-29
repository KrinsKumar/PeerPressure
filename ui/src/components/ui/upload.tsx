import { Upload } from "lucide-react"
import { useRef } from "react"

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"

interface FileUploaderProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isDragging: boolean;
  handleDragOver: React.DragEventHandler;
  handleDragLeave: React.DragEventHandler;
  handleDrop: React.DragEventHandler;
  handleFileInput: React.ChangeEventHandler;
  isDisabled: boolean;
}

export const FileUploader = ({ isOpen, setIsOpen, isDragging, handleDragOver, handleDragLeave, handleDrop, handleFileInput, isDisabled }: FileUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button disabled={isDisabled}>
          <Upload className="mr-2 h-4 w-4" /> Upload File
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
        </DialogHeader>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? "border-primary" : "border-gray-300"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Drag and drop your file here, or click to select a file
          </p>
          <input
            hidden
            type="file"
            onChange={handleFileInput}
            id="fileInput"
            ref={fileInputRef}
          />
          <Button variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
            Select File
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
