import { useEffect } from "react";

const useSocketInstance = ({ socket, openHandler, send, url }) =>
	useEffect(() => {
		if (url) {
			socket.current = new WebSocket(url);
			socket.current.addEventListener("open", openHandler);
		}

		return () => socket.current && socket.current.close();
	}, [openHandler, send, socket, url]);

export default useSocketInstance;