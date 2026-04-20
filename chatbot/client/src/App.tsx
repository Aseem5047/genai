import Navbar from "./components/Navbar";
import ChatWindow from "./components/ChatWindow";

function App() {
  return (
    <div className="h-dvh flex flex-col bg-gray-100">

      <Navbar />

      <div className="flex-1 flex">
        <ChatWindow />
      </div>

    </div>
  );
}

export default App;