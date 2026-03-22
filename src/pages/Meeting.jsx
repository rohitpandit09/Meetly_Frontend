import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, VideoOff, Mic, MicOff, Phone, MonitorUp, MessageSquare, Hand,
  MoreVertical, ChevronLeft, ChevronRight, Users, Timer, Bot, ClipboardList, FileText, Maximize
} from "lucide-react";

import axios from "axios";
import { io } from "socket.io-client";


const Meeting = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [activeParticipant, setActiveParticipant] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("chat");
  const [elapsed, setElapsed] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [handRaised, setHandRaised] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [timeLeft , setTimeLeft] = useState(null);  

  const [activePoll, setActivePoll] = useState(null);

  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [socket, setSocket] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [screenSharingUser, setScreenSharingUser] = useState(null);

  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = useRef(null);

  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState([]);

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center text-white">
        Loading user...
      </div>
    );
  }

  useEffect(() => {
    const timer = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        if(localStream){
          localStream.getTracks().forEach((t) => t.stop());
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);
        setCameraStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    startCamera();
  }, []);

  useEffect(() => {
  const checkMeeting = async () => {
    try {

      const res = await axios.get(
        `http://localhost:3000/api/meetings/${id}`
      );

      if (!res.data || res.data.isLive===false) {
        alert("Meeting not started yet");
        navigate(`/class/${id}`);
        return;
      }

      setMeetingData(res.data);

    } catch (error) {

      console.error("Meeting error:", error);
      navigate("/");

    } finally {

      setLoading(false);

    }
  };

  checkMeeting();
}, [id, navigate]);

useEffect(() => {
  const newSocket = io("http://localhost:3000");

  newSocket.on("all-users", (users) => {
      users.forEach(({ id }) => {
        if (id === newSocket.id) return;

      const peer = createPeer(id, newSocket);
      peersRef.current[id] = peer;

      peer.createOffer().then((offer) => {
        peer.setLocalDescription(offer);

        newSocket.emit("offer", {
          to: id,
          offer,
        });
      });
    });
  });


  newSocket.on("offer", async ({ from, offer }) => {
    const peer = createPeer(from, newSocket);

    peersRef.current[from] = peer;
    await peer.setRemoteDescription(offer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    newSocket.emit("answer", {
      to: from,
      answer,
    });
  });

  newSocket.on("answer", async ({ from, answer }) => {
    await peersRef.current[from]?.setRemoteDescription(answer);
  });

  newSocket.on("ice-candidate", ({ from, candidate }) => {
    peersRef.current[from]?.addIceCandidate(candidate);
  });

  setSocket(newSocket);

  newSocket.emit("join-room", {
    meetingCode: id,
    user: {
      name: user?.name ,
      role: user?.role,
      videoOn: true,
      audioOn: true,
    },
  });

  newSocket.on("user-joined", ({ socketId, user }) => {
    setParticipants((prev) => {
      const exists = prev.find((p) => p.id === socketId);
      if (exists) return prev;

      return [
        ...prev,
        {
          ...user,
          id: socketId,
          videoOn: true,
          audioOn: true,
        },
      ];
    });
  });

  newSocket.on("user-left", (id) => {
    setParticipants((prev) =>
      prev.filter((p) => p.id !== id)
    );

    // 🔥 REMOVE PEER
    if (peersRef.current[id]) {
      peersRef.current[id].close();
      delete peersRef.current[id];
    }

    setRemoteStreams((prev) =>
      prev.filter((s) => s.id !== id)
    );
  });

  newSocket.on("media-toggled", ({ userName, type }) => {
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.name === userName) {
          if (type === "audio") {
            return { ...p, audioOn: !p.audioOn };
          }
          if (type === "video") {
            return { ...p, videoOn: !p.videoOn };
          }
        }
        return p;
      })
    );
  });

  newSocket.on("receive-message", (msg) => {
    setChatMessages((prev) => [...prev, msg]);
  });

  newSocket.on("screen-share-started", (user) => {
    setScreenSharingUser(user);
  });

  newSocket.on("screen-share-stopped", () => {
    setScreenSharingUser(null);
  });

  newSocket.on("poll-created", (poll) => {
    setActivePoll(poll);
  });

  newSocket.on("poll-updated", (poll) => {
    setActivePoll(poll);
  });

  newSocket.on("poll-ended", (poll) => {
    setActivePoll(poll);
  });

  return () => newSocket.disconnect();
}, [id, user]);

