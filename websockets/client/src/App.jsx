import { useEffect, useState } from "react";
import io from "socket.io-client";
import "./App.css";
import Input from "./components/input";

const App = () => {
  const [score, setScore] = useState({});
  const [socket, setSocket] = useState(null);

  function handleInput(event) {
    let { name, value } = event.target;
    let currectObj = { [name]: value };
    setScore((prevScore) => ({ ...prevScore, ...currectObj }));
  }

  function sendScores() {
    if (socket && score) socket.emit("scores", score);
  }

  useEffect(() => {
    const newSocket = io("http://127.0.0.1:3000");
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to server");
    });

    newSocket.on("playerScores", (playerScores) => {
      console.log(playerScores);
    });

    return () => newSocket.close();
  }, []);

  return (
    <div>
      <h1>React Multiplayer Dashboard</h1>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <Input
          name="name"
          placeholder="Enter your name"
          handleInput={handleInput}
        />
        <Input
          name="score"
          placeholder="Enter your score"
          handleInput={handleInput}
        />
      </div>
      <button className="send-scores" onClick={sendScores}>
        Send Scores
      </button>
    </div>
  );
};

export default App;
