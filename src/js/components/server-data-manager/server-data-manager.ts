import axios from "axios";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import { Buffer } from "buffer";

export class ServerDataManager {
  #serverURL;
  #pollingTimeout: ReturnType<typeof setTimeout>;
  #socket: any;
  #peers: any;
  constructor() {
    this.#serverURL = "http://localhost:3000/api";
    this.#peers = [];
  }

  getPeerCount() {
    return this.#peers.length;
  }

  sendToAll(data: any) {
    this.#peers.forEach((peer: any) => {
      if (peer.connected) {
        peer.peer.send(JSON.stringify({ userID: this.#socket.id, data }));
      }
    });
  }

  start() {
    //axios
    //  .get(this.#serverURL + "/initialize")
    //  .then((response) => {
    //    console.log(response.data);
    //    this.#poll(response.data.id);
    //  })
    //  .catch((error) => {
    //    console.log(error);
    //  });

    this.#socket = io("https://api.radet5.com:8000", {secure: true, rejectUnauthorized: false});
    this.#socket.emit("join room");
    this.#socket.on("all users", (users: any) => {
      //console.log(users);
      users.forEach((peerID: any) => {
        const peer = this.#createPeer(peerID, this.#socket.id);
        this.#peers.push({ peerID, peer, connected: false });
      });
    });

    this.#socket.on("user joined", (payload: any) => {
      const peer = this.#addPeer(payload.signal, payload.callerID);
      this.#peers.push({ peerID: payload.callerID, peer, connected: false });
    });

    this.#socket.on("receiving returned signal", (payload: any) => {
      const item = this.#peers.find((item: any) => item.peerID === payload.id);
      item.peer.signal(payload.signal);
    });

    this.#socket.on("user left", (id: any) => {
      const item = this.#peers.find((item: any) => item.peerID === id);
      if (item) {
        console.log("DISCONNECTED", id);
        item.peer.destroy();
      }
      this.#peers = this.#peers.filter((item: any) => item.peerID !== id);
    });
  }

  #createPeer(userToSignal: any, callerID: any) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
    });

    peer.on("signal", signal => {
      this.#socket.emit("sending signal", { userToSignal, callerID, signal });
    });

    peer.on("connect", () => {
      console.log("CONNECTED", userToSignal);
      this.#peers.forEach((peer: any) => {
        if (peer.peerID === userToSignal) {
          peer.connected = true;
        }
      });
    });

    //peer.on("data", (data:any) => console.log(data));
    peer.on("data", (data:any) => console.log(Buffer.from(data).toString()));

    return peer;
  }

  #addPeer(incomingSignal: any, callerID: any) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
    });

    peer.on("signal", signal => {
      this.#socket.emit("returning signal", { signal, callerID });
    });

    peer.on("connect", () => {
      console.log("CONNECTED", callerID);
      this.#peers.forEach((peer: any) => {
        if (peer.peerID === callerID) {
          peer.connected = true;
        }
      });
    });

    //peer.on("data", handleReceivingData);
    peer.on("data", (data:any) => console.log(Buffer.from(data).toString()));

    peer.signal(incomingSignal);
    return peer;
  }

  #poll(id: number) {
    this.#pollingTimeout = setTimeout(() => {
      axios
        .post(this.#serverURL + "/poll", { id })
        .then((response) => {
          //console.log(JSON.stringify(response.data.connections));
          //console.log(this.#peers.map((peer: any) => peer.peerID));
          this.#poll(id);
        })
        .catch((error) => {
          console.log(error);
          if (error.response.status === 408) {
            this.start();
          }
        });
    }, 5000);
  }
}
