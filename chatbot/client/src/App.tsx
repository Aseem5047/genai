import Navbar from "./components/Navbar";
import ChatWindow from "./components/ChatWindow";

function App() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-gray-100">

      <Navbar />

      <div className="flex-1 overflow-hidden sm:py-4">
        <ChatWindow />
      </div>

    </div>
  );
}

export default App;