"use client"

import { useState } from "react"

import { FileUploader } from "@/components/ui/upload"

export default function Home() {
  const [isFileUploaderOpen, setIsFileUploaderOpen] = useState(false);
  const [isDraggingFileUpload, setIsDraggingFileUpload] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFileUpload(true);
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFileUpload(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFileUpload(false)
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
    setIsFileUploaderOpen(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      processFiles(files)
      setIsFileUploaderOpen(false);
    }
  }

  const processFiles = (files: File[]) => {
    const mapped = files.map(file => ({
      name: file.name,
      size: file.size,
    }))
    console.log(mapped)
  }

  return (
     <div className="w-full container mx-auto">
      <div className="flex flex-row justify-between my-4">
        <span>qtor</span>
        <span>Dashboard</span>
        <span>Node</span>
      </div>
      <h1 className="w-fit mx-auto mt-40 text-5xl">Files for users, by users</h1>
      <FileUploader
        isOpen={isFileUploaderOpen}
        setIsOpen={setIsFileUploaderOpen}
        isDragging={isDraggingFileUpload}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleFileInput={handleFileInput}
      />
     </div>
  );
}
