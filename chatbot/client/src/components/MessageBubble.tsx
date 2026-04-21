import { formatDateTime } from "../../utils";

export default function MessageBubble({ message }) {
    const isUser = message.sender === "user";

    // 🔥 Structured formatter
    const formatText = (text: string) => {
        const lines = text.split("\n");

        return lines.map((line, index) => {
            if (line.startsWith("TITLE:")) {
                return (
                    <h2 key={index} className="text-base font-semibold mb-2">
                        {line.replace("TITLE:", "").trim()}
                    </h2>
                );
            }

            if (line.startsWith("SECTION:")) {
                return (
                    <h3 key={index} className="text-sm font-medium mt-3 mb-1">
                        {line.replace("SECTION:", "").trim()}
                    </h3>
                );
            }

            if (line.startsWith("POINT:")) {
                return (
                    <li key={index} className="ml-4 list-disc">
                        {line.replace("POINT:", "").trim()}
                    </li>
                );
            }

            // fallback (normal text)
            return (
                <p key={index} className="mb-1">
                    {line}
                </p>
            );
        });
    };

    return (
        <div className={`flex first:mt-2 ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`flex items-start gap-2 w-full max-w-xs sm:max-w-md ${isUser ? "flex-row-reverse" : ""
                    }`}
            >
                {/* Avatar */}
                <div className="w-8 h-8 -mt-2 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold shrink-0">
                    {isUser ? "U" : "AI"}
                </div>

                {/* Bubble */}
                <div
                    className={`
                        px-4 py-3 rounded-xl text-sm
                        shadow-sm
                        ${isUser
                            ? "bg-blue-500 text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                        }
                    `}
                >
                    {message.isLoading ? (
                        <div className="flex gap-1">
                            <span className="animate-bounce">.</span>
                            <span className="animate-bounce delay-150">.</span>
                            <span className="animate-bounce delay-300">.</span>
                        </div>
                    ) : (
                        <div className="leading-relaxed space-y-1">
                            {formatText(message.text)}
                        </div>
                    )}

                    {/* Timestamp */}
                    {!message.isLoading && (
                        <p
                            className={`text-[10px] mt-2 ${isUser
                                ? "text-white/80 text-left"
                                : "text-gray-400 text-right"
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