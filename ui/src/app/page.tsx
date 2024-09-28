"use client"

import { useState } from "react"

import { FileUploader } from "@/components/ui/upload"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { NodeSelector } from "@/components/ui/node"

export default function Home() {
  const [isFileUploaderOpen, setIsFileUploaderOpen] = useState(false);
  const [isDraggingFileUpload, setIsDraggingFileUpload] = useState(false);
  const [isNodeSelectorOpen, setIsNodeSelectorOpen] = useState(false);
  const [address, setAddress] = useState("");

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
     <Tabs className="w-full container mx-auto" defaultValue="upload">
      <div className="flex flex-row justify-between my-4">
        <span>qtor</span>
        <TabsList>
          <TabsTrigger value="upload" className="w-40">Upload</TabsTrigger>
          <TabsTrigger value="files" className="w-40">Files</TabsTrigger>
        </TabsList>
        <NodeSelector
          isOpen={isNodeSelectorOpen}
          setIsOpen={setIsNodeSelectorOpen}
          selected={address}
          onSelect={(node) => setAddress(node.address)}
        />
      </div>
      <TabsContent value="upload">
        <h1 className="w-fit mx-auto mt-40 text-5xl">Files for users, by users</h1>
        <div className="w-fit mx-auto my-32">
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
      </TabsContent>
     </Tabs>
  );
}