useEffect(() => {
  if (!socket || !user) return;

  setParticipants((prev) => {
    const exists = prev.find((p) => p.name === user.name);
    if (exists) return prev;

    return [
      ...prev,
      {
        id: socket.id,
        name: user.name,
        role: user.role,
        videoOn: true,
        audioOn: true,
      },
    ];
  });
}, [socket, user]);

const handleSendChat = (e) => {
  e.preventDefault();
  if (!chatInput.trim()) return;

  const msg = {
    sender: user.name,
    text: chatInput,
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  };

  socket.emit("send-message", {
    meetingCode: id,
    message: msg,
  });

  setChatInput("");
};

useEffect(() => {
  const fetchChats = async () => {
    try {
      const res = await axios.get(
        `http://localhost:3000/api/chat/${id}`
      );

      setChatMessages(res.data);
    } catch (err) {
      console.error("Chat fetch error:", err);
    }
  };

  fetchChats();
}, [id]);

useEffect(() => {
  const fetchActivePoll = async () => {
    try {
      const res = await axios.get(
        `http://localhost:3000/api/poll/${id}`
      );

      if (res.data) {
        setActivePoll(res.data);
      }
    } catch (err) {
      console.log("No active poll");
    }
  };

  fetchActivePoll();
}, [id]);

useEffect(() => {
  if (!activePoll || !activePoll.expiresAt) return;

  const interval = setInterval(() => {
    const remaining =
      new Date(activePoll.expiresAt) - new Date();

    if (remaining <= 0) {
      setTimeLeft(0);
      clearInterval(interval);
    } else {
      setTimeLeft(Math.floor(remaining / 1000));
    }
  }, 1000);

  return () => clearInterval(interval);
}, [activePoll]);


useEffect(() => {
  if (localVideoRef.current && localStream) {
    localVideoRef.current.srcObject = localStream;
  }
}, [localStream]);

