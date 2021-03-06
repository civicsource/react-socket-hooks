import { expect } from "chai";
import behavesLikeBrowser from "./behaves-like-browser";
import mockWebSocket from "./mock-websocket";
import mockTimers from "./mock-timers";
import { renderHook, cleanup, act } from "react-hooks-testing-library";

import useSocket from "../src";

describe("Using sockets", function() {
	afterEach(cleanup);
	behavesLikeBrowser();
	mockWebSocket();
	mockTimers();

	describe("when rendering a socket hook", function() {
		let result, rerender;

		beforeEach(function() {
			const r = renderHook(({ url }) => useSocket(url), {
				initialProps: { url: "wss://api.example.com/" }
			});
			result = r.result;
			rerender = r.rerender;
		});

		it("should expose a send callback", function() {
			expect(result.current.send).to.be.a("function");
		});

		it("should not yet return websocket ready state", function() {
			expect(result.current.readyState).to.be.undefined;
		});

		describe("and then waiting for the socket to be initialized", function() {
			beforeEach(function() {
				this.clock.tick(1000);
			});

			it("should return websocket ready state", function() {
				expect(result.current.readyState).to.equal(global.WebSocket.CONNECTING);
			});

			describe("and then opening the socket", function() {
				beforeEach(function() {
					act(() => {
						this.ensureSingleSocket().triggerOpen();
					});
				});

				it("should return websocket state as open", function() {
					expect(result.current.readyState).to.equal(global.WebSocket.OPEN);
				});

				describe("and then sending a message", function() {
					beforeEach(function() {
						act(() => {
							result.current.send({ bart: "beauvoir" });
						});
					});

					it("should send the message on the socket", function() {
						expect(this.ensureSingleSocket().sentMessages[0]).to.equal(
							'{"bart":"beauvoir"}'
						);
					});
				});
			});

			describe("and then sending a message on a not-yet-open socket", function() {
				beforeEach(function() {
					act(() => {
						result.current.send({ homer: "simpson" });
						result.current.send({ bart: "beauvoir" });
					});
				});

				it("should not send messages on the socket", function() {
					expect(this.ensureSingleSocket().sentMessages).to.be.empty;
				});

				describe("and then opening the socket", function() {
					beforeEach(function() {
						act(() => {
							this.ensureSingleSocket().triggerOpen();
						});
					});

					it("should send queued messages on the socket", function() {
						const socket = this.ensureSingleSocket();
						expect(socket.sentMessages).to.have.lengthOf(2);
						expect(socket.sentMessages[0]).to.equal('{"homer":"simpson"}');
						expect(socket.sentMessages[1]).to.equal('{"bart":"beauvoir"}');
					});

					describe("and then closing the socket", function() {
						beforeEach(function() {
							this.ensureSingleSocket().sentMessages = [];

							act(() => {
								this.ensureSingleSocket().triggerClose();
							});
						});

						it("should return websocket ready state as closed", function() {
							expect(result.current.readyState).to.equal(
								global.WebSocket.CLOSED
							);
						});

						describe("and then reopening the socket", function() {
							beforeEach(function() {
								act(() => {
									this.ensureSingleSocket().triggerOpen();
								});
							});

							it("should return websocket ready state as opened", function() {
								expect(result.current.readyState).to.equal(
									global.WebSocket.OPEN
								);
							});

							it("should not send duplicate messages on the socket", function() {
								expect(this.ensureSingleSocket().sentMessages).to.be.empty;
							});
						});
					});
				});
			});
		});

		describe("and then changing the url before the socket is initialized", function() {
			beforeEach(function() {
				act(() => {
					rerender({ url: "wss://testing.example.com/" });
				});

				this.clock.tick(1000);
			});

			it("should only open one socket with the new URL", function() {
				expect(this.ensureSingleSocket().url).to.equal(
					"wss://testing.example.com/"
				);
			});
		});

		describe("and then changing the url after the socket is initialized", function() {
			beforeEach(function() {
				this.clock.tick(1000);

				act(() => {
					rerender({ url: "wss://testing.example.com/" });
				});
			});

			it("should not yet close the current socket", function() {
				expect(this.sockets).to.have.lengthOf(1);

				expect(this.sockets[0].url).to.equal("wss://api.example.com/");
				expect(this.sockets[0].readyState).to.equal(
					global.WebSocket.CONNECTING
				);
			});

			describe("and then waiting a bit", function() {
				beforeEach(function() {
					this.clock.tick(1000);
				});

				it("should close current socket and open new one", function() {
					expect(this.sockets).to.have.lengthOf(2);

					expect(this.sockets[0].url).to.equal("wss://api.example.com/");
					expect(this.sockets[0].readyState).to.equal(global.WebSocket.CLOSED);

					expect(this.sockets[1].url).to.equal("wss://testing.example.com/");
					expect(this.sockets[1].readyState).to.equal(
						global.WebSocket.CONNECTING
					);
				});

				describe("and then sending messages", function() {
					let socket;

					beforeEach(function() {
						act(() => {
							result.current.send({ homer: "simpson" });
							result.current.send({ bart: "beauvoir" });

							socket = this.sockets[1];
							socket.triggerOpen();
						});
					});

					it("should send the messages on the socket", function() {
						expect(socket.sentMessages).to.have.lengthOf(2);
						expect(socket.sentMessages[0]).to.equal('{"homer":"simpson"}');
						expect(socket.sentMessages[1]).to.equal('{"bart":"beauvoir"}');
					});
				});
			});

			describe("and then changing the URL back to the original one", function() {
				beforeEach(function() {
					act(() => {
						rerender({ url: "wss://api.example.com/" });
					});

					this.clock.tick(1000);
				});

				it("should not open any new sockets", function() {
					expect(this.sockets).to.have.lengthOf(1);
				});

				it("should keep the one socket to the original URL open", function() {
					expect(this.sockets[0].url).to.equal("wss://api.example.com/");
					expect(this.sockets[0].readyState).to.equal(
						global.WebSocket.CONNECTING
					);
				});
			});
		});
	});

	describe("when rendering a socket hook with a message handler", function() {
		let socketSink;

		beforeEach(function() {
			renderHook(() => {
				const { useMessageHandler, ...result } = useSocket(
					"wss://api.example.com/"
				);

				useMessageHandler(message => {
					socketSink = message;
				});

				return result;
			});
		});

		describe("and then receiving a message", function() {
			beforeEach(function() {
				this.clock.tick(1000);

				act(() => {
					this.ensureSingleSocket().triggerMessage({ foo: "bar" });
				});
			});

			it("should call `onMessage` handler", function() {
				expect(socketSink).to.deep.equal({ foo: "bar" });
			});
		});
	});

	describe("when rendering a socket hook with no URL", function() {
		beforeEach(function() {
			renderHook(() => useSocket());

			this.clock.tick(1000);
		});

		it("should not initialize any socket", function() {
			expect(this.sockets).to.be.empty;
		});
	});
});
