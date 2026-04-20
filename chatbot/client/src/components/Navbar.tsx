export default function Navbar() {
    return (
        <nav className="w-full bg-white shadow-md px-6 py-3 flex items-center justify-between">

            {/* Left: Logo */}
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                    AI
                </div>
                <span className="font-semibold text-lg">MyChat</span>
            </div>

            {/* Right: Navigation */}
            <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
                <a href="#" className="hover:text-blue-500 transition">Home</a>
                <a href="#" className="hover:text-blue-500 transition">About</a>
                <a href="#" className="hover:text-blue-500 transition">Contact</a>

                {/* Example button (future auth) */}
                <button className="bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:scale-95 cursor-pointer transition">
                    Login
                </button>
            </div>

        </nav>
    );
}