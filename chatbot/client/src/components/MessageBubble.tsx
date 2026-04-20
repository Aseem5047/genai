import { formatDateTime } from "../../utils";

export default function MessageBubble({ message }) {
    const isUser = message.sender === "user";

    const formatText = (text: string) => {
        return text
            .replace(/TITLE:(.*)/g, "\n\n$1\n")
            .replace(/SECTION:/g, "\n\n")
            .replace(/- /g, "• ");
    };

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className={`flex items-start gap-2 max-w-xs ${isUser ? "flex-row-reverse" : ""}`}>

                {/* Avatar */}
                <div className="w-8 h-8 -mt-1 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {isUser ? "U" : "AI"}
                </div>

                {/* Bubble */}
                <div
                    className={`px-4 py-2 rounded-lg text-sm whitespace-pre-line ${isUser
                        ? "bg-blue-500 text-white rounded-tr-none"
                        : "bg-gray-100 text-gray-800 rounded-tl-none"
                        }`}
                >
                    {message.isLoading ? (
                        <div className="flex gap-1">
                            <span className="animate-bounce">.</span>
                            <span className="animate-bounce delay-150">.</span>
                            <span className="animate-bounce delay-300">.</span>
                        </div>
                    ) : (
                        <p>{formatText(message.text)}</p>
                    )}

                    {!message.isLoading && (
                        <p
                            className={`text-[10px] mt-1 ${isUser ? "text-white text-left" : "text-gray-500 text-right"
                                }`}
                        >
                            {formatDateTime(message.timeStamp)}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}