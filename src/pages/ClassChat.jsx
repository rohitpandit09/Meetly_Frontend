import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useClasses } from "@/contexts/ClassContext";
import { motion } from "framer-motion";
import { Send, Pin, Users, Bell, BookOpen, Video, Copy, Check } from "lucide-react";
import axios from "axios";
import { useEffect } from "react";
import {io} from "socket.io-client";
import { useRef } from "react";

const ClassChat = () => {
  const { id } = useParams();
  const { user } = useAuth(); 
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const [copied, setCopied] = useState(false);

  const [classData, setClassData] = useState(null);
  const [meetingStarted, setMeetingStarted] = useState(false);

  
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isNoticeMode, setIsNoticeMode] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);

  const [noticeText, setNoticeText] = useState("");
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadNotices, setUnreadNotices] = useState(0);

 useEffect(() => {
  const newSocket = io("https://meetly-backend-1.onrender.com", {
    transports: [ "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    forceNew : true
  });

  socketRef.current = newSocket;


  newSocket.on("disconnect", () => {
    console.log("❌ Socket disconnected");
  });

  // VERY IMPORTANT
  

  newSocket.on("connect", () => {
    console.log("✅ Socket connected:", newSocket.id);

    // 🔥 ALWAYS REJOIN
    newSocket.emit("join-dashboard", {
      meetingCode: id,
      user: {
        name: user?.name,
        role: user?.role,
      },
    });
  });

  // 🔥 ALSO HANDLE RECONNECT
  newSocket.on("reconnect", () => {
    console.log("♻️ Reconnected");

    newSocket.emit("join-dashboard", {
      meetingCode: id,
      user: {
        name: user?.name,
        role: user?.role,
      },
    });
  });

  //  USERS UPDATE
  newSocket.on("dashboard-users", (users) => {
    console.log("Received users:", users);
    setParticipants(users);
  });

  

  // MEETING START EVENT (OUTSIDE CONNECT)
  newSocket.on("meeting-started", ({ meetingCode }) => {
    console.log("Meeting started received");
    
    setMeetingStarted(true);
    
    if (user.role === "teacher") {
      navigate(`/meeting/${meetingCode}`);
    }
    
  });

  


  //  CHAT
  newSocket.on("receive-message", (msg) => {
    
      setMessages((prev) => [...prev, msg]);
    
  });

  return () => newSocket.disconnect();
}, []);

  
  useEffect(() => {

      const fetchClass = async () => {

        try {

          const res = await axios.get(
            `https://meetly-backend-1.onrender.com/api/meetings/${id}`
          );

          setMessages(res.data.messages || []);

          setClassData(res.data);

        } catch (error) {

          console.error("Error loading class:", error);

        }

      };

      fetchClass();

    }, [id]);

    

  if (!user) { navigate("/login"); return null; }
  if (!classData) return (
    <div className="min-h-screen flex items-center justify-center bg-background pt-16">
      <p className="text-muted-foreground">Class not found. Check the invite code or create a new class.</p>
    </div>
  );

  const isTeacher = user.role === "teacher";

const handleSend = async (e) => {
  e.preventDefault();
  if (!message.trim()) return;

  const msg = {
    sender: user.name,
    role: user.role,
    content: message,
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isNotice: false,
  };

  // ✅ save in DB
  await axios.post("https://meetly-backend-1.onrender.com/api/meetings/message", {
    meetingCode: id,
    message: msg,
  });

  // ✅ send via socket
  socketRef.current.emit("send-message", {
    meetingCode: id,
    message: msg,
  });

  setMessage("");
};

  const handlePostNotice = async () => {
  if (!noticeText.trim()) return;

  const notice = {
    sender: user.name,
    role: "teacher",
    content: noticeText,
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isNotice: true,
  };

  await axios.post("https://meetly-backend-1.onrender.com/api/meetings/message", {
    meetingCode: id,
    message: notice,
  });

  socketRef.current.emit("send-message", {
    meetingCode: id,
    message: notice,
  });

  setNoticeText("");
};

  const copyCode = () => {
    navigator.clipboard.writeText(classData.meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const notices = messages.filter((m) => m?.isNotice === true);
  const onlineCount = classData.members?.filter((m) => m.online).length || 0;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-4">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="bg-card rounded-2xl border border-border p-5 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">{classData.className}</h1>
              <p className="text-sm text-muted-foreground mt-1">{classData.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> {participants.length} members · {participants.filter(p => p.online).length} online
                </span>
                <button onClick={copyCode} className="text-xs flex items-center gap-1 text-primary hover:underline">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : classData.meetingCode}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {isTeacher  && (
                <button
                  onClick={() => {

                    console.log('Button Clicked');
                    if (!socketRef.current || !socketRef.current.connected) {
                      alert("Socket not connected yet. Please wait...");
                      return;
                    }

                    socketRef.current.emit("start-meeting", {
                      meetingCode: classData.meetingCode
                    });

                    
                  }}
                  className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 flex items-center gap-2"
                >
                  <Video className="w-4 h-4" /> Start Meeting
                </button>
              )}

              {!isTeacher && meetingStarted && (
                <button
                  onClick={() => navigate(`/meeting/${classData.meetingCode}`)}
                  className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:opacity-90 flex items-center gap-2"
                >
                  <Video className="w-4 h-4" /> Join Meeting
                </button>
              )}
              <button onClick={() => navigate(`/classroom/${classData.id}`)} className="px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Classroom
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
            {["chat", "notices", "members"].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);

                  if (tab === "chat") setUnreadChat(0);
                  if (tab === "notices") setUnreadNotices(0);
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {tab === "chat" && "💬 "}
                {tab === "notices" && "📢 "}
                {tab === "members" && "👥 "}
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ height: "calc(100vh - 340px)" }}>
            {activeTab === "chat" && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg,index) => (
                    <div key={index} className={`flex flex-col ${msg.sender === user.name ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        msg.isNotice ? "bg-accent/20 border border-accent/30" : msg.sender === user.name ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold opacity-80">{msg.sender}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${msg.role === "teacher" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {msg.role}
                          </span>
                          {msg.isPinned && <Pin className="w-3 h-3 text-accent" />}
                          {msg.isNotice && <Bell className="w-3 h-3 text-accent" />}
                        </div>
                        <p className="text-sm">{msg.content}</p>
                        <span className="text-[10px] opacity-60 mt-1 block">{msg.time}</span>
                      </div>
                      {isTeacher && (
                        <button onClick={() => togglePin(classData.id, msg.id)} className="text-[10px] text-muted-foreground hover:text-primary mt-1 px-2">
                          {msg.isPinned ? "Unpin" : "Pin"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSend} className="p-4 border-t border-border flex gap-2">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                  />
                  {isTeacher && (
                    <button
                      type="button"
                      onClick={() => setShowNoticeModal(true)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
                        isNoticeMode ? "bg-red-500 text-white" : "bg-accent"
                      }`}
                    >
                      📢
                    </button>
                  )}

                  <button type="submit" className="px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {activeTab === "notices" && (
              <div className="p-4 space-y-3 overflow-y-auto h-full">
                {notices.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No notices yet</p>
                ) : notices.map((n,index) => (
                  <div key={index} className="p-4 rounded-xl bg-accent/10 border border-accent/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Bell className="w-4 h-4 text-accent" />
                      <span className="text-sm font-semibold text-foreground">{n.sender}</span>
                      <span className="text-xs text-muted-foreground">{n.time}</span>
                    </div>
                    <p className="text-sm text-foreground">{n.content}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "members" && (
              <div className="p-4 space-y-2 overflow-y-auto h-full">
                {participants.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">
                    No members yet
                  </p>
                ) : (
                  participants.map((m, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                            {m?.name?.charAt(0) || "?"}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card bg-green-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {m.name} {m.name === user.name && "(You)"}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {m.role}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600">
                        Online
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
      {showNoticeModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-card p-6 rounded-2xl w-[400px] border border-border">
      <h2 className="text-lg font-bold mb-3 text-foreground">
        Create Notice
      </h2>

      <textarea
        value={noticeText}
        onChange={(e) => setNoticeText(e.target.value)}
        placeholder="Enter your notice..."
        className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none mb-4"
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setShowNoticeModal(false)}
          className="px-4 py-2 rounded-lg bg-muted text-foreground"
        >
          Cancel
        </button>

        <button
          onClick={() => {
            handlePostNotice();
            setShowNoticeModal(false);
          }}
          className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground"
        >
          Send Notice
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default ClassChat;
