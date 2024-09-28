"use client"

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Trash2, FileText, X } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Mock data for available files
const availableFiles = [
  { id: '1', name: 'document1.pdf' },
  { id: '2', name: 'image1.jpg' },
  { id: '3', name: 'spreadsheet1.xlsx' },
  { id: '4', name: 'presentation1.pptx' },
  { id: '5', name: 'document2.pdf' },
]

// Mock function to simulate file download
const downloadFile = (file: { id: string, name: string }) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ...file, downloadedAt: new Date().toISOString() })
    }, 1000)
  })
}

export function FileManager() {
  const [downloadedFiles, setDownloadedFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)

  const onDragEnd = async (result) => {
    if (!result.destination) return

    const sourceIndex = result.source.index
    const sourceDroppableId = result.source.droppableId

    if (sourceDroppableId === 'availableFiles' && result.destination.droppableId === 'downloadedFiles') {
      const fileToDownload = availableFiles[sourceIndex]
      const downloadedFile = fileToDownload;
      setDownloadedFiles(downloadedFiles.splice(result.destination.index, 0, downloadedFile))
    }
  }

  const deleteFile = (id) => {
    setDownloadedFiles(downloadedFiles.filter(file => file.id !== id))
    if (selectedFile && selectedFile.id === id) {
      setSelectedFile(null)
    }
  }

  return (
    <div className="flex">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 p-4">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>File Manager</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 h-full">
                <Droppable droppableId="availableFiles">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                      <Card className="h-full">
                        <CardHeader>
                          <CardTitle>Available Files</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[500px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Filename</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {availableFiles.map((file, index) => (
                                  <Draggable key={file.id} draggableId={file.id} index={index}>
                                    {(provided) => (
                                      <TableRow
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        onClick={() => setSelectedFile(file)}
                                      >
                                        <TableCell>{file.name}</TableCell>
                                      </TableRow>
                                    )}
                                  </Draggable>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </Droppable>
                <Droppable droppableId="downloadedFiles">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                      <Card className="h-full">
                        <CardHeader>
                          <CardTitle>Downloaded Files</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[500px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Filename</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {downloadedFiles.map((file, index) => (
                                  <TableRow key={file.id} onClick={() => setSelectedFile(file)}>
                                    <TableCell>{file.name}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          deleteFile(file.id)
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </Droppable>
              </div>
            </CardContent>
          </Card>
        </div>
      </DragDropContext>
      {selectedFile && (
        <Card className="w-1/4 p-4">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              File Information
              <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span className="font-semibold">{selectedFile.name}</span>
              </div>
              {selectedFile.downloadedAt && (
                <div>
                  <span className="font-semibold">Downloaded at:</span> {new Date(selectedFile.downloadedAt).toLocaleString()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
