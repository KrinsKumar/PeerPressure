import axios from "axios";


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

// README: THE LEAST EFFICIENT PIECE OF CODE YOU WILL EVER SEE
export async function findChunksForNodeAndRedistribute(client, targetOldNodeRoute, availableNodes) {
  console.log("Finding chunks that were in node", targetOldNodeRoute);
  // Get all file keys
  const fileKeys = await client.keys("*");

  console.log("All file keys", fileKeys);

  // Map to store matches: fileId -> [chunkIds]
  const matches = new Map();

  // Iterate through each file key
  for (const fileId of fileKeys) {
    // Get and parse the file chunks directly
    let value = await client.get(fileId);
    const fileChunks = JSON.parse(value);

    // Iterate through each chunk in the file
    for (const [chunkId, nodeIds] of Object.entries(fileChunks)) {

      // Check if the targetNodeId is in the current chunk
      if (nodeIds.includes(targetOldNodeRoute)) {
        // Mutation in place, we replace the targetOldNode with a new node
        const newNode = availableNodes[Math.floor(Math.random() * availableNodes.length)];
    
        const newNodeIndex = nodeIds.indexOf(targetOldNodeRoute);

        const adjacentNodeToPullFrom = nodeIds[newNodeIndex + 1] || nodeIds[newNodeIndex - 1];

        if (!adjacentNodeToPullFrom) {
          console.error("No adjacent node to pull from, the file will be corrupted");
          continue;
        }

        try {
          const pullData = {
            actorUrl:adjacentNodeToPullFrom,
            fileId,
            chunkId,
          };
          await axios.post(`${newNode.route}/pull_chunk`, pullData, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          nodeIds[newNodeIndex] = newNode.route;
          // Add chunk Data to the actor, telling him to pull from the other url in the array
        } catch (error) {
          console.error(`Error while instructing ${newNode.route} to pull chunk ${chunkId} from ${targetOldNodeRoute}:`, error.message);
        }
      }
    }
  }

  // Convert Map to a plain object for easier use
  return Object.fromEntries(matches);
}


