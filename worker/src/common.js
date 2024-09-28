const chunk = (data, size) => {
  const chunks = [];
  
  for (let i = 0; i < data.length; i += size) {
    chunks.push(data.slice(i, i + size));
  }
  
  return chunks;
}

module.exports = { chunk } ;
