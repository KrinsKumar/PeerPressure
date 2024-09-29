"use client"

import { useState } from "react"
import Image from "next/image"

import { FileUploader } from "@/components/ui/upload"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { NodeSelector } from "@/components/ui/node"
import { FileManager } from "@/components/ui/file-manager"
import shape1 from "@/images/shape-01.svg"
import shape2 from "@/images/shape-02.svg"

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
    if (mapped.length != 1) {
      return;
    }
    const fd = new FormData()
    fd.append('file', mapped[0])
    fetch(`${address}/file`, {
      method: "POST",
      body: fd,
    })
  }

  return (
     <Tabs className="w-full container mx-auto px-10" defaultValue="upload">
      <div className="flex flex-row justify-between my-4">
        <span className="grow basis-0">PeerPressure</span>
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
        <h1 className="w-fit mx-auto mt-32 text-6xl font-semibold max-w-[60rem] text-center">The best way to share and consume data</h1>
        <div className="w-fit mx-auto mt-40">
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
        <Image src={shape1} alt="" className="fixed top-0 right-0 -z-10"/>
        <Image src={shape2} alt="" className="fixed bottom-0 left-[9rem] -z-10 w-[70rem]"/>
      </TabsContent>
      <TabsContent value="files">
        <div className="mt-12">
          <FileManager/>
        </div>
      </TabsContent>
     </Tabs>
  );
}