useEffect(() => {
  if (participants.length > 0 && !activeParticipant) {
    setActiveParticipant(participants[0]);
  }
}, [participants]);

    const displayParticipant =
    activeParticipant ||
    participants[0] || {
      name: user.name,
      videoOn: true,
      audioOn: true,
    };

  const isTeacher = user?.role === "teacher";
  

  const otherParticipants = participants.filter(
    (p) => p.name !== user?.name
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-white">
        Loading meeting...
      </div>
    );
  }

  

  const createPeer = (socketId, socketInstance) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    // add local stream safely
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });
    }

    // ICE
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketInstance.emit("ice-candidate", {
          to: socketId,
          candidate: event.candidate,
        });
      }
    };

  

    // remote stream
    peer.ontrack = (event) => {
      setRemoteStreams((prev) => {
        const exists = prev.find((p) => p.id === socketId);
        if (exists) return prev;
        return [...prev, { id: socketId, stream: event.streams[0] }];
      });
    };

    return peer;
  };


  const displayUser = 
    otherParticipants.length > 0 ? otherParticipants[0]
      :{name: user.name,
      videoOn: true,
      audioOn,
      isSelf: true}
  ;

  

  return (
    <div className="h-screen flex flex-col meeting-bg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 meeting-surface border-b meeting-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Video className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold meeting-text text-sm">MEETLY</span>
          <span className="text-xs meeting-text opacity-50">Meeting-id: {id}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full meeting-surface border meeting-border">
            <Timer className="w-3.5 h-3.5 meeting-text opacity-60" />
            <span className="text-sm font-mono meeting-text">{formatTime(elapsed)}</span>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 rounded-full meeting-surface border meeting-border">
            <Users className="w-3.5 h-3.5 meeting-text opacity-60" />
            <span className="text-sm meeting-text">{participants.length}</span>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col p-3 gap-3">
          {/* Active speaker */}
          <div className="flex-1 relative rounded-2xl overflow-hidden meeting-surface border meeting-border">
            <div className="absolute inset-0 flex items-center justify-center">
              {displayUser?.videoOn ? (
                displayUser?.isSelf ? (

                  screenStream ? (
                    <video
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                      ref={(video) => {
                        if (video && screenStream) {
                          video.srcObject = screenStream;
                        }
                      }}
                    />
                  ) : (
                    <video
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      ref={(video) => {
                        if (video && localStream) {
                          video.srcObject = localStream;
                        }
                      }}
                    />
                  )

                ) : (
                  // ✅ OTHER USER VIDEO (WebRTC stream)
                  remoteStreams.find((u) => u.id === displayUser?.id)?.stream ? (
                    <video
                      autoPlay
                      playsInline
                      ref={(video) => {
                        if (video) {
                          const streamObj = remoteStreams.find(
                            (u) => u.id === displayUser?.id
                          );
                          if (streamObj) video.srcObject = streamObj.stream;
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                  ): (
                    // fallback if stream not ready
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-lg">Connecting...</span>
                    </div>
                  )
                )
              ) :(
                // ❌ VIDEO OFF UI 
                <div className="w-24 h-24 rounded-full meeting-control flex items-center justify-center text-4xl font-bold meeting-text">
                  {displayUser?.name?.charAt(0) || "?"}
                </div>
              )}
            </div>
            <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg glass-dark">
              <span className="text-sm font-medium meeting-text">{displayUser?.name || 'Loading...'}</span>
              {!displayUser?.audioOn && <MicOff className="w-3.5 h-3.5 text-destructive" />}
            </div>
            <button className="absolute top-4 right-4 p-2 rounded-lg glass-dark meeting-text opacity-60 hover:opacity-100 transition-opacity">
              <Maximize className="w-4 h-4" />
            </button>
            {/* Self mini video — PiP inside active speaker area */}
            <div className="absolute bottom-4 right-4 w-36 h-24 rounded-xl meeting-surface border meeting-border overflow-hidden shadow-lg">
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
                {videoOn? (
                  <span className="text-2xl font-bold meeting-text"><video
                    
                    autoPlay
                    muted
                    playsInline
                    ref={(video=>{
                      if(video && cameraStream){
                        video.srcObject = cameraStream;
                      }
                    })}
                    className="w-full h-full object-cover rounded-lg"
                  /></span>
                ) : (
                  <VideoOff className="w-6 h-6 meeting-text opacity-40" />
                )}
              </div>
              <div className="absolute bottom-1 left-2 text-[10px] meeting-text bg-black/40 px-1.5 py-0.5 rounded">You</div>
            </div>
          </div>
          </div>

          {/* Participant strip */}
          <div className="flex gap-2 overflow-x-auto pb-1">
        {participants.map((p, index) => {

          const remote = remoteStreams.find((s) => s.id === p.id);

          return (
            <button
              key={index}
              onClick={() => setActiveParticipant(p)}
              className="flex-shrink-0 w-36 h-24 rounded-xl meeting-surface border meeting-border overflow-hidden relative group hover:border-primary/50 transition-colors"
            >
              <div className="w-full h-full flex items-center justify-center">
                
                {p.name === user.name ? (
                  // 🧑 YOUR VIDEO
                  <video
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    ref={(video) => {
                      if (video && localStream) {
                        video.srcObject = localStream;
                      }
                    }}
                  />
                ) : remote?.stream ? (
                  // 👥 OTHER USER LIVE VIDEO
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    ref={(video) => {
                      if (video) {
                        video.srcObject = remote.stream;
                      }
                    }}
                  />
                ) : (
                  // ⏳ FALLBACK
                  <span className="text-xl font-bold meeting-text opacity-40">
                    {p?.name?.charAt(0) || "?"}
                  </span>
                )}

              </div>

              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="text-[10px] meeting-text bg-black/40 px-1.5 py-0.5 rounded">
                  {p?.name || 'Unknown'}
                </span>
                {!p.audioOn && <MicOff className="w-3 h-3 text-destructive" />}
              </div>
            </button>
          );
        })}
      </div>
      

        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="meeting-surface border-l meeting-border flex flex-col overflow-hidden"
              style={{ width: 300 }}
            >
              <div className="flex gap-1 p-2 border-b meeting-border flex-shrink-0">
                {["chat", "people", "poll", "ai", "test"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${sidebarTab === tab ? "gradient-primary text-primary-foreground" : "meeting-text opacity-60 hover:opacity-100"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {sidebarTab === "chat" ? (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {chatMessages.length === 0 && <p className="text-center text-xs meeting-text opacity-40 py-8">No messages yet</p>}
                    {chatMessages.map((m, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-semibold meeting-text">{m.sender}</span>
                        <span className="meeting-text opacity-40 ml-2">{m.time}</span>
                        <p className="meeting-text opacity-80 mt-0.5">{m.text}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-2 p-3 border-t meeting-border flex-shrink-0">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send a message..."
                      className="flex-1 px-3 py-2 rounded-lg meeting-control meeting-text text-xs border meeting-border focus:outline-none"
                    />
                    <button type="submit" className="px-3 py-2 rounded-lg gradient-primary text-primary-foreground text-xs">Send</button>
                  </form>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-3">
                  {sidebarTab === "people" && (
                    <div className="space-y-2">
                      {participants.map((p, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 rounded-lg meeting-control"
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                            {p.name?.charAt(0)}
                          </div>

                          {/* Name */}
                          <span className="text-xs meeting-text flex-1">
                            {p.name}
                            {p.name === user.name && " (You)"}
                          </span>

                          {/* Role (optional but nice) */}
                          <span className="text-[10px] opacity-50">
                            {p.role === "teacher" ? "Host" : ""}
                          </span>

                          {/* Mic */}
                          {!p.audioOn && (
                            <MicOff className="w-3 h-3 text-destructive" />
                          )}

                          {/* Video */}
                          {!p.videoOn && (
                            <VideoOff className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {sidebarTab === "poll" && (
                    <div className="p-3 space-y-3">

                      {isTeacher && (!activePoll || !activePoll.isActive) && (
                        <button
                          onClick={() =>{ navigate(`/poll-create/${id}`,{
                            state :{
                              meetingCode : id,
                            
                            }

                          })
                          console.log(`Meeting Code :${meetingCode}`)
                        }
                        
                        }
                          className="px-4 py-2 rounded-lg gradient-primary text-white"
                        >
                          Create Poll
                        </button>
                      )}

                      {activePoll && (
                        <div className="flex flex-col flex-wrap bg-gray-500 rounded-lg p-3">
                          {/* QUESTION */}
                          <div className="mb-2  rounded-lg text-white">
                          
                            <p className="font-semibold text-sm text-white">
                              Question :- {activePoll.question}
                            </p>
                          </div>

                          {/* TIMER */}
                          {activePoll.isActive && timeLeft !== null && (
                            <p className="text-xs text-yellow-400 mb-2">
                              Ends in: {timeLeft}s
                            </p>
                          )}

                          {/* OPTIONS */}
                          {activePoll.options.map((opt, i) => {
                            const totalVotes = activePoll.options.reduce(
                              (sum, o) => sum + o.votes,
                              0
                            );

                            const percent = totalVotes
                              ? Math.round((opt.votes / totalVotes) * 100)
                              : 0;

                            return (
                              <div key={i} className="space-y-1">
                                <button
                                  onClick={() => {
                                    socket.emit("vote", {
                                      pollId: activePoll._id,
                                      optionIndex: i,
                                      meetingCode: id,
                                      userName: user.name,
                                    });
                                  }}
                                  disabled={
                                    !activePoll.isActive ||
                                    activePoll.voters?.includes(user.name)
                                  }
                                  className="w-full p-2 rounded bg-gray-700 text-white"
                                >
                                  {opt.text}
                                </button>

                                {!activePoll.isActive && (
                                  <>
                                    <div className="w-full bg-gray-300 h-2 rounded">
                                      <div
                                        className="bg-green-500 h-2 rounded"
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>

                                    <p className="text-xs text-white">
                                      {percent}% ({opt.votes} votes)
                                    </p>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {sidebarTab === "ai" && (
                    <div className="text-center py-8">
                      <button onClick={() => navigate("/ai-chat")} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 mx-auto">
                        <Bot className="w-4 h-4" /> Open AI Chat
                      </button>
                    </div>
                  )}
                  {sidebarTab === "test" && (
                    <div className="text-center py-8">
                      {isTeacher ? (
                        <button onClick={() => navigate("/test-create")} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium">Create Test</button>
                      ) : (
                        <p className="text-xs meeting-text opacity-40">No active tests</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      

      {/* Bottom controls */}
      <div className="h-20 meeting-surface border-t meeting-border flex items-center justify-center gap-3 px-4 relative">
        <button onClick={() => {
          if (!localStream) return;

          const track = localStream.getAudioTracks()[0];
          track.enabled = !track.enabled;

          setAudioOn(track.enabled);
        }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${audioOn ? "meeting-control meeting-control-hover" : "bg-destructive"}`}>
          {audioOn ? <Mic className="w-5 h-5 meeting-text" /> : <MicOff className="w-5 h-5 text-primary-foreground" />}
        </button>

        <button onClick={() => {
          if (!localStream) return;

          const track = localStream.getVideoTracks()[0];
          if (!track) return;

          track.enabled = !track.enabled;

          setVideoOn(track.enabled);

          socket.emit("media-toggle", {
            meetingCode: id,
            userName: user.name,
            type: "video",
          });

          
        }}className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${videoOn ? "meeting-control meeting-control-hover" : "bg-destructive"}`}>
          {videoOn ? <Video className="w-5 h-5 meeting-text" /> : <VideoOff className="w-5 h-5 text-primary-foreground" />}
        </button>
        
        <button
          onClick={async () => {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
              });

              const track = stream.getVideoTracks()[0];
              if(!track) return;

              setScreenStream(stream); // 🔥 MAIN FIX

              setScreenSharingUser({
                name: user.name,
                isSelf: true,
                videoOn: true,
                audioOn,
              });

              socket.emit("screen-share-started", {
                meetingCode: id,
                user: { name: user.name },
              });

              track.onended = () => {
                setScreenStream(null);

                socket.emit("screen-share-stopped", {
                  meetingCode: id,
                });

                setScreenSharingUser(null);
              };

            } catch (err) {
              console.error("Screen share error:", err);
            }
          }}
          className="w-12 h-12 rounded-full meeting-control meeting-control-hover flex items-center justify-center"
        >
          <MonitorUp className="w-5 h-5 meeting-text" />
        </button>
        <button onClick={() => setHandRaised(!handRaised)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${handRaised ? "bg-accent" : "meeting-control meeting-control-hover"}`}>
          <Hand className="w-5 h-5 meeting-text" />
        </button>
        <button className="w-12 h-12 rounded-full meeting-control meeting-control-hover flex items-center justify-center" onClick={() => { setSidebarOpen(!sidebarOpen); setSidebarTab("chat"); }}>
          <MessageSquare className="w-5 h-5 meeting-text" />
        </button>
        <button className="w-12 h-12 rounded-full meeting-control meeting-control-hover flex items-center justify-center" onClick={() => { setSidebarOpen(!sidebarOpen); setSidebarTab("people"); }}>
          <Users className="w-5 h-5 meeting-text" />
        </button>
        <button className="w-12 h-12 rounded-full meeting-control meeting-control-hover flex items-center justify-center">
          <MoreVertical className="w-5 h-5 meeting-text" />
        </button>
        <button onClick={async () =>{
          // await axios.delete(`http://localhost:3000/api/chat/${id}`);
          // socket.disconnect();
          navigate('/');
        }} className="w-14 h-12 rounded-full bg-destructive flex items-center justify-center hover:opacity-90 transition-all ml-4">
          <Phone className="w-5 h-5 text-primary-foreground rotate-[135deg]" />
        </button>

        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg meeting-control meeting-control-hover">
          {sidebarOpen ? <ChevronRight className="w-4 h-4 meeting-text" /> : <ChevronLeft className="w-4 h-4 meeting-text" />}
        </button>
      
    </div>
    </div>
  );
};

export default Meeting;
