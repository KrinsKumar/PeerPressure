# Peer Pressure
- Users can connect directly to one of the Nodes to request files. 📂
- Users can use our **NextJS frontend** to upload and search for files. 🔎
- Once users upload a file, it is split up and replicated across different Nodes. 🌐 If a Node goes down, it redistributes the chunks to ensure there are at least two copies of each chunk. 🛠️

## 🛠️ How we built it
We started by brainstorming the architecture on the whiteboard. We referenced torrents and hashes to determine the arrangement of our Nodes. With our plan, we built our app using **NodeJS** and **Express**. Our **Tracker** and **Worker Nodes** communicate via a REST API. Worker Nodes retrieve data from each other using sockets. 🔌 The Tracker keeps track of the status and location of different file chunks, including their hashes. The requesting Node then becomes a new source of chunks for other Nodes. 

One of our methods for accessing data is directly via a Node. After connecting to a Node, the user can request files directly from other Nodes. The other method is our **NextJS frontend** which communicates to our Tracker and Node via REST API. By containerizing everything, we can easily scale Nodes. 📈

**It's easier to see the gallery images rather than read the text** 🖼️

## 🚧 Challenges we ran into
Designing the architecture was a very big challenge. Even after writing it out, we frequently modified it due to limitations or oversights. Even after settling on our architecture, we encountered minor issues when integrating everything. 

Another challenge was merging everything. We initially started with everything communicating over sockets, but we switched to a REST API to allow flexibility for other programming languages with multithreading. Our Express server, Nodes, and Tracker, all in different files, had plenty of conflicts when merging. 🔀

## 🎉 Accomplishments that we're proud of
- We designed an architecture that is overbuilt for our expected Nodes. We believe it would scale decently well. ⚙️
- The Nodes rebalance very quickly when a Node goes down. ⚡
- If a Node is down or empty despite rebalancing, clients can still download from the remaining Nodes. 💾

## 📚 What we learned
- **P2P networking** and **torrenting** 💡
- The pain of merging later rather than earlier 😅
- How to design a scalable architecture 🧩

## 🚀 What's next for PeerPressure
- Improved **UI/UX** 🎨
- Different distribution of chunks and load balancing for efficiency ⚖️
