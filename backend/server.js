const http = require("http");
const PORT = process.env.PORT || 3000;

const server = http.createServer((request, response) => {
    const { method, url } = request;
    // ...
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end();
  });

server.listen(PORT);