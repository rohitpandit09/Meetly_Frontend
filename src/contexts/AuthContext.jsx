import React, { createContext, useContext, useState } from "react";
import axios from "axios";

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
const [user, setUser] = useState(() => {
  const storedUser = localStorage.getItem("user");
  return storedUser ? JSON.parse(storedUser) : null;
});

// ================= LOGIN =================
const login = async (email, password, role) => {

  const backendRole = role === "teacher" ? "host" : "user";

  try {

    const res = await axios.post(
      "http://localhost:3000/api/auth/login",

        {
          email,
          password,
          role: backendRole
        }
    )

    const userData = {
      ...res.data.user,
      role: res.data.user.role === "host" ? "teacher" : "student"
    };

    setUser(userData);

    // 🔥 SAVE TO LOCAL STORAGE
    localStorage.setItem("user", JSON.stringify(userData));

    
    

  } catch (error) {

    console.error(error)

  }


};

// ================= SIGNUP =================
const signup = async (name, email, password, role) => {


// convert role from frontend to backend format
const backendRole = role === "teacher" ? "host" : "user";

try {

  const res = await axios.post(
    "http://localhost:3000/api/auth/signup",
    {
      name,
      email,
      password,
      role: backendRole
    }
  );

  console.log("Signup success:", res.data);

  const userData = {
    ...res.data.user,
    role: res.data.user.role === "host" ? "teacher" : "student"
  };

  setUser(userData);
  localStorage.setItem("user", JSON.stringify(userData));

} catch (error) {

  console.error("Signup error:", error.response?.data || error);

}


};

// ================= LOGOUT ================= //
const logout = () => {
setUser(null);
localStorage.removeItem("user");
};


return (
<AuthContext.Provider
value={{
user,
login,
signup,
logout,
isAuthenticated: !!user
}}
>
{children}
</AuthContext.Provider>
);
};

// ================= HOOK =================
export const useAuth = () => {
const ctx = useContext(AuthContext);

if (!ctx) {
throw new Error("useAuth must be used within AuthProvider");
}

return ctx;
};
