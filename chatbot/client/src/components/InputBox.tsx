import { useState, type SyntheticEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Loader2 } from "lucide-react";

export default function InputBox({ onSend, loading }) {
    const [input, setInput] = useState("");

    const handleSubmit = (e: SyntheticEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        onSend(input);
        setInput("");
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-gray-200 flex gap-2 items-end"
        >
            <TextareaAutosize
                minRows={1}
                maxRows={7}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                }}
                placeholder="Ask Anything"
                disabled={loading}
                className="hover:bg-gray-50 min-h-12 flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none resize-none"
            />

            <button
                type="submit"
                disabled={loading}
                className="bg-blue-500 text-white rounded-lg flex items-center justify-center h-12 w-12 transition-all duration-300 hover:scale-95 cursor-pointer shrink-0"
            >
                {loading ? (
                    <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                    <Send className="w-5 h-5" />
                )}
            </button>
        </form>
    );
}