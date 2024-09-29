// add file chunks for the database
export async function addFileChunks(client, fileHash, chunkIds) {
  console.log("Adding file chunks to redis", fileHash, chunkIds);
  client.set(fileHash, JSON.stringify(chunkIds));
  return true;
}

// get file chunks for the database
export async function getFileChunks(client, fileHash) {
  let value = await client.get(fileHash);
  return JSON.parse(value);
}
