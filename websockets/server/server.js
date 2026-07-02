import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
  },
});

let playerScores = [];

io.on("connection", (socket) => {
  //   console.log(io);

  socket.on("scores", (scores) => {
    playerScores.push({ ...scores, id: socket.id });
    console.log(scores);

    socket.emit("playerScores", playerScores);

    setInterval(() => {
      socket.emit("playerScores", playerScores);
    }, 5000);
  });
});

httpServer.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
