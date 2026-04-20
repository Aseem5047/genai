import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import InputBox from "./InputBox";
import { sendMessage } from "../services/api";

export default function ChatWindow() {
    const [messages, setMessages] = useState([
        {
            text: "Hello! How can I help you?",
            sender: "bot",
            sources: [],
            timeStamp: new Date().toISOString()
        }
    ]);

    const [loading, setLoading] = useState(false);

    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);


    const handleSend = async (text: string) => {
        const userMessage = {
            text,
            sender: "user",
            sources: [],
            timeStamp: new Date().toISOString()
        };

        setMessages((prev) => [...prev, userMessage]);
        setLoading(true);

        try {
            const response = await sendMessage(text);

            const botMessage = {
                text: response.reply,
                sender: "bot",
                sources: response.sources,
                timeStamp: new Date().toISOString()
            };

            setMessages((prev) => [...prev, botMessage]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    text: "Something went wrong. Please try again.",
                    sender: "bot",
                    sources: [],
                    timeStamp: new Date().toISOString()
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col w-full bg-white sm:max-w-md sm:mx-auto sm:my-4 sm:rounded-xl sm:shadow-lg" >
            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
                {messages.map((msg, index) => (
                    <MessageBubble key={index} message={msg} />
                ))}

                {loading && (
                    <MessageBubble
                        message={{
                            text: "Thinking...",
                            sender: "bot",
                            isLoading: true
                        }}
                    />
                )}
                <div ref={bottomRef} />
            </div>


            {/* Input pinned bottom */}
            <InputBox onSend={handleSend} loading={loading} />
        </div>
    );
}